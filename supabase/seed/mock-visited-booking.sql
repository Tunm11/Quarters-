-- QUARTERS — mock-up: an already-visited property, ready to book or pay for.
--
-- Run after 20261025280000_allow_booking_after_completed_visit.sql and the
-- other mock seeds. Content, not schema.
--
-- Two demos come out of this file:
--
--   1. Student hostel bed in Ikeja (…0104) — the visit is already in the past,
--      so the page offers "Book this room". Ada is now a real connected
--      roommate, so she can be picked in the Book together sheet.
--   2. Shared room in Gbagada (…0106) — the visit was completed six days ago
--      (seeded by mock-visits.sql) and a fully paid group booking for Room 3
--      already exists: ₦150,000 each. The demo provider approved the hold, so
--      the page shows the finished handshake: paid, approved, room held.
--
-- The old mock connection points at a curated profile with no account behind
-- it, so it can never join a booking. Ada gets a real profile here.
--
-- Idempotent: fixed UUIDs plus `on conflict do nothing`. To replay the payment
-- demo after tapping "Pay my share":
--
--   delete from public.booking_groups
--   where id = 'f9000000-0000-4000-8000-000000000001';
--   delete from public.listing_room_bookings
--   where listing_id = 'd0000000-0000-4000-8000-000000000106'::uuid
--     and room_number = 3;
--
-- then run this file again. Remove the mock-up entirely with:
--
--   delete from public.booking_groups
--   where id::text like 'f9000000-%';
--   delete from public.roommate_interests
--   where profile_id = 'e0000000-0000-4000-8000-000000000007'::uuid;
--   delete from public.roommate_profiles
--   where id = 'e0000000-0000-4000-8000-000000000007'::uuid;

-- 1. A real discovery profile for the second demo account, so a connection can
--    become a booking member.
insert into public.roommate_profiles (
  id,
  user_id,
  display_name,
  headline,
  institution,
  city,
  neighbourhood,
  budget_amount,
  currency,
  move_in_date,
  bio,
  is_discoverable,
  gender
)
select
  'e0000000-0000-4000-8000-000000000007'::uuid,
  account.id,
  'Ada M.',
  '200 level Architecture · tidy, sociable',
  'University of Lagos',
  'Lagos',
  'Akoka',
  150000.00,
  'NGN',
  date '2026-11-30',
  'Architecture student looking to split rent around Akoka or Gbagada. I keep the shared spaces clean and I am usually out during the day.',
  true,
  'female'
from auth.users as account
where lower(account.email) = 'ada.mock@quarters.local'
on conflict (id) do update
  set user_id = excluded.user_id,
      display_name = excluded.display_name;

-- 2. Ada is a verified roommate. Discovery only shows profiles whose owner is
--    verified, so without this row her profile stays invisible over RLS even
--    though the connection exists.
insert into public.roommate_verifications (
  user_id,
  full_name,
  phone,
  institution,
  study_level,
  city,
  neighbourhood,
  gender,
  answers,
  tidy_score,
  sleep_score,
  social_score,
  guest_score,
  routine_score
)
select
  account.id,
  'Ada Mock',
  '+234 803 555 0142',
  'University of Lagos',
  '200',
  'Lagos',
  'Akoka',
  'female',
  jsonb_build_object(
    'about_you',
    'Second year Architecture student. I keep shared spaces clean, study late at the library and go home most weekends.',
    'why_roommate',
    'Rent in Akoka is easier to manage when it is split with someone reliable from the same campus.'
  ),
  4.20,
  4.00,
  4.50,
  3.80,
  4.10
from auth.users as account
where lower(account.email) = 'ada.mock@quarters.local'
on conflict (user_id) do nothing;

-- 3. The demo student is connected to Ada.
insert into public.roommate_interests (profile_id, sender_id, status)
select
  profile.id,
  account.id,
  'accepted'::public.roommate_interest_status
from auth.users as account
join public.roommate_profiles as profile
  on profile.id = 'e0000000-0000-4000-8000-000000000007'::uuid
where lower(account.email) = 'takinpelu273@gmail.com'
on conflict (profile_id, sender_id)
do update set status = 'accepted';

-- 4. A group booking already running on the property whose visit is completed.
--    The rent splits exactly in half; Ada settled her share two days ago.
insert into public.booking_groups (
  id,
  listing_id,
  room_number,
  created_by,
  total_amount,
  currency,
  status,
  created_at
)
select
  'f9000000-0000-4000-8000-000000000001'::uuid,
  listing.id,
  3,
  student.id,
  listing.rent_amount,
  listing.currency,
  'collecting',
  now() - interval '3 days'
from public.listings as listing
cross join auth.users as student
where listing.id = 'd0000000-0000-4000-8000-000000000106'::uuid
  and lower(student.email) = 'takinpelu273@gmail.com'
on conflict (id) do nothing;

insert into public.booking_group_members (
  group_id,
  user_id,
  member_order,
  share_amount,
  paid_at,
  status
)
select
  'f9000000-0000-4000-8000-000000000001'::uuid,
  member.id,
  member.member_order,
  member.share,
  member.paid_at,
  'joined'
from (
  select
    student.id,
    0::smallint as member_order,
    listing.rent_amount / 2 as share,
    now() - interval '1 day' as paid_at
  from public.listings as listing
  cross join auth.users as student
  where listing.id = 'd0000000-0000-4000-8000-000000000106'::uuid
    and lower(student.email) = 'takinpelu273@gmail.com'

  union all

  select
    roommate.id,
    1::smallint as member_order,
    listing.rent_amount / 2 as share,
    now() - interval '2 days' as paid_at
  from public.listings as listing
  cross join auth.users as roommate
  where listing.id = 'd0000000-0000-4000-8000-000000000106'::uuid
    and lower(roommate.email) = 'ada.mock@quarters.local'
) as member (id, member_order, share, paid_at)
on conflict (group_id, user_id) do nothing;

-- 5. The paid group's room hold, already approved by the demo provider, so the
--    property page shows the finished handshake: paid, approved, room held.
--    The provider inbox reads the same row.
insert into public.listing_room_bookings (
  listing_id,
  room_number,
  booked_by,
  status,
  booking_group_id,
  resolved_at,
  resolved_by
)
select
  'd0000000-0000-4000-8000-000000000106'::uuid,
  3,
  student.id,
  'approved'::public.room_reservation_status,
  'f9000000-0000-4000-8000-000000000001'::uuid,
  now() - interval '2 days',
  provider.id
from auth.users as student
cross join auth.users as provider
where lower(student.email) = 'takinpelu273@gmail.com'
  and lower(provider.email) = 'demo-listings@quarters.local'
on conflict (listing_id, room_number)
  where status in ('requested', 'approved')
do update set
  status = 'approved',
  booking_group_id = excluded.booking_group_id,
  resolved_at = excluded.resolved_at,
  resolved_by = excluded.resolved_by;

-- 6. The receipt for that approved booking, so Home has a real booked room and
--    renewal clock on a fresh database. No-op when the backfill already made it.
select public.issue_booking_receipt(
  'f9000000-0000-4000-8000-000000000001'::uuid,
  now() - interval '2 days'
);
