-- Mock-up: the accept/decline side of roommate connections.
--
-- Gives takinpelu273@gmail.com a discoverable roommate profile (so there is
-- something to receive interests on) and one pending interest from the mock
-- roommate account ada.mock@quarters.local. Idempotent: rerunning leaves an
-- already-decided interest alone.

insert into public.roommate_profiles (
  user_id,
  display_name,
  headline,
  institution,
  city,
  neighbourhood,
  budget_amount,
  is_discoverable
)
select
  account.id,
  initcap(split_part(coalesce(profile.display_name, 'Student'), ' ', 1)),
  'Looking for a calm, tidy flatmate',
  null,
  'Lagos',
  'Yaba',
  55000,
  true
from auth.users as account
left join public.profiles as profile on profile.id = account.id
where lower(account.email) = 'takinpelu273@gmail.com'
  and not exists (
    select 1 from public.roommate_profiles existing where existing.user_id = account.id
  );

-- The mock sender's public profile name, shown to the profile owner.
insert into public.profiles (id, display_name)
select id, 'Ada M.'
from auth.users
where lower(email) = 'ada.mock@quarters.local'
on conflict (id) do update set display_name = excluded.display_name;

insert into public.roommate_interests (profile_id, sender_id, status)
select target.id, sender.id, 'pending'
from public.roommate_profiles as target
join auth.users as owner on owner.id = target.user_id
join auth.users as sender on lower(sender.email) = 'ada.mock@quarters.local'
where lower(owner.email) = 'takinpelu273@gmail.com'
on conflict (profile_id, sender_id) do nothing;
