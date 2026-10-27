-- Phase 2E — roommate profile photos.
--
-- Mirrors the listing-image design: the bucket is private, the database stores
-- an object path (never a URL), and readers get short-lived signed URLs through
-- Storage RLS. Additive only.

alter table public.roommate_profiles
  add column avatar_path text;

comment on column public.roommate_profiles.avatar_path is
  'Phase 2E: object path in the private roommate-avatars bucket (demo/<name>.jpg or <user_id>/<file>). Never a full URL.';

alter table public.roommate_profiles
  add constraint roommate_profiles_avatar_path_length
    check (avatar_path is null or char_length(btrim(avatar_path)) between 3 and 512),
  add constraint roommate_profiles_avatar_path_is_path
    check (
      avatar_path is null
      or (avatar_path !~ '^/' and avatar_path !~* '^[a-z][a-z0-9+.-]*://')
    );

-- Read-only for clients: the path is public-safe, but nobody can point their
-- profile at an arbitrary object until the photo-upload flow ships with its own
-- checked write path. Seeded demo photos and future uploads set this value
-- through the trusted backend.
grant select (avatar_path) on table public.roommate_profiles to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roommate-avatars',
  'roommate-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if (select b.public from storage.buckets b where b.id = 'roommate-avatars') then
    raise exception 'roommate-avatars bucket must be private';
  end if;
end;
$$;

-- A signed URL can only be minted for an avatar referenced by a discoverable
-- profile, so an anonymous reader cannot enumerate the bucket. Hiding a profile
-- also revokes the ability to sign its photo.
drop policy if exists roommate_avatars_read_discoverable on storage.objects;

create policy roommate_avatars_read_discoverable
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'roommate-avatars'
    and exists (
      select 1
      from public.roommate_profiles p
      where p.avatar_path = storage.objects.name
        and p.is_discoverable
    )
  );

-- No client INSERT/UPDATE/DELETE policy on storage.objects for this bucket:
-- uploads run through the trusted backend until the upload UI exists.
