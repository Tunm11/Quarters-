-- Sharing a room with a roommate, and asking to visit it together.
--
-- Two additive changes:
--   * roommate_messages gains an optional listing reference, so a message can
--     carry a property card (photo, title, rent) instead of a bare sentence;
--   * listing_group_visits records "we would like to view this place together",
--     which the listing's provider can read so both students appear under the
--     property.
--
-- Nothing here decides rent, viewings or bookings between the two students:
-- that is the booking-together step still to come.

alter table public.roommate_messages
  add column shared_listing_id uuid references public.listings (id) on delete set null;

comment on column public.roommate_messages.shared_listing_id is
  'Set when the message carries a property card; the listing a roommate was sent.';

create index roommate_messages_shared_listing_idx
  on public.roommate_messages (shared_listing_id)
  where shared_listing_id is not null;

-- The card reference joins the readable columns; the card itself is rendered
-- from the public listing read model.
grant select (id, profile_id, student_id, sender_id, body, created_at, read_at, shared_listing_id)
  on table public.roommate_messages to authenticated;

grant insert (profile_id, student_id, sender_id, body, shared_listing_id)
  on table public.roommate_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Group visits
-- ---------------------------------------------------------------------------

create table public.listing_group_visits (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- The student who shared the room and asked for the joint viewing.
  requested_by uuid not null references auth.users (id) on delete cascade,
  -- The connected roommate they asked to visit with.
  roommate_profile_id uuid not null
    references public.roommate_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One request per pair per property: tapping the button again is harmless.
  constraint listing_group_visits_one_per_pair
    unique (listing_id, requested_by, roommate_profile_id)
);

comment on table public.listing_group_visits is
  'A student and a connected roommate asking to view a property together. Read by the provider; no booking side effects yet.';

create index listing_group_visits_listing_idx
  on public.listing_group_visits (listing_id, created_at desc);

alter table public.listing_group_visits enable row level security;

revoke all on table public.listing_group_visits from anon, authenticated;

-- requested_by stays out of the column grant: it is personal data, and both
-- students already know who they are.
grant select (id, listing_id, roommate_profile_id, created_at)
  on table public.listing_group_visits to authenticated;

grant insert (listing_id, requested_by, roommate_profile_id)
  on table public.listing_group_visits to authenticated;

create policy listing_group_visits_select_requester
  on public.listing_group_visits
  for select
  to authenticated
  using (requested_by = (select auth.uid()));

-- The roommate named in the request sees it in the shared thread.
create policy listing_group_visits_select_roommate
  on public.listing_group_visits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.roommate_profiles p
      where p.id = roommate_profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- The provider sees the pair under their own listing.
create policy listing_group_visits_select_provider
  on public.listing_group_visits
  for select
  to authenticated
  using (public.owns_listing(listing_id));

-- A student may only ask about a public listing, as themselves, for a roommate
-- they are actually connected to (their interest was accepted).
create policy listing_group_visits_insert_connected
  on public.listing_group_visits
  for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and public.is_public_listing(listing_id)
    and exists (
      select 1
      from public.roommate_interests i
      where i.sender_id = (select auth.uid())
        and i.profile_id = roommate_profile_id
        and i.status = 'accepted'
    )
  );
