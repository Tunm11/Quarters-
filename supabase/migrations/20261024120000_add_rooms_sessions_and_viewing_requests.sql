-- Phase 2D — rooms, rent sessions and viewing requests.
--
-- Purely additive. Nothing existing is dropped, rewritten or re-policied:
--
--   * listings.total_rooms         how many rooms/bed spaces the property has
--                                  (a hostel or block can have 12 or more).
--   * listings.rent_session_months the length of the rent session in months
--                                  where the period alone is vague. Nigerian
--                                  student hostels commonly charge per
--                                  9-month session or a 12-month year, so the
--                                  existing rent_period enum ('term', 'year')
--                                  is not enough on its own.
--   * listing_viewing_requests     persisted "Book a Visit" requests. A visit
--                                  request is not a tenancy and costs nothing.
--
-- Both new columns are nullable, so every existing row stays valid and the
-- current frontend keeps working before providers populate them.

alter table public.listings
  add column total_rooms smallint,
  add column rent_session_months smallint;

comment on column public.listings.total_rooms is
  'Phase 2D: total rooms or bed spaces offered. NULL when the provider has not stated it.';
comment on column public.listings.rent_session_months is
  'Phase 2D: rent session length in months when rent_period is term/year (e.g. 9 or 12). NULL otherwise.';

alter table public.listings
  add constraint listings_total_rooms_range
    check (total_rooms is null or total_rooms between 1 and 200),
  add constraint listings_rent_session_months_range
    check (rent_session_months is null or rent_session_months between 1 and 24);

-- Same column-level grant model as the rest of the table: both values are
-- public-safe, and only a signed-in provider may write them (RLS then limits
-- that to approved owners of the listing).
grant select (total_rooms, rent_session_months)
  on table public.listings to anon, authenticated;

grant insert (total_rooms, rent_session_months)
  on table public.listings to authenticated;

grant update (total_rooms, rent_session_months)
  on table public.listings to authenticated;

-- ---------------------------------------------------------------------------
-- Viewing requests ("Book a Visit")
-- ---------------------------------------------------------------------------

create type public.viewing_request_status as enum (
  'pending',
  'confirmed',
  'declined',
  'cancelled',
  'completed'
);

create table public.listing_viewing_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- The signed-in student requesting the visit. Never exposed through the
  -- table's column grants; a provider dashboard will read it through a checked
  -- RPC once that screen exists.
  requester_id uuid not null references auth.users (id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.viewing_request_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_viewing_requests_note_length
    check (note is null or char_length(btrim(note)) between 1 and 500)
);

comment on table public.listing_viewing_requests is
  'Phase 2D: student requests to view a published property before renting.';
comment on column public.listing_viewing_requests.scheduled_for is
  'Requested visit start, in the requester''s chosen slot. A request, not a confirmed appointment.';
comment on column public.listing_viewing_requests.status is
  'pending | confirmed | declined | cancelled | completed. Clients may only insert pending requests.';
comment on column public.listing_viewing_requests.requester_id is
  'Requester account. No client column grant; read through RLS-scoped own rows only.';

create index listing_viewing_requests_listing_idx
  on public.listing_viewing_requests (listing_id, scheduled_for);

create index listing_viewing_requests_requester_idx
  on public.listing_viewing_requests (requester_id, created_at desc);

-- One open request per person per property: a double tap or a refreshed form
-- cannot create a duplicate booking.
create unique index listing_viewing_requests_one_open_idx
  on public.listing_viewing_requests (listing_id, requester_id)
  where status in ('pending', 'confirmed');

create trigger listing_viewing_requests_touch_updated_at
  before update on public.listing_viewing_requests
  for each row
  execute function public.touch_updated_at();

alter table public.listing_viewing_requests enable row level security;

revoke all on table public.listing_viewing_requests from anon, authenticated;

-- requester_id is deliberately absent: a client never needs to read it and it
-- is personal data. RLS still discriminates rows by it.
grant select (id, listing_id, scheduled_for, status, note, created_at, updated_at)
  on table public.listing_viewing_requests to authenticated;

-- status is absent from insert: the default 'pending' is the only value a
-- client can create, and status !== 'pending' is rejected by the policy below.
grant insert (listing_id, requester_id, scheduled_for, note)
  on table public.listing_viewing_requests to authenticated;

create policy listing_viewing_requests_select_own
  on public.listing_viewing_requests
  for select
  to authenticated
  using (requester_id = (select auth.uid()));

-- The managing provider can read requests for their own listings, so the
-- provider dashboard will not need a service-role key.
create policy listing_viewing_requests_select_provider
  on public.listing_viewing_requests
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_viewing_requests_select_admin
  on public.listing_viewing_requests
  for select
  to authenticated
  using (public.is_admin());

-- A student may only request a visit as themselves, only for a listing that is
-- publicly visible (published, not hidden, approved provider), and only with
-- the default pending status. A pending, rejected or suspended provider cannot
-- gain anything here: the listing itself is not public unless approved.
create policy listing_viewing_requests_insert_own
  on public.listing_viewing_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and public.is_public_listing(listing_id)
  );

-- No update or delete grant/policy for clients in this phase: a request is
-- append-only until the provider dashboard (confirm/decline) and requester
-- cancellation flows ship with their own audited policies.
-- Anonymous visitors have no grant at all: they cannot read or create requests.
