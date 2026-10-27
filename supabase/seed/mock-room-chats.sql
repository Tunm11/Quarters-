-- QUARTERS — mock room chat history.
--
-- Run after 20261025190000_add_listing_chat.sql. Content, not schema.
--
-- Gives the demo student a few real room conversations with the demo lister so
-- the messages inbox has Lister threads, unread badges and a contact for group
-- chat, without anyone having to type them in by hand.
--
-- Everything is keyed to the takinpelu273@gmail.com account and the demo
-- provider (QUARTERS Demo Listings). Fixed UUIDs in the f0000000-… block and
-- `on conflict (id) do nothing` keep the seed idempotent, and no existing row is
-- ever overwritten. Remove it with:
--
--   delete from public.listing_messages
--    where id::text like 'f0000000-%';

insert into public.listing_messages (
  id,
  listing_id,
  student_id,
  sender_id,
  body,
  created_at,
  read_at
)
select
  message.id,
  message.listing_id,
  student.id,
  case
    when message.from_student then student.id
    else lister.owner_id
  end,
  message.body,
  now() - message.age,
  case
    when message.seen then now() - message.age + interval '7 minutes'
    else null
  end
from (
  values
    -- Sunlit self-contained in Akoka: a full back-and-forth, one unread reply.
    (
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'd0000000-0000-4000-8000-000000000101'::uuid,
      true,
      'Hi! Is the Akoka self-contained still available for January?',
      interval '4 days 2 hours',
      true
    ),
    (
      'f0000000-0000-4000-8000-000000000002'::uuid,
      'd0000000-0000-4000-8000-000000000101'::uuid,
      false,
      'Yes it is. It is on the second floor, with a private kitchenette and steady water.',
      interval '4 days 1 hour',
      true
    ),
    (
      'f0000000-0000-4000-8000-000000000003'::uuid,
      'd0000000-0000-4000-8000-000000000101'::uuid,
      true,
      'Nice. Is the ₦850k for the full year, or can I pay per session?',
      interval '4 days',
      true
    ),
    (
      'f0000000-0000-4000-8000-000000000004'::uuid,
      'd0000000-0000-4000-8000-000000000101'::uuid,
      false,
      'Full year, but you can split it into two payments if that is easier.',
      interval '3 days 23 hours',
      false
    ),
    -- Shared apartment near Yaba tech hub: weekend viewing agreed.
    (
      'f0000000-0000-4000-8000-000000000005'::uuid,
      'd0000000-0000-4000-8000-000000000103'::uuid,
      true,
      'Do you still have a room free in the Yaba flat from November?',
      interval '2 days 5 hours',
      true
    ),
    (
      'f0000000-0000-4000-8000-000000000006'::uuid,
      'd0000000-0000-4000-8000-000000000103'::uuid,
      false,
      'One room left. Viewings are Saturday, 10am to 3pm.',
      interval '2 days 4 hours',
      true
    ),
    (
      'f0000000-0000-4000-8000-000000000007'::uuid,
      'd0000000-0000-4000-8000-000000000103'::uuid,
      true,
      'Saturday works. Should I come with anything?',
      interval '2 days 3 hours',
      true
    ),
    -- Student hostel bed in Ikeja: a fresh question the lister has not seen.
    (
      'f0000000-0000-4000-8000-000000000008'::uuid,
      'd0000000-0000-4000-8000-000000000104'::uuid,
      true,
      'Hello, is the hostel bed in Ikeja still open? I would like to see it this week.',
      interval '5 hours',
      false
    )
) as message (id, listing_id, from_student, body, age, seen)
cross join (
  select id
  from auth.users
  where lower(email) = 'takinpelu273@gmail.com'
) as student
cross join (
  select owner_id
  from public.providers
  where id = 'd0000000-0000-4000-8000-000000000002'
) as lister
on conflict (id) do nothing;
