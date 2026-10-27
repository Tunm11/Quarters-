-- QUARTERS — mock group chat history.
--
-- Run after 20261025230000_add_group_listing_shares.sql. Content, not schema.
--
-- Fills the demo group ("The room", created by takinpelu273@gmail.com) with a
-- realistic three-person conversation: long messages from the student, a
-- roommate and the demo lister, with several different property cards so the
-- inbox and the group thread have something to show.
--
-- Fixed UUIDs in the f1000000-… block and `on conflict (id) do nothing` keep the
-- seed idempotent. Remove it with:
--
--   delete from public.chat_group_messages where id::text like 'f1000000-%';

-- The demo lister is an account without a profile row, so its group messages
-- would otherwise be attributed to "Member". Fill the name in, never overwrite.
insert into public.profiles (id, display_name)
values (
  'd0000000-0000-4000-8000-000000000001',
  'QUARTERS Demo Listings'
)
on conflict (id) do update
  set display_name = excluded.display_name
  where public.profiles.display_name is null
     or btrim(public.profiles.display_name) = '';

with target_group as (
  select g.id
  from public.chat_groups g
  join auth.users u on u.id = g.created_by
  where lower(u.email) = 'takinpelu273@gmail.com'
    and g.name = 'The room'
  order by g.created_at desc
  limit 1
),
people as (
  select
    (
      select id from auth.users
      where lower(email) = 'takinpelu273@gmail.com'
    ) as student,
    (
      select id from auth.users
      where lower(email) = 'ada.mock@quarters.local'
    ) as roommate,
    (
      select owner_id from public.providers
      where id = 'd0000000-0000-4000-8000-000000000002'
    ) as lister
)
insert into public.chat_group_messages (
  id,
  group_id,
  sender_id,
  body,
  created_at,
  shared_listing_id
)
select
  message.id,
  target_group.id,
  case message.who
    when 'student' then people.student
    when 'roommate' then people.roommate
    else people.lister
  end,
  message.body,
  now() - message.age,
  message.shared_listing_id
from (
  values
    (
      'f1000000-0000-4000-8000-000000000001'::uuid,
      'student',
      'Okay, this is the group I meant. We are three people looking for something around Akoka, Yaba or Gbagada from January, and we each want to stay under ₦500k for the year. I have shortlisted a few places already, so I will drop the cards in here and we can all look at the same thing instead of sending links back and forth in three separate chats. If anything looks wrong, say it now rather than after we have paid.',
      interval '42 minutes',
      null::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000002'::uuid,
      'roommate',
      'Perfect. My budget is the same, and I can stretch a little if the place has steady water and a kitchen we can actually cook in. I am free on Saturdays after 10am, and my current place ends on the 12th of January, so a viewing in the next two weeks would be ideal. If we find something before then I can pay my share immediately, I just need a day''s notice to move the money.',
      interval '39 minutes',
      null::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000003'::uuid,
      'lister',
      'Good evening, all. I manage the Akoka and Yaba rooms you have been looking at. The Akoka self-contained is ₦850k for the full year, but the landlord accepts two payments across the session, and it has a private kitchenette and a prepaid meter. I can hold it for a week if the three of you want to see it together — just tell me a day and I will meet you there with the keys.',
      interval '36 minutes',
      'd0000000-0000-4000-8000-000000000101'::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000004'::uuid,
      'roommate',
      'This Yaba one is the closest to my campus and the rent is lower, though we would share the kitchen. If two of us take it, the split is roughly ₦275k each for the year, which leaves room for power and water. Does the flat have a prepaid meter, and is the ₦550k negotiable if we pay the full year upfront? I would also like to know whether the compound has a gate that is locked at night.',
      interval '32 minutes',
      'd0000000-0000-4000-8000-000000000103'::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000005'::uuid,
      'student',
      'The Ikeja hostel is cheaper again at ₦300k, but it is a bed in a shared room, so we would be sharing with people we have not met and we would not control the space. I am not against it as a backup if nothing else works out, but I would rather we get a room the three of us can lock ourselves. Let us keep it on the list and decide after Saturday.',
      interval '28 minutes',
      'd0000000-0000-4000-8000-000000000104'::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000006'::uuid,
      'lister',
      'The Gbagada shared room is ₦300k as well, and the landlord lets students paint and put up shelves, which is rare. It is a five-minute walk to the bus stop, so the commute to Yaba is about twenty-five minutes in the morning. I can show you this one on Saturday at 10am and the Akoka studio at noon, if that works for everyone. Bring your student IDs; the caretaker writes them down before he opens the gate.',
      interval '24 minutes',
      'd0000000-0000-4000-8000-000000000106'::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000007'::uuid,
      'roommate',
      'Saturday works for me. Can we make it 10am at Gbagada, then noon at Akoka? I will bring a tape measure and check the water pressure — my last place looked fine in the photos and then had nothing in the taps after 7am. Also, does the rent include the agent''s fee, or is that separate? I would like us to agree on how we split that before anyone pays anything.',
      interval '18 minutes',
      null::uuid
    ),
    (
      'f1000000-0000-4000-8000-000000000008'::uuid,
      'student',
      'I am in for Saturday. Ada, can you drop the exact address in this group tomorrow morning so we all have it on our phones? And if the Akoka place is still free after the viewing, I am happy to pay my part that same week so we do not lose it to someone else. Let us also agree now that rent, power and water are split three ways, and anything one person buys for the flat goes in a shared note.',
      interval '6 minutes',
      null::uuid
    )
) as message (id, who, body, age, shared_listing_id)
cross join target_group
cross join people
on conflict (id) do nothing;
