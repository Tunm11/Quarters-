-- Room-level reservations for listings that stand for many rooms.
--
-- A hostel block or an apartment building is published once, but every room in
-- it is let to one student. `listings.total_rooms` already says how many exist;
-- this table records which of them are taken, so the room picker can disable
-- the ones somebody else already holds.
--
-- The visit is the gate: a student may only reserve a room after the provider
-- confirmed their viewing request. Nothing here touches rent, deposits or
-- contracts — that stays with the provider.

create table public.listing_room_bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  room_number smallint not null,
  -- Null means the room is occupied by a resident who is not a QUARTERS
  -- student (demo occupancy, or a booking taken by the provider directly).
  booked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint listing_room_bookings_number_range
    check (room_number between 1 and 200)
);

comment on table public.listing_room_bookings is
  'One row per taken room. Available rooms are 1..listings.total_rooms minus these rows.';
comment on column public.listing_room_bookings.booked_by is
  'The student holding the room; null when occupied outside QUARTERS.';

create index listing_room_bookings_listing_idx
  on public.listing_room_bookings (listing_id);

-- A room is held by one student, and a student holds at most one room per
-- listing. Null occupants are exempt: several outside residents may occupy
-- rooms in the same building.
create unique index listing_room_bookings_room_idx
  on public.listing_room_bookings (listing_id, room_number);

create unique index listing_room_bookings_one_per_student_idx
  on public.listing_room_bookings (listing_id, booked_by)
  where booked_by is not null;

alter table public.listing_room_bookings enable row level security;

revoke all on table public.listing_room_bookings from anon, authenticated;

-- Availability is readable by signed-in students; who holds a room is not.
grant select (id, listing_id, room_number, created_at)
  on table public.listing_room_bookings to authenticated;

grant insert (listing_id, room_number, booked_by)
  on table public.listing_room_bookings to authenticated;

create policy listing_room_bookings_select_public_listings
  on public.listing_room_bookings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and public.is_public_listing(l.id)
    )
  );

-- A student reserves as themselves, for a real room of a published listing,
-- and only once the provider has confirmed their visit.
create policy listing_room_bookings_insert_confirmed_visitor
  on public.listing_room_bookings
  for insert
  to authenticated
  with check (
    booked_by = (select auth.uid())
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and public.is_public_listing(l.id)
        and room_number <= coalesce(l.total_rooms, 1)
    )
    and exists (
      select 1
      from public.listing_viewing_requests r
      where r.listing_id = listing_id
        and r.requester_id = (select auth.uid())
        and r.status = 'confirmed'
    )
  );

-- Which room did the caller take? A definer function keeps every other
-- student's booking private while letting the page show its own reservation.
create or replace function public.my_listing_room_booking(target_listing uuid)
returns smallint
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.room_number
  from public.listing_room_bookings b
  where b.listing_id = target_listing
    and b.booked_by = (select auth.uid())
  limit 1;
$$;

comment on function public.my_listing_room_booking(uuid) is
  'The room the caller holds in this listing, or null.';

revoke all on function public.my_listing_room_booking(uuid) from public, anon;
grant execute on function public.my_listing_room_booking(uuid) to authenticated;
