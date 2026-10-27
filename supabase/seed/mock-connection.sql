-- Mock-up: one roommate the demo account is already connected to.
--
-- "Connected" is modelled as an interest the student sent that the roommate
-- accepted (`roommate_interests.status = 'accepted'`), so no new table is
-- needed. Idempotent: rerunning keeps the row accepted instead of duplicating.
--
-- Target: takinpelu273@gmail.com -> Amara O. (curated profile e0000000-…-0001).
-- The join makes this a no-op if either side is missing.

insert into public.roommate_interests (profile_id, sender_id, status)
select
  profile.id,
  account.id,
  'accepted'::public.roommate_interest_status
from auth.users as account
join public.roommate_profiles as profile
  on profile.id = 'e0000000-0000-4000-8000-000000000001'
where lower(account.email) = 'takinpelu273@gmail.com'
on conflict (profile_id, sender_id)
do update set status = 'accepted';
