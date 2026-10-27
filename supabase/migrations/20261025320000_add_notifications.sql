-- The activity feed behind the Bell.
--
-- The Bell used to be a shortcut into roommate interests: no feed, no read
-- state, no badge. This adds all three.
--
-- Rows are written by the triggers below, never by clients. A notification is a
-- consequence of something else happening (an interest, a visit decision, a
-- room hold), so letting the app insert them would let one student notify
-- another. Clients may only read their own rows and stamp `read_at`.

create type public.notification_kind as enum (
  'roommate_interest',
  'roommate_accepted',
  'roommate_declined',
  'visit_requested',
  'visit_confirmed',
  'visit_declined',
  'room_requested',
  'room_approved',
  'room_declined'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  -- App-relative destination. Null means the row is informational only.
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint notifications_href_relative check (href is null or href like '/%')
);

comment on table public.notifications is
  'Phase 2M: the activity feed. One row per thing that happened to a student, with per-item read state.';
comment on column public.notifications.href is
  'App-relative path the row opens, e.g. /visits. Null when there is nothing to open.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- The badge count only ever looks at unread rows.
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;

-- Read everything about your own rows; the only writable column is read_at.
grant select (id, kind, title, body, href, read_at, created_at)
  on table public.notifications to authenticated;
grant update (read_at)
  on table public.notifications to authenticated;

create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The single insertion point for every trigger. Definer rights let the trigger
-- write for another account while clients cannot call it.
create function public.notify_user(
  p_user uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text default null,
  p_href text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, href)
  select p_user, p_kind, p_title, p_body, p_href
  where p_user is not null;
$$;

comment on function public.notify_user(uuid, public.notification_kind, text, text, text) is
  'Phase 2M: writes one activity row. Trigger-only; not executable by clients.';

revoke all on function public.notify_user(uuid, public.notification_kind, text, text, text)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- Roommate interests: the profile owner hears about a new interest, the sender
-- hears the answer.
------------------------------------------------------------------------------

create function public.notify_roommate_interest_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_sender text;
begin
  select p.user_id,
         coalesce(nullif(btrim(pr.display_name), ''), 'A student')
  into v_owner, v_sender
  from public.roommate_profiles p
  left join public.profiles pr on pr.id = new.sender_id
  where p.id = new.profile_id;

  if v_owner is null or v_owner = new.sender_id then
    return new;
  end if;

  perform public.notify_user(
    v_owner,
    'roommate_interest',
    'New roommate interest',
    v_sender || ' wants to connect with you.',
    '/roommates?view=interests'
  );

  return new;
end;
$$;

create trigger roommate_interests_notify_insert
  after insert on public.roommate_interests
  for each row
  execute function public.notify_roommate_interest_insert();

create function public.notify_roommate_interest_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('accepted', 'declined') then
    return new;
  end if;

  select p.user_id,
         coalesce(nullif(btrim(pr.display_name), ''), 'Your roommate')
  into v_owner, v_name
  from public.roommate_profiles p
  left join public.profiles pr on pr.id = p.user_id
  where p.id = new.profile_id;

  if new.status = 'accepted' then
    perform public.notify_user(
      new.sender_id,
      'roommate_accepted',
      'Roommate connection accepted',
      v_name || ' accepted your interest. You can now plan a visit or book a room together.',
      '/roommates'
    );
  else
    perform public.notify_user(
      new.sender_id,
      'roommate_declined',
      'Roommate interest declined',
      v_name || ' declined your interest.',
      '/roommates'
    );
  end if;

  return new;
end;
$$;

create trigger roommate_interests_notify_decision
  after update of status on public.roommate_interests
  for each row
  execute function public.notify_roommate_interest_decision();

------------------------------------------------------------------------------
-- Visits: the lister hears about new requests and answers, the student hears
-- the decision.
------------------------------------------------------------------------------

create function public.notify_visit_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select pv.owner_id, l.title
  into v_owner, v_title
  from public.listings l
  join public.providers pv on pv.id = l.provider_id
  where l.id = new.listing_id;

  if v_owner is null or v_owner = new.requester_id then
    return new;
  end if;

  perform public.notify_user(
    v_owner,
    'visit_requested',
    'New visit request',
    v_title || ' · ' || to_char(new.scheduled_for, 'DD Mon YYYY, HH24:MI'),
    '/provider'
  );

  return new;
end;
$$;

create trigger listing_viewing_requests_notify_insert
  after insert on public.listing_viewing_requests
  for each row
  execute function public.notify_visit_request_insert();

create function public.notify_visit_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_when text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('confirmed', 'declined') then
    return new;
  end if;

  select l.title, to_char(new.scheduled_for, 'DD Mon YYYY, HH24:MI')
  into v_title, v_when
  from public.listings l
  where l.id = new.listing_id;

  if new.status = 'confirmed' then
    perform public.notify_user(
      new.requester_id,
      'visit_confirmed',
      'Visit confirmed',
      v_title || ' on ' || v_when || ' is confirmed. Book your room after the visit.',
      '/visits'
    );
  else
    perform public.notify_user(
      new.requester_id,
      'visit_declined',
      'Visit declined',
      'The lister declined your visit to ' || v_title || '. You can request another time.',
      '/visits'
    );
  end if;

  return new;
end;
$$;

create trigger listing_viewing_requests_notify_decision
  after update of status on public.listing_viewing_requests
  for each row
  execute function public.notify_visit_decision();

------------------------------------------------------------------------------
-- Room reservations: the lister answers a hold, and the student is told.
------------------------------------------------------------------------------

create function public.notify_room_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if new.status <> 'requested' then
    return new;
  end if;

  select pv.owner_id, l.title
  into v_owner, v_title
  from public.listings l
  join public.providers pv on pv.id = l.provider_id
  where l.id = new.listing_id;

  if v_owner is null or v_owner = new.booked_by then
    return new;
  end if;

  perform public.notify_user(
    v_owner,
    'room_requested',
    'New room reservation request',
    'Room ' || new.room_number || ' at ' || v_title || ' is waiting for your answer.',
    '/provider'
  );

  return new;
end;
$$;

create trigger listing_room_bookings_notify_insert
  after insert on public.listing_room_bookings
  for each row
  execute function public.notify_room_request_insert();

create function public.notify_room_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('approved', 'declined') or new.booked_by is null then
    return new;
  end if;

  select l.title into v_title
  from public.listings l
  where l.id = new.listing_id;

  if new.status = 'approved' then
    perform public.notify_user(
      new.booked_by,
      'room_approved',
      'Room approved',
      'Room ' || new.room_number || ' at ' || v_title || ' is held for you.',
      '/visits'
    );
  else
    perform public.notify_user(
      new.booked_by,
      'room_declined',
      'Room request declined',
      'The lister could not hold Room ' || new.room_number || ' at ' || v_title || '. Pick another room.',
      '/visits'
    );
  end if;

  return new;
end;
$$;

create trigger listing_room_bookings_notify_decision
  after update of status on public.listing_room_bookings
  for each row
  execute function public.notify_room_decision();

-- Realtime: the Bell badge and the feed update without a refresh.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end
$$;
