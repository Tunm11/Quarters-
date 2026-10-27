-- QUARTERS — mock visit requests.
--
-- Run after 20261024120000_add_rooms_sessions_and_viewing_requests.sql.
-- Content, not schema.
--
-- Gives the demo student one of every visit state so the My visits screen can be
-- tried without booking anything by hand: two still ahead, and three in the
-- history. Each room is different because the database allows only one open
-- request per person per property.
--
-- Fixed UUIDs in the f2000000-… block and `on conflict (id) do nothing` keep the
-- seed idempotent. Remove it with:
--
--   delete from public.listing_viewing_requests where id::text like 'f2000000-%';

insert into public.listing_viewing_requests (
  id,
  listing_id,
  requester_id,
  scheduled_for,
  status,
  note,
  created_at
)
select
  visit.id,
  visit.listing_id,
  student.id,
  date_trunc('day', now()) + visit.slot,
  visit.status::public.viewing_request_status,
  visit.note,
  now() - visit.age
from (
  values
    (
      'f2000000-0000-4000-8000-000000000001'::uuid,
      'd0000000-0000-4000-8000-000000000103'::uuid,
      'confirmed',
      interval '1 day 10 hours',
      'Confirmed for 10am. I will be there with the keys — come with your student ID.',
      interval '2 days'
    ),
    (
      'f2000000-0000-4000-8000-000000000002'::uuid,
      'd0000000-0000-4000-8000-000000000101'::uuid,
      'pending',
      interval '3 days 14 hours',
      'I would like to see the kitchen and check the water pressure if possible.',
      interval '1 day'
    ),
    (
      'f2000000-0000-4000-8000-000000000003'::uuid,
      'd0000000-0000-4000-8000-000000000105'::uuid,
      'declined',
      interval '5 days 12 hours',
      null,
      interval '3 days'
    ),
    (
      'f2000000-0000-4000-8000-000000000004'::uuid,
      'd0000000-0000-4000-8000-000000000104'::uuid,
      'cancelled',
      interval '2 days 16 hours',
      null,
      interval '4 days'
    ),
    (
      'f2000000-0000-4000-8000-000000000005'::uuid,
      'd0000000-0000-4000-8000-000000000106'::uuid,
      'completed',
      interval '-6 days 10 hours',
      'Visited with my roommate. Quiet street, good water.',
      interval '12 days'
    )
) as visit (id, listing_id, status, slot, note, age)
cross join (
  select id
  from auth.users
  where lower(email) = 'takinpelu273@gmail.com'
) as student
on conflict (id) do nothing;
