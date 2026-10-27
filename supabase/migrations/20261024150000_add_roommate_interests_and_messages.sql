-- Phase 2E — "Send interest" and roommate chat.
--
-- Additive: two new tables.
--
--   * roommate_interests  one row per student per profile: "I'd like to live
--                         with this person". Status starts pending and only a
--                         future provider-style review/dashboard changes it.
--   * roommate_messages   a lightweight thread keyed by (profile_id,
--                         student_id). The interested student writes as
--                         themselves; the profile owner can reply. No read
--                         receipts, attachments or realtime in this phase.
--
-- Neither table exposes anyone's account id to anonymous visitors: both are
-- available to authenticated users only, and RLS scopes every row to the two
-- participants.

create type public.roommate_interest_status as enum (
  'pending',
  'accepted',
  'declined',
  'withdrawn'
);

create table public.roommate_interests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.roommate_profiles (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  status public.roommate_interest_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One interest per student per profile: a double tap or refreshed form cannot
  -- create duplicates.
  constraint roommate_interests_one_per_student unique (profile_id, sender_id)
);

comment on table public.roommate_interests is
  'Phase 2E: a signed-in student''s interest in sharing with a roommate profile.';
comment on column public.roommate_interests.status is
  'pending | accepted | declined | withdrawn. Clients may only create pending rows.';

create index roommate_interests_profile_idx
  on public.roommate_interests (profile_id, created_at desc);

create index roommate_interests_sender_idx
  on public.roommate_interests (sender_id, created_at desc);

create trigger roommate_interests_touch_updated_at
  before update on public.roommate_interests
  for each row
  execute function public.touch_updated_at();

alter table public.roommate_interests enable row level security;

revoke all on table public.roommate_interests from anon, authenticated;

grant select (id, profile_id, sender_id, status, created_at, updated_at)
  on table public.roommate_interests to authenticated;

grant insert (profile_id, sender_id)
  on table public.roommate_interests to authenticated;

create policy roommate_interests_select_own
  on public.roommate_interests
  for select
  to authenticated
  using (sender_id = (select auth.uid()));

create policy roommate_interests_select_profile_owner
  on public.roommate_interests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.roommate_profiles p
      where p.id = profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- A student may only express interest as themselves, for a profile that is
-- currently discoverable, and never for their own profile. Status is not
-- granted on insert, so the column default 'pending' is the only value written.
create policy roommate_interests_insert_own
  on public.roommate_interests
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.roommate_profiles p
      where p.id = profile_id
        and p.is_discoverable
        and (p.user_id is null or p.user_id <> (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

create table public.roommate_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.roommate_profiles (id) on delete cascade,
  -- Thread key: the interested student. Both participants can read the thread.
  student_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint roommate_messages_body_length
    check (char_length(btrim(body)) between 1 and 1000)
);

comment on table public.roommate_messages is
  'Phase 2E: messages between a student and the owner of a roommate profile.';
comment on column public.roommate_messages.student_id is
  'Thread key: the student who opened the conversation about this profile.';

create index roommate_messages_thread_idx
  on public.roommate_messages (profile_id, student_id, created_at);

alter table public.roommate_messages enable row level security;

revoke all on table public.roommate_messages from anon, authenticated;

grant select (id, profile_id, student_id, sender_id, body, created_at)
  on table public.roommate_messages to authenticated;

grant insert (profile_id, student_id, sender_id, body)
  on table public.roommate_messages to authenticated;

create policy roommate_messages_select_participants
  on public.roommate_messages
  for select
  to authenticated
  using (
    sender_id = (select auth.uid())
    or student_id = (select auth.uid())
    or exists (
      select 1
      from public.roommate_profiles p
      where p.id = profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- Only the two participants may write: the student on their own thread, or the
-- profile owner replying into a thread on their profile. The profile must still
-- be discoverable (or belong to the writer) so a hidden profile cannot be used
-- as a messaging channel.
create policy roommate_messages_insert_participants
  on public.roommate_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.roommate_profiles p
        where p.id = profile_id
          and p.user_id = (select auth.uid())
      )
    )
    and exists (
      select 1
      from public.roommate_profiles p
      where p.id = profile_id
        and (p.is_discoverable or p.user_id = (select auth.uid()))
    )
  );

-- No update/delete grant for clients: messages are append-only in this phase.
