-- Phase 2B — private, publication-aware storage for listing photographs.
--
-- The bucket is PRIVATE. Access is not governed by object URLs: every read,
-- upload, update and delete is checked against the database by SECURITY DEFINER
-- helpers that inspect the listing, its provider eligibility, its publication
-- state and its administrative visibility.
--
-- Object paths are strictly:
--   listing-images/<provider_id>/<listing_id>/<file>
--
-- Access model:
--   * anon/students: read only objects with a listing_images row whose listing
--     is currently publicly visible (published + approved provider + visible);
--   * managing providers: read their own objects (any status, for drafts and
--     rejected-provider access) and write only listings they manage;
--   * administrators: read and delete any object for moderation;
--   * unlinked/orphan objects are readable only by their provider path owner and
--     administrators, never publicly, and can be cleaned up by admins/service.
--
-- No real property images or sensitive documents are uploaded by this migration.
-- Provider identity/verification documents must never use this bucket.
--
-- Storage object writes are also audited for the hold review revision: replacing
-- bytes at the same path must invalidate a prior administrator review.

-- Refuse to install object policies that would be inert. Supabase enables RLS on
-- storage.objects by default; fail loudly instead of assuming it. This check
-- runs before the bucket mutation so a non-transactional migration cannot leave
-- a half-applied bucket change.
do $$
begin
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'storage.objects'::regclass
  ) then
    raise exception 'storage.objects must have row level security enabled before listing image policies can protect the bucket';
  end if;
end;
$$;

-- Correct an incompatible existing bucket instead of silently preserving it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      name = excluded.name,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if (select b.public from storage.buckets b where b.id = 'listing-images') then
    raise exception 'listing-images bucket must be private';
  end if;
end;
$$;

-- Remove policies/helpers from the superseded public-bucket design if this
-- branch ever applied it. These are no-ops on a fresh project.
drop policy if exists listing_images_bucket_public_read on storage.objects;
drop policy if exists listing_images_bucket_provider_insert on storage.objects;
drop policy if exists listing_images_bucket_provider_update on storage.objects;
drop policy if exists listing_images_bucket_provider_delete on storage.objects;
drop function if exists public.is_approved_provider_folder(text);

-- Public read: only images whose listing is currently publicly visible.
create policy listing_images_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'listing-images'
    and public.is_public_listing_image(name)
  );

-- A provider can read their own listing's objects, including drafts, hidden
-- listings and objects uploaded while the listing is rejected.
create policy listing_images_provider_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'listing-images'
    and public.is_own_listing_image(name)
  );

-- Administrators can inspect any object for moderation.
create policy listing_images_admin_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'listing-images'
    and public.is_admin()
  );

-- Only an approved provider managing the listing can upload into that listing's
-- path. Path parsing rejects malformed, traversal and cross-provider paths.
create policy listing_images_provider_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and public.can_manage_listing_image(name)
  );

-- USING limits which objects may be replaced; WITH CHECK stops a move into
-- another provider's listing path.
create policy listing_images_provider_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and public.can_manage_listing_image(name)
  )
  with check (
    bucket_id = 'listing-images'
    and public.can_manage_listing_image(name)
  );

create policy listing_images_provider_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and public.can_manage_listing_image(name)
  );

-- Administrators can remove unlawful or unsafe objects.
create policy listing_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Restrictive guards for listing-images
-- ---------------------------------------------------------------------------
--
-- Supabase policies are additive: a permissive policy from another feature can
-- otherwise grant access to listing-images that the policies above did not
-- intend. These restrictive policies are ANDed with every permissive policy.
-- The `bucket_id is distinct from 'listing-images'` arm leaves unrelated buckets
-- untouched, so a broad avatar/document policy continues to work for its own
-- bucket and cannot silently widen listing-image access.

create policy listing_images_restrict_anon_select
  on storage.objects
  as restrictive
  for select
  to anon
  using (
    bucket_id is distinct from 'listing-images'
    or public.is_public_listing_image(name)
  );

create policy listing_images_restrict_user_select
  on storage.objects
  as restrictive
  for select
  to authenticated
  using (
    bucket_id is distinct from 'listing-images'
    or public.is_public_listing_image(name)
    or public.is_own_listing_image(name)
    or public.is_admin()
  );

create policy listing_images_restrict_anon_insert
  on storage.objects
  as restrictive
  for insert
  to anon
  with check (bucket_id is distinct from 'listing-images');

create policy listing_images_restrict_anon_update
  on storage.objects
  as restrictive
  for update
  to anon
  using (bucket_id is distinct from 'listing-images')
  with check (bucket_id is distinct from 'listing-images');

create policy listing_images_restrict_anon_delete
  on storage.objects
  as restrictive
  for delete
  to anon
  using (bucket_id is distinct from 'listing-images');

create policy listing_images_restrict_user_insert
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id is distinct from 'listing-images'
    or public.can_manage_listing_image(name)
  );

create policy listing_images_restrict_user_update
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (
    bucket_id is distinct from 'listing-images'
    or public.can_manage_listing_image(name)
  )
  with check (
    bucket_id is distinct from 'listing-images'
    or public.can_manage_listing_image(name)
  );

create policy listing_images_restrict_user_delete
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (
    bucket_id is distinct from 'listing-images'
    or public.can_manage_listing_image(name)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Storage-object serialization for listing images
-- ---------------------------------------------------------------------------
--
-- storage.objects rows do not carry listing_id, so the listing-image row
-- triggers cannot cover an in-place object replacement or an object-only
-- add/remove. This BEFORE trigger parses the old/new path, locks the parent
-- listing row(s) in UUID order, and only then lets the Storage mutation proceed.
-- admin_restore_listing() takes the same listing lock first, so a Storage write
-- either commits before restoration (and invalidates the reviewed revision) or
-- waits until restoration commits. The existing AFTER audit trigger below
-- updates the content revision while that lock is still held.
--
-- Orphan or malformed objects have no listing row to lock. They are allowed to
-- remain non-public; Storage RLS is still the authorisation boundary.
create function public.storage_objects_lock_listing_image_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_listing_id uuid;
  new_listing_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.bucket_id <> 'listing-images' then
      return new;
    end if;
    new_listing_id := public.listing_image_listing_id(new.name);
  elsif tg_op = 'UPDATE' then
    -- Return early for updates that cannot touch listing-image paths. This
    -- keeps the trigger inert for unrelated buckets and avoids touching OLD on
    -- INSERT. Access-tracking updates must not lock every image upload/read
    -- path or invalidate a review; the AFTER audit trigger applies the same
    -- last_accessed_at exception.
    if old.bucket_id <> 'listing-images' and new.bucket_id <> 'listing-images' then
      return new;
    end if;
    if (to_jsonb(old) - 'last_accessed_at') = (to_jsonb(new) - 'last_accessed_at') then
      return new;
    end if;
    if old.bucket_id = 'listing-images' then
      old_listing_id := public.listing_image_listing_id(old.name);
    end if;
    if new.bucket_id = 'listing-images' then
      new_listing_id := public.listing_image_listing_id(new.name);
    end if;
  else
    if old.bucket_id <> 'listing-images' then
      return old;
    end if;
    old_listing_id := public.listing_image_listing_id(old.name);
  end if;

  if old_listing_id is not null and new_listing_id is not null
     and old_listing_id <> new_listing_id then
    perform 1
    from public.listings l
    where l.id in (old_listing_id, new_listing_id)
    order by l.id
    for update;
  elsif old_listing_id is not null then
    perform 1
    from public.listings l
    where l.id = old_listing_id
    for update;
  elsif new_listing_id is not null then
    perform 1
    from public.listings l
    where l.id = new_listing_id
    for update;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.storage_objects_lock_listing_image_parent()
  from public, anon, authenticated;

create trigger storage_objects_lock_listing_image_parent
  before insert or update or delete on storage.objects
  for each row
  execute function public.storage_objects_lock_listing_image_parent();

-- ---------------------------------------------------------------------------
-- Storage-object audit for listing images
-- ---------------------------------------------------------------------------
--
-- Replacing the bytes at the same object path does not touch listing_images, so
-- the row trigger alone would miss an image replacement. Storage object
-- inserts, replacements and removals in this bucket therefore bump the same
-- content revision and write a public-safe marker event. No address details or
-- private metadata are copied into the event.
create function public.storage_objects_record_listing_image_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_listing_id uuid;
  new_listing_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.bucket_id = 'listing-images' then
      new_listing_id := public.listing_image_listing_id(new.name);
      if new_listing_id is not null then
        perform public.record_listing_content_change(
          new_listing_id, array['image_storage']
        );
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    -- Storage may update access metadata (for example last_accessed_at) without
    -- changing the object. Do not invalidate a hold review for that noise.
    if (to_jsonb(old) - 'last_accessed_at') = (to_jsonb(new) - 'last_accessed_at') then
      return new;
    end if;

    if old.bucket_id = 'listing-images' then
      old_listing_id := public.listing_image_listing_id(old.name);
    end if;
    if new.bucket_id = 'listing-images' then
      new_listing_id := public.listing_image_listing_id(new.name);
    end if;

    if old_listing_id is not null then
      perform public.record_listing_content_change(
        old_listing_id, array['image_storage']
      );
    end if;
    if new_listing_id is not null and new_listing_id is distinct from old_listing_id then
      perform public.record_listing_content_change(
        new_listing_id, array['image_storage']
      );
    end if;
    return new;
  else
    if old.bucket_id = 'listing-images' then
      old_listing_id := public.listing_image_listing_id(old.name);
      if old_listing_id is not null then
        perform public.record_listing_content_change(
          old_listing_id, array['image_storage']
        );
      end if;
    end if;
    return old;
  end if;
end;
$$;

revoke all on function public.storage_objects_record_listing_image_change()
  from public, anon, authenticated;

create trigger storage_objects_record_listing_image_change
  after insert or update or delete on storage.objects
  for each row
  execute function public.storage_objects_record_listing_image_change();
