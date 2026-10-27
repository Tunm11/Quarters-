-- QUARTERS — mock for the room picker.
--
-- Content, not schema. Run after 20261025150000_add_room_bookings.sql.
--
-- It prepares one listing exactly as it looks after a completed viewing, so the
-- room picker can be tried end to end:
--
--   * the demo hostel in Ikeja becomes a 16-room block;
--   * the demo student's viewing request for it is confirmed (a cancelled or
--     pending row is promoted, otherwise one is created);
--   * five rooms are already held by other residents, so they render as
--     unclickable in the picker.
--
-- The student is the mock account the product team signs in with. Change the
-- email below to test with a different account. The file is idempotent.

-- 16 rooms in the hostel block.
update public.listings
set total_rooms = 16
where id = 'd0000000-0000-4000-8000-000000000104'
  and provider_id = 'd0000000-0000-4000-8000-000000000002';

-- The viewing already happened: promote the student's request on that listing.
update public.listing_viewing_requests as requests
set status = 'confirmed',
    scheduled_for = now() - interval '2 days'
from auth.users as students
where students.id = requests.requester_id
  and students.email = 'takinpelu273@gmail.com'
  and requests.listing_id = 'd0000000-0000-4000-8000-000000000104'
  and requests.status <> 'confirmed';

-- No request at all yet: create the completed one.
insert into public.listing_viewing_requests (listing_id, requester_id, scheduled_for, status, note)
select
  'd0000000-0000-4000-8000-000000000104',
  students.id,
  now() - interval '2 days',
  'confirmed',
  'Visit completed — room selection unlocked.'
from auth.users as students
where students.email = 'takinpelu273@gmail.com'
  and not exists (
    select 1
    from public.listing_viewing_requests as existing
    where existing.listing_id = 'd0000000-0000-4000-8000-000000000104'
      and existing.requester_id = students.id
  );

-- Rooms other residents already hold.
insert into public.listing_room_bookings (listing_id, room_number, booked_by)
select
  'd0000000-0000-4000-8000-000000000104',
  room,
  null
from unnest(array[2, 5, 7, 11, 14]::smallint[]) as room
where not exists (
  select 1
  from public.listing_room_bookings as booked
  where booked.listing_id = 'd0000000-0000-4000-8000-000000000104'
    and booked.room_number = room
);
