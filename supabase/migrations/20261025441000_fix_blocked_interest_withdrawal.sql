-- Fix: a block must be able to withdraw the pair's existing interests.
--
-- The first safety migration added a guard on every roommate_interests write.
-- Creating a block runs after-insert code that sets both interests to
-- 'withdrawn'; the guard then saw the new block and rejected its own cleanup.
-- The guard now only applies when contact is being opened or accepted.
--
-- Forward-only and idempotent: it replaces the function, leaving the trigger
-- and all other safety objects untouched.

create or replace function public.roommate_blocks_guard_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_owner uuid;
begin
  if new.status not in ('pending', 'accepted') then
    return new;
  end if;

  select p.user_id into profile_owner
  from public.roommate_profiles p
  where p.id = new.profile_id;

  if profile_owner is not null
     and profile_owner <> new.sender_id
     and public.roommate_users_blocked(new.sender_id, profile_owner) then
    raise exception 'You cannot contact this student because of a block.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
