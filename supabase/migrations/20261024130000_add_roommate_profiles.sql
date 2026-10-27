-- Phase 2E — roommate discovery profiles.
--
-- Additive: a new table only. Nothing existing changes.
--
-- A roommate profile is opt-in and separate from public.profiles: the account
-- profile stays private, while `display_name`, `headline`, area and budget are
-- publishable so other students can find each other. `user_id` is nullable so
-- curated demo rows can exist without inventing accounts; every row a client
-- writes must carry its own auth user id (enforced below).

create table public.roommate_profiles (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one discovery profile per account. NULL marks curated demo content
  -- that no account can claim or edit.
  user_id uuid unique references auth.users (id) on delete cascade,
  display_name text not null,
  -- Short student-facing line, e.g. "300 level Law · tidy, early riser".
  headline text,
  institution text,
  city text not null,
  neighbourhood text,
  -- Monthly contribution the person can put towards rent.
  budget_amount numeric(12, 2),
  currency character(3) not null default 'NGN',
  move_in_date date,
  bio text,
  -- Withdrawing from discovery hides the row from everyone but the owner.
  is_discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roommate_profiles_display_name_length
    check (char_length(btrim(display_name)) between 2 and 60),
  constraint roommate_profiles_headline_length
    check (headline is null or char_length(btrim(headline)) between 1 and 80),
  constraint roommate_profiles_institution_length
    check (institution is null or char_length(btrim(institution)) between 1 and 120),
  constraint roommate_profiles_city_length
    check (char_length(btrim(city)) between 2 and 80),
  constraint roommate_profiles_neighbourhood_length
    check (neighbourhood is null or char_length(btrim(neighbourhood)) between 1 and 80),
  constraint roommate_profiles_budget_positive
    check (budget_amount is null or budget_amount > 0),
  constraint roommate_profiles_currency_supported
    check (currency = 'NGN'),
  constraint roommate_profiles_bio_length
    check (bio is null or char_length(btrim(bio)) between 1 and 600)
);

comment on table public.roommate_profiles is
  'Phase 2E: opt-in roommate discovery profiles. Public to read while discoverable.';
comment on column public.roommate_profiles.user_id is
  'Owning account. NULL only for curated demo rows; clients may only write their own id.';
comment on column public.roommate_profiles.budget_amount is
  'Monthly amount the person can contribute, in the supported currency. Never a float.';
comment on column public.roommate_profiles.is_discoverable is
  'Owner-controlled listing in discovery. Hidden rows stay readable to their owner only.';

create index roommate_profiles_discovery_idx
  on public.roommate_profiles (city, created_at desc)
  where is_discoverable;

create index roommate_profiles_budget_idx
  on public.roommate_profiles (budget_amount)
  where is_discoverable;

create trigger roommate_profiles_touch_updated_at
  before update on public.roommate_profiles
  for each row
  execute function public.touch_updated_at();

alter table public.roommate_profiles enable row level security;

revoke all on table public.roommate_profiles from anon, authenticated;

-- Every column here is intended to be public-safe; the private account record
-- stays in public.profiles. `user_id` is readable so an owner can find their own
-- row, and it is the only link between the two tables.
grant select (
  id, user_id, display_name, headline, institution, city, neighbourhood,
  budget_amount, currency, move_in_date, bio, is_discoverable, created_at, updated_at
) on table public.roommate_profiles to anon, authenticated;

grant insert (
  user_id, display_name, headline, institution, city, neighbourhood,
  budget_amount, currency, move_in_date, bio, is_discoverable
) on table public.roommate_profiles to authenticated;

grant update (
  display_name, headline, institution, city, neighbourhood,
  budget_amount, currency, move_in_date, bio, is_discoverable
) on table public.roommate_profiles to authenticated;

grant delete on table public.roommate_profiles to authenticated;

create policy roommate_profiles_select_discoverable
  on public.roommate_profiles
  for select
  to anon, authenticated
  using (is_discoverable);

create policy roommate_profiles_select_own
  on public.roommate_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A signed-in student may publish only their own profile, and cannot claim a
-- curated demo row (those have no user_id).
create policy roommate_profiles_insert_own
  on public.roommate_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy roommate_profiles_update_own
  on public.roommate_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy roommate_profiles_delete_own
  on public.roommate_profiles
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
