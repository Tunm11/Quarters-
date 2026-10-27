-- Phase 2F — roommate discoverability verification.
--
-- Additive: one new table, one audit table, new columns on roommate_profiles,
-- and three new functions. Nothing existing is dropped or rewritten.
--
-- The flow this supports:
--   * a signed-in student submits one extensive verification per account;
--   * verification is instant: the row lands as `verified`, so discovery opens
--     straight away;
--   * submissions are monitored: an insert-time assessment records risk flags
--     (shared phone, thin free-text answers, uniform answers) and marks the row
--     for review without blocking the student;
--   * an administrator can later suspend or block through
--     admin_set_roommate_standing(), which also hides the profile from
--     discovery and writes an audit row;
--   * discovery is gated in RLS: only a verified viewer can read published
--     roommate profiles, and a suspended/blocked owner's profile is never
--     readable by anyone else.
--
-- Personal data (full name, phone, school email, raw answers) lives only in
-- roommate_verifications. Only the owner and administrators can read it; the
-- public discovery read model still comes from roommate_profiles.

create table public.roommate_verifications (
  id uuid primary key default gen_random_uuid(),
  -- One verification per account. Re-verification updates this row.
  user_id uuid not null unique references auth.users (id) on delete cascade,

  -- Identity details taken from the account profile plus this form. Phone and
  -- school email are never published.
  full_name text not null,
  phone text not null,
  institution text not null,
  study_level text not null,
  city text not null,
  neighbourhood text,
  gender text,
  school_email text,

  -- Full questionnaire responses, keyed by question id. Raw answers are
  -- private; only the derived trait scores are mirrored for matching.
  answers jsonb not null default '{}'::jsonb,

  -- Derived compatibility traits, 1.00-5.00. Mirrored onto roommate_profiles
  -- by the sync trigger so discovery cards never need this private row.
  tidy_score numeric(3, 2) not null,
  sleep_score numeric(3, 2) not null,
  social_score numeric(3, 2) not null,
  guest_score numeric(3, 2) not null,
  routine_score numeric(3, 2) not null,

  -- Standing. Defaults to verified because verification is instant; only an
  -- administrator can move it afterwards.
  status text not null default 'verified',
  review_state text not null default 'clear',
  risk_flags text[] not null default '{}',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  suspended_at timestamptz,
  suspension_reason text,
  blocked_at timestamptz,
  blocked_reason text,

  -- Both consents are mandatory and recorded with their own timestamps.
  consent_accuracy_at timestamptz not null default now(),
  consent_monitoring_at timestamptz not null default now(),

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint roommate_verifications_status_valid
    check (status in ('verified', 'suspended', 'blocked')),
  constraint roommate_verifications_review_state_valid
    check (review_state in ('clear', 'flagged', 'under_review')),
  constraint roommate_verifications_full_name_length
    check (char_length(btrim(full_name)) between 2 and 80),
  constraint roommate_verifications_phone_format
    check (phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  constraint roommate_verifications_institution_length
    check (char_length(btrim(institution)) between 2 and 120),
  constraint roommate_verifications_study_level_valid
    check (study_level in (
      '100', '200', '300', '400', '500', 'postgraduate',
      'recent_graduate', 'other'
    )),
  constraint roommate_verifications_city_length
    check (char_length(btrim(city)) between 2 and 80),
  constraint roommate_verifications_neighbourhood_length
    check (neighbourhood is null or char_length(btrim(neighbourhood)) between 1 and 80),
  constraint roommate_verifications_gender_valid
    check (gender is null or gender in ('female', 'male', 'prefer_not_to_say')),
  constraint roommate_verifications_school_email_length
    check (school_email is null or char_length(btrim(school_email)) between 6 and 120),
  constraint roommate_verifications_answers_object
    check (jsonb_typeof(answers) = 'object'),
  constraint roommate_verifications_tidy_range
    check (tidy_score between 1 and 5),
  constraint roommate_verifications_sleep_range
    check (sleep_score between 1 and 5),
  constraint roommate_verifications_social_range
    check (social_score between 1 and 5),
  constraint roommate_verifications_guest_range
    check (guest_score between 1 and 5),
  constraint roommate_verifications_routine_range
    check (routine_score between 1 and 5),
  constraint roommate_verifications_reason_length
    check (
      (suspension_reason is null or char_length(btrim(suspension_reason)) between 3 and 500)
      and (blocked_reason is null or char_length(btrim(blocked_reason)) between 3 and 500)
    )
);

comment on table public.roommate_verifications is
  'Phase 2F: one roommate verification per account. Instant approval, admin-monitored.';
comment on column public.roommate_verifications.answers is
  'Raw questionnaire answers. Private: only the owner and administrators can read this row.';
comment on column public.roommate_verifications.status is
  'verified | suspended | blocked. Only admin_set_roommate_standing() changes it.';
comment on column public.roommate_verifications.review_state is
  'clear | flagged | under_review. Set by the risk assessment trigger or an administrator.';
comment on column public.roommate_verifications.risk_flags is
  'Signals recorded at submission for administrator follow-up; never shown publicly.';

create index roommate_verifications_phone_idx
  on public.roommate_verifications (regexp_replace(phone, '\D', '', 'g'));

create index roommate_verifications_review_idx
  on public.roommate_verifications (review_state, submitted_at desc)
  where review_state <> 'clear';

create trigger roommate_verifications_touch_updated_at
  before update on public.roommate_verifications
  for each row
  execute function public.touch_updated_at();

-- Audit trail for administrator decisions. Append-only; no client grants.
create table public.roommate_moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null
    check (action in ('flagged', 'cleared', 'suspended', 'blocked', 'reinstated')),
  reason text,
  acted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint roommate_moderation_events_reason_length
    check (reason is null or char_length(btrim(reason)) between 3 and 500)
);

comment on table public.roommate_moderation_events is
  'Phase 2F: administrator actions against a roommate verification. Service role / SQL only.';

create index roommate_moderation_events_user_idx
  on public.roommate_moderation_events (user_id, created_at desc);

alter table public.roommate_moderation_events enable row level security;
revoke all on table public.roommate_moderation_events from anon, authenticated;

-- Derived traits on the public discovery profile so the client can score
-- compatibility without ever reading another student's private verification.
alter table public.roommate_profiles
  add column tidy_score numeric(3, 2),
  add column sleep_score numeric(3, 2),
  add column social_score numeric(3, 2),
  add column guest_score numeric(3, 2),
  add column routine_score numeric(3, 2);

alter table public.roommate_profiles
  add constraint roommate_profiles_tidy_range
    check (tidy_score is null or tidy_score between 1 and 5),
  add constraint roommate_profiles_sleep_range
    check (sleep_score is null or sleep_score between 1 and 5),
  add constraint roommate_profiles_social_range
    check (social_score is null or social_score between 1 and 5),
  add constraint roommate_profiles_guest_range
    check (guest_score is null or guest_score between 1 and 5),
  add constraint roommate_profiles_routine_range
    check (routine_score is null or routine_score between 1 and 5);

comment on column public.roommate_profiles.tidy_score is
  'Phase 2F: derived 1-5 trait mirrored from the owner''s verification. Public-safe.';

-- Access rules reconsidered for the verification gate.
alter table public.roommate_verifications enable row level security;
revoke all on table public.roommate_verifications from anon, authenticated;

grant select on table public.roommate_verifications to authenticated;

grant insert (
  user_id, full_name, phone, institution, study_level, city, neighbourhood,
  gender, school_email, answers, tidy_score, sleep_score, social_score,
  guest_score, routine_score
) on table public.roommate_verifications to authenticated;

-- Standing columns are deliberately absent: they are administrator-managed.
grant update (
  full_name, phone, institution, study_level, city, neighbourhood,
  gender, school_email, answers, tidy_score, sleep_score, social_score,
  guest_score, routine_score
) on table public.roommate_verifications to authenticated;

create policy roommate_verifications_select_own
  on public.roommate_verifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy roommate_verifications_select_admin
  on public.roommate_verifications
  for select
  to authenticated
  using (public.is_admin());

create policy roommate_verifications_insert_own
  on public.roommate_verifications
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy roommate_verifications_update_own
  on public.roommate_verifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Standing helpers. SECURITY DEFINER so discovery policies can check another
-- student's standing without exposing the verification row itself.
create function public.is_verified_roommate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roommate_verifications v
    where v.user_id = (select auth.uid())
      and v.status = 'verified'
  );
$$;

create function public.roommate_owner_verified(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner is null or exists (
    select 1
    from public.roommate_verifications v
    where v.user_id = owner
      and v.status = 'verified'
  );
$$;

revoke all on function public.is_verified_roommate() from public, anon;
revoke all on function public.roommate_owner_verified(uuid) from public, anon;
grant execute on function public.is_verified_roommate() to authenticated;
grant execute on function public.roommate_owner_verified(uuid) to authenticated;

-- Instant verification plus monitoring: flag suspicious submissions for review
-- but leave the student verified so discovery is not blocked.
create function public.roommate_verifications_assess_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  flags text[] := '{}';
  digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  about_you text := coalesce(new.answers ->> 'about_you', '');
  roommate_reason text := coalesce(new.answers ->> 'why_roommate', '');
begin
  -- The same phone number on two accounts is the strongest cheap signal of a
  -- duplicate or impersonating profile.
  if exists (
    select 1
    from public.roommate_verifications v
    where v.user_id <> new.user_id
      and regexp_replace(v.phone, '\D', '', 'g') = digits
  ) then
    flags := flags || 'shared_phone'::text;
  end if;

  if char_length(btrim(about_you)) < 40 or char_length(btrim(roommate_reason)) < 20 then
    flags := flags || 'thin_answers'::text;
  end if;

  if new.tidy_score = new.sleep_score
     and new.sleep_score = new.social_score
     and new.social_score = new.guest_score
     and new.guest_score = new.routine_score then
    flags := flags || 'uniform_answers'::text;
  end if;

  new.risk_flags := flags;
  new.review_state := case when cardinality(flags) > 0 then 'flagged' else 'clear' end;
  new.submitted_at := now();
  return new;
end;
$$;

create trigger roommate_verifications_assess_risk
  before insert or update of phone, answers,
    tidy_score, sleep_score, social_score, guest_score, routine_score
  on public.roommate_verifications
  for each row
  execute function public.roommate_verifications_assess_risk();

-- Mirror the public-safe traits onto the discovery profile and hide the profile
-- whenever the account is no longer verified. Reinstatement deliberately does
-- not republish: the student chooses visibility again on their own profile.
create function public.roommate_verifications_sync_profile()
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
         is_discoverable = case
           when new.status = 'verified' then p.is_discoverable
           else false
         end
   where p.user_id = new.user_id;
  return new;
end;
$$;

create trigger roommate_verifications_sync_profile
  after insert or update of status, tidy_score, sleep_score, social_score,
    guest_score, routine_score
  on public.roommate_verifications
  for each row
  execute function public.roommate_verifications_sync_profile();

-- Administrator entry point for the future moderation screen. A suspension or
-- block hides the roommate profile and is written to the audit table.
create function public.admin_set_roommate_standing(
  target_user uuid,
  new_status text,
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change roommate standing.'
      using errcode = '42501';
  end if;

  if new_status not in ('verified', 'suspended', 'blocked') then
    raise exception 'Unknown roommate standing: %', new_status
      using errcode = '22023';
  end if;

  if reason is null or char_length(btrim(reason)) < 5 then
    raise exception 'A short reason is required for this decision.'
      using errcode = '22023';
  end if;

  update public.roommate_verifications
     set status = new_status,
         review_state = case when new_status = 'verified' then 'clear' else 'under_review' end,
         reviewed_by = (select auth.uid()),
         reviewed_at = now(),
         review_note = btrim(reason),
         suspended_at = case when new_status = 'suspended' then now() else null end,
         suspension_reason = case when new_status = 'suspended' then btrim(reason) else null end,
         blocked_at = case when new_status = 'blocked' then now() else null end,
         blocked_reason = case when new_status = 'blocked' then btrim(reason) else null end
   where user_id = target_user;

  if not found then
    raise exception 'That account has no roommate verification.'
      using errcode = 'P0002';
  end if;

  insert into public.roommate_moderation_events (user_id, action, reason, acted_by)
  values (
    target_user,
    case new_status
      when 'suspended' then 'suspended'
      when 'blocked' then 'blocked'
      else 'reinstated'
    end,
    btrim(reason),
    (select auth.uid())
  );
end;
$$;

revoke all on function public.admin_set_roommate_standing(uuid, text, text)
  from public, anon;
grant execute on function public.admin_set_roommate_standing(uuid, text, text)
  to authenticated;

-- Discovery gating. Anonymous visitors no longer hold a discovery policy at
-- all; a verified signed-in student can read published profiles whose owner is
-- still in good standing.
drop policy if exists roommate_profiles_select_discoverable on public.roommate_profiles;

create policy roommate_profiles_select_verified
  on public.roommate_profiles
  for select
  to authenticated
  using (
    is_discoverable
    and public.is_verified_roommate()
    and public.roommate_owner_verified(user_id)
  );

drop policy if exists roommate_profiles_insert_own on public.roommate_profiles;
drop policy if exists roommate_profiles_update_own on public.roommate_profiles;

create policy roommate_profiles_insert_own
  on public.roommate_profiles
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_verified_roommate()
  );

create policy roommate_profiles_update_own
  on public.roommate_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.is_verified_roommate()
  );

grant select (
  tidy_score, sleep_score, social_score, guest_score, routine_score
) on table public.roommate_profiles to authenticated;
