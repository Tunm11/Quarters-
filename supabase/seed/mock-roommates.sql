-- QUARTERS — mock roommate profiles seed.
--
-- Run after 20261024130000_add_roommate_profiles.sql. Content, not schema.
--
-- Six demo profiles the Find Roommate screen renders while profile creation is
-- still being designed. Every row uses the fixed e0000000-… UUID block and
-- `user_id = null`, which means:
--   * no account owns or can edit them;
--   * they are demo content, not real students;
--   * the future admin screen can delete the whole set with one statement:
--
--       delete from public.roommate_profiles
--        where id::text like 'e0000000-%';
--
-- The seed is idempotent and never overwrites an edited row.

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
  is_discoverable
)
values
  (
    'e0000000-0000-4000-8000-000000000001',
    null,
    'Amara O.',
    '300 level Law · quiet, tidy, early riser',
    'University of Lagos',
    'Lagos',
    'Akoka',
    540000.00,
    'NGN',
    date '2026-11-15',
    'Looking for one other person to share a two-bedroom in Akoka. I study most evenings, keep shared spaces clean and cook on weekends.',
    true
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    null,
    'Tunde A.',
    'Computer Science · night owl, cooks a lot',
    'University of Lagos',
    'Lagos',
    'Yaba',
    720000.00,
    'NGN',
    date '2026-11-01',
    'Moving from Ibadan for an internship and final year. Happy to split a self-contained or a shared flat near Yaba. I have my own desk and chair.',
    true
  ),
  (
    'e0000000-0000-4000-8000-000000000003',
    null,
    'Ifeoma N.',
    'Medicine · needs a quiet room, no smoking',
    'Lagos State University',
    'Lagos',
    'Ikeja',
    900000.00,
    'NGN',
    date '2026-12-01',
    'Clinical rotations start in December, so I need somewhere calm with steady water and power. Non-smoker, and I keep to myself on weekdays.',
    true
  ),
  (
    'e0000000-0000-4000-8000-000000000004',
    null,
    'Chidi E.',
    'Economics · sociable, gym in the mornings',
    'University of Lagos',
    'Lagos',
    'Gbagada',
    420000.00,
    'NGN',
    date '2026-11-20',
    'Looking to join an existing shared flat in Gbagada or Surulere. I am out most mornings, easy to live with, and happy to share cooking duties.',
    true
  ),
  (
    'e0000000-0000-4000-8000-000000000005',
    null,
    'Zainab B.',
    'Architecture · studio-heavy, needs light',
    'University of Lagos',
    'Lagos',
    'Surulere',
    660000.00,
    'NGN',
    date '2026-11-08',
    'Second year architecture, so I need a room with decent daylight for drawing. Looking to pair up on a two-bedroom within a short bus ride of campus.',
    true
  ),
  (
    'e0000000-0000-4000-8000-000000000006',
    null,
    'Emeka U.',
    'Mass Comm · first year, new to Lagos',
    'University of Lagos',
    'Lagos',
    'Akoka',
    480000.00,
    'NGN',
    date '2026-12-10',
    'Just got my admission and moving to Lagos for the first time. Looking for a roommate or a shared room close to Akoka campus.',
    true
  )
on conflict (id) do nothing;

-- Budgets are yearly shares of the rent, because landlords in Nigeria let per
-- year or per academic session. Rows seeded by the older monthly version are
-- converted once, and only while they still hold the old figure.
update public.roommate_profiles set budget_amount = 540000
 where id = 'e0000000-0000-4000-8000-000000000001' and budget_amount = 45000;
update public.roommate_profiles set budget_amount = 720000
 where id = 'e0000000-0000-4000-8000-000000000002' and budget_amount = 60000;
update public.roommate_profiles set budget_amount = 900000
 where id = 'e0000000-0000-4000-8000-000000000003' and budget_amount = 75000;
update public.roommate_profiles set budget_amount = 420000
 where id = 'e0000000-0000-4000-8000-000000000004' and budget_amount = 35000;
update public.roommate_profiles set budget_amount = 660000
 where id = 'e0000000-0000-4000-8000-000000000005' and budget_amount = 55000;
update public.roommate_profiles set budget_amount = 480000
 where id = 'e0000000-0000-4000-8000-000000000006' and budget_amount = 40000;

-- Phase 2E photos. The objects live in the private roommate-avatars bucket at
-- demo/<name>.jpg and are read through short-lived signed URLs. `on conflict do
-- nothing` above means already-seeded rows keep their original values, so this
-- block fills the photo path only where it is still empty.
update public.roommate_profiles set avatar_path = 'demo/amara.jpg'
 where id = 'e0000000-0000-4000-8000-000000000001' and avatar_path is null;
update public.roommate_profiles set avatar_path = 'demo/tunde.jpg'
 where id = 'e0000000-0000-4000-8000-000000000002' and avatar_path is null;
update public.roommate_profiles set avatar_path = 'demo/ifeoma.jpg'
 where id = 'e0000000-0000-4000-8000-000000000003' and avatar_path is null;
update public.roommate_profiles set avatar_path = 'demo/chidi.jpg'
 where id = 'e0000000-0000-4000-8000-000000000004' and avatar_path is null;
update public.roommate_profiles set avatar_path = 'demo/zainab.jpg'
 where id = 'e0000000-0000-4000-8000-000000000005' and avatar_path is null;
update public.roommate_profiles set avatar_path = 'demo/emeka.jpg'
 where id = 'e0000000-0000-4000-8000-000000000006' and avatar_path is null;

-- Phase 2F compatibility traits. Real profiles get these from the owner's
-- verification; demo rows get hand-written values so the fit score renders
-- before any student has verified. Only fills columns that are still empty.
update public.roommate_profiles set
  tidy_score = 4.5, sleep_score = 1.5, social_score = 2.0,
  guest_score = 2.0, routine_score = 4.5
 where id = 'e0000000-0000-4000-8000-000000000001' and tidy_score is null;
update public.roommate_profiles set
  tidy_score = 3.0, sleep_score = 4.5, social_score = 3.5,
  guest_score = 3.0, routine_score = 2.5
 where id = 'e0000000-0000-4000-8000-000000000002' and tidy_score is null;
update public.roommate_profiles set
  tidy_score = 4.0, sleep_score = 2.0, social_score = 1.5,
  guest_score = 1.5, routine_score = 4.0
 where id = 'e0000000-0000-4000-8000-000000000003' and tidy_score is null;
update public.roommate_profiles set
  tidy_score = 3.5, sleep_score = 3.0, social_score = 4.5,
  guest_score = 4.0, routine_score = 3.0
 where id = 'e0000000-0000-4000-8000-000000000004' and tidy_score is null;
update public.roommate_profiles set
  tidy_score = 4.0, sleep_score = 4.0, social_score = 3.0,
  guest_score = 2.5, routine_score = 3.5
 where id = 'e0000000-0000-4000-8000-000000000005' and tidy_score is null;
update public.roommate_profiles set
  tidy_score = 2.5, sleep_score = 3.5, social_score = 3.5,
  guest_score = 3.5, routine_score = 2.0
 where id = 'e0000000-0000-4000-8000-000000000006' and tidy_score is null;

-- Phase 2G gender. Real profiles mirror this from the owner's verification; demo
-- rows state it directly so the discovery filter has something to match. Only
-- fills rows that do not have one yet.
update public.roommate_profiles set gender = 'female'
 where id = 'e0000000-0000-4000-8000-000000000001' and gender is null;
update public.roommate_profiles set gender = 'male'
 where id = 'e0000000-0000-4000-8000-000000000002' and gender is null;
update public.roommate_profiles set gender = 'female'
 where id = 'e0000000-0000-4000-8000-000000000003' and gender is null;
update public.roommate_profiles set gender = 'male'
 where id = 'e0000000-0000-4000-8000-000000000004' and gender is null;
update public.roommate_profiles set gender = 'female'
 where id = 'e0000000-0000-4000-8000-000000000005' and gender is null;
update public.roommate_profiles set gender = 'male'
 where id = 'e0000000-0000-4000-8000-000000000006' and gender is null;
