-- Roommate photos: owners may upload their own avatar.
--
-- The bucket existed from the start, but the path column was read-only and no
-- client could write objects, which is why photos could only be seeded. This
-- opens exactly one folder per account: storage.objects rows under
-- "<user_id>/…", and roommate_profiles.avatar_path for the owner only.
--
-- Additive. Curated rows (user_id NULL, "demo/…" paths) are untouched.

grant update (avatar_path) on table public.roommate_profiles to authenticated;
grant insert (avatar_path) on table public.roommate_profiles to authenticated;

-- An owner may only point their profile at a photo inside their own folder.
create or replace function public.enforce_own_avatar_path()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.avatar_path is not null
     and new.user_id is not null
     and new.avatar_path not like new.user_id::text || '/%' then
    raise exception 'avatar_path must live under your own account folder'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists roommate_profiles_own_avatar_path on public.roommate_profiles;

create trigger roommate_profiles_own_avatar_path
  before insert or update of avatar_path, user_id on public.roommate_profiles
  for each row
  execute function public.enforce_own_avatar_path();

revoke all on function public.enforce_own_avatar_path() from public, anon, authenticated;

-- Storage: read/write only inside the caller's own folder. The existing
-- discoverable read policy still lets other students' browsers sign photos.
drop policy if exists roommate_avatars_read_own on storage.objects;
create policy roommate_avatars_read_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'roommate-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists roommate_avatars_insert_own on storage.objects;
create policy roommate_avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'roommate-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists roommate_avatars_update_own on storage.objects;
create policy roommate_avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'roommate-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'roommate-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists roommate_avatars_delete_own on storage.objects;
create policy roommate_avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'roommate-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
