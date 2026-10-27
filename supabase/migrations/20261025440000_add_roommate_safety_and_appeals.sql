-- Roommate safety and verification re-review.
--
-- 1. Blocking.
--    A block is pairwise and stored by profile, with a display-name snapshot so
--    the blocker can still manage the block after the blocked profile is hidden
--    from them. Discovery hides the pair in both directions, interests between
--    them are withdrawn, and new interests or messages are rejected by trigger.
--    Existing messages stay in place (the thread record belongs to both sides),
--    but nobody can add to it while the block exists.
--
-- 2. Reporting.
--    A report is a moderation queue entry, visible to its reporter and to
--    administrators. One open report per student per profile; further reports
--    after a decision are allowed.
--
-- 3. Verification re-review.
--    A suspended or blocked student can ask for a re-review with a short
--    explanation. An appeal moves the verification into `under_review`, records
--    a moderation event, and is resolved automatically when an administrator
--    changes the standing through the existing admin_set_roommate_standing().
--
-- Additive only: three new tables, policies, grants, helper functions and
-- triggers. No existing rows are rewritten and no columns are dropped.

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------

create table public.roommate_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_profile_id uuid not null
    references public.roommate_profiles (id) on delete cascade,
  -- Snapshot taken when the block is created. The blocked profile is hidden
  -- from the blocker, so this is what the "Blocked roommates" list shows.
  blocked_display_name text not null,
  created_at timestamptz not null default now(),
  constraint roommate_blocks_display_name_length
    check (char_length(btrim(blocked_display_name)) between 1 and 80),
  constraint roommate_blocks_unique unique (blocker_id, blocked_profile_id)
);

comment on table public.roommate_blocks is
  'Pairwise roommate blocks. Hidden in both directions; enforced in discovery and chat.';

create index roommate_blocks_blocker_idx
  on public.roommate_blocks (blocker_id, created_at desc);
create index roommate_blocks_blocked_profile_idx
  on public.roommate_blocks (blocked_profile_id);

alter table public.roommate_blocks enable row level security;
revoke all on table public.roommate_blocks from anon, authenticated;

grant select on table public.roommate_blocks to authenticated;
grant insert (blocker_id, blocked_profile_id, blocked_display_name)
  on table public.roommate_blocks to authenticated;
grant delete on table public.roommate_blocks to authenticated;

-- The account that owns a public roommate profile. SECURITY DEFINER so block
-- checks work without exposing profiles the caller can no longer discover.
create function public.roommate_profile_owner(target_profile uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
  from public.roommate_profiles p
  where p.id = target_profile;
$$;

revoke all on function public.roommate_profile_owner(uuid) from public, anon;
grant execute on function public.roommate_profile_owner(uuid) to authenticated;

-- True when either account has blocked the other, in any direction.
create function public.roommate_users_blocked(viewer uuid, other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roommate_blocks b
    join public.roommate_profiles p on p.id = b.blocked_profile_id
    where (b.blocker_id = viewer and p.user_id = other_user)
       or (b.blocker_id = other_user and p.user_id = viewer)
  );
$$;

comment on function public.roommate_users_blocked(uuid, uuid) is
  'True when either account has blocked the other. Used by discovery and chat guards.';

revoke all on function public.roommate_users_blocked(uuid, uuid) from public, anon;
grant execute on function public.roommate_users_blocked(uuid, uuid) to authenticated;

create policy roommate_blocks_select_own
  on public.roommate_blocks
  for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy roommate_blocks_insert_own
  on public.roommate_blocks
  for insert
  to authenticated
  with check (
    blocker_id = (select auth.uid())
    and public.roommate_profile_owner(blocked_profile_id)
      is distinct from (select auth.uid())
  );

create policy roommate_blocks_delete_own
  on public.roommate_blocks
  for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- A block severs the connection: every interest between the pair becomes
-- withdrawn, whether pending, accepted or declined.
create function public.roommate_blocks_sever_connections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocked_owner uuid;
  my_profile uuid;
begin
  select p.user_id into blocked_owner
  from public.roommate_profiles p
  where p.id = new.blocked_profile_id;

  select p.id into my_profile
  from public.roommate_profiles p
  where p.user_id = new.blocker_id
  limit 1;

  update public.roommate_interests i
     set status = 'withdrawn'
   where (i.sender_id = new.blocker_id and i.profile_id = new.blocked_profile_id)
      or (
        blocked_owner is not null
        and my_profile is not null
        and i.sender_id = blocked_owner
        and i.profile_id = my_profile
      );

  return new;
end;
$$;

create trigger roommate_blocks_sever_connections
  after insert on public.roommate_blocks
  for each row
  execute function public.roommate_blocks_sever_connections();

-- Existing interest writes (including re-opening a withdrawn interest) are
-- refused while either side has blocked the other.
create function public.roommate_blocks_guard_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_owner uuid;
begin
  -- Withdrawing or declining an interest must stay possible: a block itself
  -- withdraws existing interests. Only opening or accepting contact is refused.
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

create trigger roommate_blocks_guard_interest
  before insert or update on public.roommate_interests
  for each row
  execute function public.roommate_blocks_guard_interest();

-- Chat writes are refused while either side has blocked the other. Read
-- receipts only update read_at, which this trigger deliberately ignores.
create function public.roommate_blocks_guard_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_owner uuid;
  other_user uuid;
begin
  select p.user_id into profile_owner
  from public.roommate_profiles p
  where p.id = new.profile_id;

  if profile_owner is null then
    return new;
  end if;

  other_user := case
    when profile_owner = new.sender_id then new.student_id
    else profile_owner
  end;

  if other_user is not null
     and public.roommate_users_blocked(new.sender_id, other_user) then
    raise exception 'You cannot message this student because of a block.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger roommate_blocks_guard_message
  before insert or update of body, image_path on public.roommate_messages
  for each row
  execute function public.roommate_blocks_guard_message();

-- Discovery hides blocked profiles in both directions. The direct subquery
-- covers blocks the caller made (including demo profiles); the helper covers
-- accounts that blocked the caller.
drop policy if exists roommate_profiles_select_verified on public.roommate_profiles;

create policy roommate_profiles_select_verified
  on public.roommate_profiles
  for select
  to authenticated
  using (
    is_discoverable
    and public.is_verified_roommate()
    and public.roommate_owner_verified(user_id)
    and not exists (
      select 1
      from public.roommate_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_profile_id = roommate_profiles.id
    )
    and not public.roommate_users_blocked((select auth.uid()), user_id)
  );

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

create table public.roommate_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_profile_id uuid not null
    references public.roommate_profiles (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roommate_reports_reason_valid
    check (reason in (
      'harassment',
      'fake_profile',
      'scam',
      'inappropriate',
      'safety',
      'other'
    )),
  constraint roommate_reports_status_valid
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint roommate_reports_details_length
    check (details is null or char_length(btrim(details)) between 1 and 1000),
  constraint roommate_reports_other_needs_details
    check (
      reason <> 'other'
      or (details is not null and char_length(btrim(details)) >= 10)
    ),
  constraint roommate_reports_resolution_note_length
    check (
      resolution_note is null
      or char_length(btrim(resolution_note)) between 3 and 500
    )
);

comment on table public.roommate_reports is
  'Phase 2F safety: roommate reports. Readable by the reporter and administrators.';

create index roommate_reports_reporter_idx
  on public.roommate_reports (reporter_id, created_at desc);
create index roommate_reports_queue_idx
  on public.roommate_reports (status, created_at)
  where status in ('open', 'reviewing');
create unique index roommate_reports_one_open_idx
  on public.roommate_reports (reporter_id, reported_profile_id)
  where status in ('open', 'reviewing');

create trigger roommate_reports_touch_updated_at
  before update on public.roommate_reports
  for each row
  execute function public.touch_updated_at();

alter table public.roommate_reports enable row level security;
revoke all on table public.roommate_reports from anon, authenticated;

grant select on table public.roommate_reports to authenticated;
grant insert (reporter_id, reported_profile_id, reason, details)
  on table public.roommate_reports to authenticated;

create policy roommate_reports_select_own
  on public.roommate_reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy roommate_reports_select_admin
  on public.roommate_reports
  for select
  to authenticated
  using (public.is_admin());

create policy roommate_reports_insert_own
  on public.roommate_reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.roommate_profile_owner(reported_profile_id)
      is distinct from (select auth.uid())
  );

-- The reported account is copied from the profile so the moderation queue can
-- be queried by account without joining public profile data.
create function public.roommate_reports_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.user_id into new.reported_user_id
  from public.roommate_profiles p
  where p.id = new.reported_profile_id;

  return new;
end;
$$;

create trigger roommate_reports_prepare
  before insert on public.roommate_reports
  for each row
  execute function public.roommate_reports_prepare();

-- ---------------------------------------------------------------------------
-- Verification re-review appeals
-- ---------------------------------------------------------------------------

create table public.roommate_verification_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  verification_id uuid not null
    references public.roommate_verifications (id) on delete cascade,
  reason text not null,
  message text not null,
  status text not null default 'pending',
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roommate_verification_appeals_reason_valid
    check (reason in ('corrected', 'mistake', 'impersonation', 'other')),
  constraint roommate_verification_appeals_message_length
    check (char_length(btrim(message)) between 30 and 1000),
  constraint roommate_verification_appeals_status_valid
    check (status in ('pending', 'approved', 'declined')),
  constraint roommate_verification_appeals_decision_note_length
    check (
      decision_note is null
      or char_length(btrim(decision_note)) between 3 and 500
    )
);

comment on table public.roommate_verification_appeals is
  'Re-review requests from a suspended or blocked roommate verification.';

create index roommate_verification_appeals_user_idx
  on public.roommate_verification_appeals (user_id, created_at desc);
create unique index roommate_verification_appeals_one_pending_idx
  on public.roommate_verification_appeals (verification_id)
  where status = 'pending';

create trigger roommate_verification_appeals_touch_updated_at
  before update on public.roommate_verification_appeals
  for each row
  execute function public.touch_updated_at();

alter table public.roommate_verification_appeals enable row level security;
revoke all on table public.roommate_verification_appeals from anon, authenticated;

grant select on table public.roommate_verification_appeals to authenticated;
grant insert (user_id, verification_id, reason, message)
  on table public.roommate_verification_appeals to authenticated;

create policy roommate_verification_appeals_select_own
  on public.roommate_verification_appeals
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy roommate_verification_appeals_select_admin
  on public.roommate_verification_appeals
  for select
  to authenticated
  using (public.is_admin());

create policy roommate_verification_appeals_insert_own
  on public.roommate_verification_appeals
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.roommate_verifications v
      where v.id = verification_id
        and v.user_id = (select auth.uid())
    )
  );

-- A new appeal is visible to moderators immediately and reopens the review.
create function public.roommate_verification_appeals_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.roommate_verifications
     set review_state = 'under_review'
   where id = new.verification_id
     and user_id = new.user_id;

  insert into public.roommate_moderation_events (user_id, action, reason)
  values (
    new.user_id,
    'flagged',
    left('Re-review requested: ' || new.message, 500)
  );

  return new;
end;
$$;

create trigger roommate_verification_appeals_flag
  after insert on public.roommate_verification_appeals
  for each row
  execute function public.roommate_verification_appeals_flag();

-- An administrator decision through admin_set_roommate_standing() resolves the
-- pending appeal, so moderation never leaves a request open after a decision.
create function public.roommate_verification_appeals_sync_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'verified' then
    update public.roommate_verification_appeals
       set status = 'approved',
           decision_note = coalesce(
             nullif(btrim(new.review_note), ''),
             'Reinstated after moderator review.'
           ),
           decided_at = now()
     where verification_id = new.id
       and status = 'pending';
  elsif new.status = 'blocked' then
    update public.roommate_verification_appeals
       set status = 'declined',
           decision_note = coalesce(
             nullif(btrim(new.blocked_reason), ''),
             'A moderator upheld the block after review.'
           ),
           decided_at = now()
     where verification_id = new.id
       and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger roommate_verification_appeals_sync_decision
  after update of status on public.roommate_verifications
  for each row
  execute function public.roommate_verification_appeals_sync_decision();
