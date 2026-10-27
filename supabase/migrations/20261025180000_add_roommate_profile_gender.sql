-- Gender on the public roommate discovery profile.
--
-- Discovery needs to answer "show me female roommates" without exposing the
-- private verification row. Gender is therefore mirrored onto the discovery
-- profile the same way the compatibility traits are: collected once during
-- verification, published only while the profile is discoverable, and reduced to
-- NULL when the student chose "prefer not to say" so no filter can infer it.
--
-- Owners do not edit this field directly; the verification is the single source
-- of truth for it.

alter table public.roommate_profiles
  add column gender text;

alter table public.roommate_profiles
  add constraint roommate_profiles_gender_valid
    check (gender is null or gender in ('female', 'male'));

comment on column public.roommate_profiles.gender is
  'Phase 2G: gender mirrored from the owner''s verification, NULL when unstated or prefer-not-to-say. Public-safe.';

create index roommate_profiles_gender_idx
  on public.roommate_profiles (gender)
  where is_discoverable;

-- The table revokes all and then grants per column, so a new column needs its
-- own grants. Read for everyone (discoverable rows only, via RLS); the owner may
-- still write it, but the sync trigger below owns the value.
grant select (gender) on table public.roommate_profiles to anon, authenticated;
grant insert (gender) on table public.roommate_profiles to authenticated;
grant update (gender) on table public.roommate_profiles to authenticated;

-- Mirror gender alongside the traits, and keep it in step if a student later
-- changes or withdraws it on their verification.
create or replace function public.roommate_verifications_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.roommate_profiles p
     set tidy_score = new.tidy_score,
         sleep_score = new.sleep_score,
         social_score = new.social_score,
         guest_score = new.guest_score,
         routine_score = new.routine_score,
         gender = case
           when new.status = 'verified' then nullif(new.gender, 'prefer_not_to_say')
           else p.gender
         end,
         is_discoverable = case
           when new.status = 'verified' then p.is_discoverable
           else false
         end
   where p.user_id = new.user_id;
  return new;
end;
$$;

-- The trigger only fired on the trait columns; gender changes must sync too.
drop trigger if exists roommate_verifications_sync_profile
  on public.roommate_verifications;

create trigger roommate_verifications_sync_profile
  after insert or update of status, gender, tidy_score, sleep_score, social_score,
    guest_score, routine_score
  on public.roommate_verifications
  for each row
  execute function public.roommate_verifications_sync_profile();

-- A student who verified before creating their discovery profile would never
-- see the sync trigger fire, so a new profile picks up the gender it is entitled
-- to at insert time. Only a blank gender is filled, never an existing value.
create function public.roommate_profiles_seed_gender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.gender is null and new.user_id is not null then
    select nullif(v.gender, 'prefer_not_to_say')
      into new.gender
      from public.roommate_verifications v
     where v.user_id = new.user_id
       and v.status = 'verified';
  end if;
  return new;
end;
$$;

create trigger roommate_profiles_seed_gender
  before insert on public.roommate_profiles
  for each row
  execute function public.roommate_profiles_seed_gender();

-- Backfill profiles that already have a verified owner.
update public.roommate_profiles p
   set gender = nullif(v.gender, 'prefer_not_to_say')
  from public.roommate_verifications v
 where v.user_id = p.user_id
   and v.status = 'verified'
   and p.gender is null;
