-- Account management: a profile photo and self-service account deletion.
--
-- 1. Profile photo.
--    A private `avatars` bucket. A photo lives at "<user_id>/avatar-<time>.<ext>";
--    that object path (never a URL) is stored in profiles.avatar_url and read
--    back through short-lived signed URLs, matching every other media bucket in
--    this project. Any signed-in student may read a photo — it is meant to be
--    seen on roommate cards and in chat — but only its owner may write their own
--    folder. A trigger repeats that path rule for profiles.avatar_url, so a
--    client cannot point its profile at somebody else's object.
--
-- 2. Account deletion.
--    Deleting an auth user needs privileges a client session does not have, so
--    it is a SECURITY DEFINER RPC with an explicit typed confirmation. Every
--    public table references auth.users with `on delete cascade`, so removing
--    the user removes their profile, roommate data, saved rooms, messages,
--    provider application and photos. The one refusal is a paid booking: those
--    payment rows and receipts belong to the other members of the group too, so
--    the account must leave/cancel the booking first.
--
-- Additive: it creates a bucket, policies, a trigger and one function. It does
-- not touch existing rows.

-- ---------------------------------------------------------------------------
-- Profile photo storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      name = excluded.name,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if (select b.public from storage.buckets b where b.id = 'avatars') then
    raise exception 'avatars bucket must be private';
  end if;
end;
$$;

-- Signed-in students can sign a URL for any account photo.
drop policy if exists avatars_read_authenticated on storage.objects;
create policy avatars_read_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars');

-- Writes stay inside the caller's own folder: avatars/<user_id>/<file>.
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The column holds a bucket path (or, for legacy rows, an absolute URL). An
-- account may only point at its own folder.
create or replace function public.enforce_own_profile_avatar_path()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.avatar_url is not null
     and new.avatar_url not like 'http%'
     and new.avatar_url not like new.id::text || '/%' then
    raise exception 'avatar_url must live under your own account folder'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_own_avatar_path on public.profiles;

create trigger profiles_own_avatar_path
  before insert or update of avatar_url on public.profiles
  for each row
  execute function public.enforce_own_profile_avatar_path();

revoke all on function public.enforce_own_profile_avatar_path() from public, anon, authenticated;

comment on column public.profiles.avatar_url is
  'Object path in the private avatars bucket ("<user_id>/<file>"), or an absolute URL for legacy rows. Never a bucket-public URL.';

-- ---------------------------------------------------------------------------
-- Self-service account deletion
-- ---------------------------------------------------------------------------

create or replace function public.delete_own_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;

  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm account deletion.' using errcode = '22023';
  end if;

  -- A paid share is another student's booking evidence as much as yours, so it
  -- must be cancelled/left before the account can go.
  if exists (
    select 1
    from public.booking_group_members m
    join public.booking_groups g on g.id = m.group_id
    where m.user_id = caller
      and m.paid_at is not null
      and g.status <> 'cancelled'
  ) then
    raise exception 'Your room booking is still on record. Cancel or leave the booking first, then delete your account.'
      using errcode = 'P0001';
  end if;

  -- Best-effort cleanup of this account's own photo objects. A leftover file is
  -- never a reason to keep the account, and byte cleanup is Storage's job.
  begin
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = caller::text;
  exception when others then
    null;
  end;

  -- Ownership of any other uploaded object (chat photos) becomes anonymous so
  -- the auth-user foreign key cannot block the deletion.
  begin
    update storage.objects
    set owner_id = null
    where owner_id::text = caller::text;
  exception when others then
    null;
  end;

  delete from auth.users where id = caller;

  if not found then
    raise exception 'That account no longer exists.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.delete_own_account(text) is
  'Phase 2N: deletes the caller''s auth user (and cascaded public rows) after an explicit DELETE confirmation. Refuses while a paid booking is open.';

revoke all on function public.delete_own_account(text) from public, anon;
grant execute on function public.delete_own_account(text) to authenticated;
