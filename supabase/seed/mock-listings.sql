-- QUARTERS — mock listings seed.
--
-- Run this once in the Supabase SQL editor (project owner / service role) to
-- create a demo provider and six published mock rooms. It is intentionally
-- separate from supabase/migrations: it is content, not schema.
--
-- What it creates:
--   * a dedicated non-login auth user for the demo provider;
--   * one approved demo provider (through a provider_reviews row, so the
--     authorisation history stays consistent);
--   * six published listings across Akoka, Yaba, Ikeja, Surulere and Gbagada.
--
-- Rent follows how Nigerian landlords actually let: per year for rooms, flats
-- and houses, per academic session for hostel beds. There are no monthly rates.
--
-- All rows use the fixed d0000000-… UUID block and the provider name
-- "QUARTERS Demo Listings". The future admin screen can identify the whole set
-- by that provider id. To remove it later, delete the listings first, then the
-- reviews/provider, then optionally the demo auth user:
--
--   delete from public.listings
--    where provider_id = 'd0000000-0000-4000-8000-000000000002';
--   delete from public.providers
--    where id = 'd0000000-0000-4000-8000-000000000002';
--   delete from auth.users
--    where id = 'd0000000-0000-4000-8000-000000000001';
--
-- The seed is idempotent: rerunning it does not duplicate rows. It deliberately
-- does not overwrite existing listing content, so an administrator's later
-- hide/archive action is preserved.
--
-- Photographs: every demo room carries a catalogue of four photographs in the
-- private listing-images bucket — <provider_id>/<listing_id>/cover.jpg plus
-- gallery-1..3.jpg — with matching public.listing_images rows (position 0 is
-- the cover, 1-3 the gallery). Storage objects cannot be created from SQL, so
-- upload them with scripts/upload-demo-photos.mjs before running this file.
-- The app resolves the objects to short-lived signed URLs; anonymous readers
-- can sign only publicly visible listings.

-- Dedicated demo owner. This account is not intended for sign-in.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'demo-listings@quarters.local',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"QUARTERS Demo Listings"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into public.providers (id, owner_id, kind, display_name)
values (
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000001',
  'agent',
  'QUARTERS Demo Listings'
)
on conflict (id) do nothing;

-- Approval goes through the normal review trigger. reviewed_by is null because
-- this is seeded content rather than a real administrator decision.
insert into public.provider_reviews (provider_id, decision, provider_note)
select
  'd0000000-0000-4000-8000-000000000002'::uuid,
  'approved'::public.provider_status,
  'Seeded demo provider for the Phase 2C/2D mock catalogue.'
where not exists (
  select 1
  from public.provider_reviews
  where provider_id = 'd0000000-0000-4000-8000-000000000002'
);

insert into public.listings (
  id,
  provider_id,
  title,
  description,
  accommodation_type,
  institution,
  city,
  neighbourhood,
  rent_amount,
  currency,
  rent_period,
  availability_status,
  bedrooms,
  bathrooms,
  furnishing_status,
  total_rooms,
  rent_session_months,
  facilities,
  property_rules,
  publication_status
)
values
  (
    'd0000000-0000-4000-8000-000000000101',
    'd0000000-0000-4000-8000-000000000002',
    'Sunlit self-contained in Akoka',
    'A bright self-contained studio five minutes from the University of Lagos gate, with a private kitchenette and steady water.',
    'self_contained',
    'University of Lagos',
    'Lagos',
    'Akoka',
    850000.00,
    'NGN',
    'year',
    'available',
    1,
    1,
    'furnished',
    6,
    null,
    array['Wi-Fi', 'Water', '24/7 power', 'Security'],
    array['No smoking', 'Quiet hours after 10pm'],
    'published'
  ),
  (
    'd0000000-0000-4000-8000-000000000102',
    'd0000000-0000-4000-8000-000000000002',
    'Quiet private room in Yaba',
    'A calm private room in a small shared flat, walking distance from the Yaba tech cluster and major bus routes.',
    'private_room',
    'University of Lagos',
    'Lagos',
    'Yaba',
    550000.00,
    'NGN',
    'year',
    'available',
    1,
    1,
    'semi_furnished',
    4,
    null,
    array['Wi-Fi', 'Water', 'Kitchen access'],
    array['Shared kitchen', 'No overnight guests'],
    'published'
  ),
  (
    'd0000000-0000-4000-8000-000000000103',
    'd0000000-0000-4000-8000-000000000002',
    'Shared apartment near Yaba tech hub',
    'A two-bedroom shared apartment with a study corner, backup power and a secure compound near frequent bus routes.',
    'shared_room',
    'University of Lagos',
    'Lagos',
    'Yaba',
    350000.00,
    'NGN',
    'year',
    'limited',
    2,
    1,
    'furnished',
    5,
    null,
    array['Wi-Fi', 'Water', 'Backup power', 'Security'],
    array['Shared cleaning roster', 'No smoking'],
    'published'
  ),
  (
    'd0000000-0000-4000-8000-000000000104',
    'd0000000-0000-4000-8000-000000000002',
    'Student hostel bed in Ikeja',
    'A furnished hostel bed with a study room, shared bathrooms and overnight security close to Lagos State University.',
    'hostel',
    'Lagos State University',
    'Lagos',
    'Ikeja',
    250000.00,
    'NGN',
    'term',
    'available',
    null,
    2,
    'furnished',
    12,
    9,
    array['Wi-Fi', 'Water', 'Security', 'Study room'],
    array['Visitor hours 8am-8pm'],
    'published'
  ),
  (
    'd0000000-0000-4000-8000-000000000105',
    'd0000000-0000-4000-8000-000000000002',
    'Self-contained studio in Surulere',
    'A compact self-contained studio with a prepaid meter, private bathroom and enough space for a study desk.',
    'self_contained',
    'University of Lagos',
    'Lagos',
    'Surulere',
    700000.00,
    'NGN',
    'year',
    'available',
    1,
    1,
    'semi_furnished',
    3,
    null,
    array['Wi-Fi', 'Water', 'Prepaid meter'],
    array['No pets'],
    'published'
  ),
  (
    'd0000000-0000-4000-8000-000000000106',
    'd0000000-0000-4000-8000-000000000002',
    'Shared room in Gbagada',
    'A budget-friendly shared room in a quiet compound with water storage, a shared kitchen and gated access.',
    'shared_room',
    'University of Lagos',
    'Lagos',
    'Gbagada',
    300000.00,
    'NGN',
    'year',
    'limited',
    2,
    1,
    'unfurnished',
    12,
    null,
    array['Water', 'Security'],
    array['Shared kitchen'],
    'published'
  )
on conflict (id) do nothing;

-- Phase 2D refresh. The inserts above use `on conflict do nothing`, so a room
-- that was already seeded keeps its original row. This block fills the newer
-- Phase 2D fields (room count and rent session length) on the demo set only, and
-- only where it has not been set yet. It needs the Phase 2D migration
-- (20261024120000_add_rooms_sessions_and_viewing_requests.sql) applied first,
-- and it never touches real providers' listings.
update public.listings
set total_rooms = 12,
    rent_period = 'term',
    rent_amount = 250000.00,
    rent_session_months = 9
where id = 'd0000000-0000-4000-8000-000000000104'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and rent_session_months is null;

update public.listings set total_rooms = 6
where id = 'd0000000-0000-4000-8000-000000000101'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and total_rooms is null;

update public.listings set total_rooms = 4
where id = 'd0000000-0000-4000-8000-000000000102'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and total_rooms is null;

update public.listings set total_rooms = 5
where id = 'd0000000-0000-4000-8000-000000000103'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and total_rooms is null;

update public.listings set total_rooms = 3
where id = 'd0000000-0000-4000-8000-000000000105'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and total_rooms is null;

update public.listings set total_rooms = 12
where id = 'd0000000-0000-4000-8000-000000000106'
  and provider_id = 'd0000000-0000-4000-8000-000000000002'
  and total_rooms is null;

-- Rent-term refresh. Earlier versions of this seed quoted the demo rooms at a
-- monthly rate, which is not how Nigerian landlords let. Every demo room is now
-- yearly, except the Ikeja hostel bed which is per 9-month session. These
-- updates only touch the demo provider, so a real provider's rent is never
-- rewritten.
update public.listings as listings
set rent_period = 'year',
    rent_amount = refreshed.rent_amount
from (
  values
    ('d0000000-0000-4000-8000-000000000101'::uuid, 850000.00::numeric),
    ('d0000000-0000-4000-8000-000000000102'::uuid, 550000.00::numeric),
    ('d0000000-0000-4000-8000-000000000103'::uuid, 350000.00::numeric),
    ('d0000000-0000-4000-8000-000000000105'::uuid, 700000.00::numeric),
    ('d0000000-0000-4000-8000-000000000106'::uuid, 300000.00::numeric)
) as refreshed(id, rent_amount)
where listings.id = refreshed.id
  and listings.provider_id = 'd0000000-0000-4000-8000-000000000002';

update public.listings
set rent_period = 'term',
    rent_amount = 250000.00,
    rent_session_months = 9
where id = 'd0000000-0000-4000-8000-000000000104'
  and provider_id = 'd0000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Photo catalogue
-- ---------------------------------------------------------------------------
-- Each demo room carries four photographs so the listing reads as a catalogue
-- rather than a single cover: position 0 is the cover and positions 1-3 are the
-- gallery. The objects live in the private listing-images bucket at
-- <provider_id>/<listing_id>/{cover,gallery-1,gallery-2,gallery-3}.jpg and are
-- uploaded by scripts/upload-demo-photos.mjs. `on conflict do nothing` leaves a
-- cover row an administrator already edited untouched on a rerun.

-- ON CONFLICT cannot arbitrate the deferrable (listing_id, position) constraint,
-- so the idempotence check is an explicit NOT EXISTS instead.
insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover)
select
  photo.listing_id::uuid,
  photo.storage_path::text,
  photo.alt_text::text,
  photo.position::smallint,
  photo.is_cover::boolean
from (values
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000101/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000101/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000101/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000101/gallery-3.jpg', 'Interior photo 4', 3, false),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000102/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000102/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000102/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000102/gallery-3.jpg', 'Interior photo 4', 3, false),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000103/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000103/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000103/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000103/gallery-3.jpg', 'Interior photo 4', 3, false),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000104/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000104/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000104/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000104/gallery-3.jpg', 'Interior photo 4', 3, false),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000105/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000105/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000105/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000105/gallery-3.jpg', 'Interior photo 4', 3, false),
  ('d0000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000106/cover.jpg', 'Cover photo', 0, true),
  ('d0000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000106/gallery-1.jpg', 'Interior photo 2', 1, false),
  ('d0000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000106/gallery-2.jpg', 'Interior photo 3', 2, false),
  ('d0000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000106/gallery-3.jpg', 'Interior photo 4', 3, false)
) as photo(listing_id, storage_path, alt_text, position, is_cover)
where not exists (
  select 1
  from public.listing_images existing
  where existing.storage_path = photo.storage_path::text
     or (
       existing.listing_id = photo.listing_id::uuid
       and existing.position = photo.position::smallint
     )
);
