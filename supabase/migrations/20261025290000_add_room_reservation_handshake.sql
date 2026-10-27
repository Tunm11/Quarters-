-- Room reservations become a request the listing's provider answers.
--
-- Before this migration a student could insert a row into
-- listing_room_bookings and the room was instantly theirs: there was no
-- handshake with the owner or agent. Now a hold has a status:
--
--   requested -> the student (or their paid group) is asking for the room;
--   approved  -> the provider accepted, the room is theirs;
--   declined  -> the provider refused, and the room is free again.
--
-- Legacy rows were real occupancy, so they default to 'approved'. A requested
-- or approved hold keeps the room out of everyone else's picker; a declined
-- one does not. Clients can no longer write the table directly: every write
-- goes through the paid booking-group RPC or the provider's answer RPC.

create type public.room_reservation_status as enum (
  'requested',
  'approved',
  'declined'
);

alter table public.listing_room_bookings
  add column status public.room_reservation_status not null default 'approved',
  -- Set when the hold came from a paid group booking, so the provider can see
  -- how many roommates paid and a decline can close that group.
  add column booking_group_id uuid references public.booking_groups (id) on delete set null,
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users (id) on delete set null;

comment on column public.listing_room_bookings.status is
  'requested | approved | declined. Only requested/approved holds take the room.';
comment on column public.listing_room_bookings.booking_group_id is
  'The group booking that paid for this hold, when there is one.';

-- A room can only be held by one active request. A declined request stays as
-- history without blocking the room.
drop index public.listing_room_bookings_room_idx;

create unique index listing_room_bookings_room_idx
  on public.listing_room_bookings (listing_id, room_number)
  where status in ('requested', 'approved');

drop index public.listing_room_bookings_one_per_student_idx;

create unique index listing_room_bookings_one_per_student_idx
  on public.listing_room_bookings (listing_id, booked_by)
  where booked_by is not null
    and status in ('requested', 'approved');

-- Why a booking group closed. NULL means the roommates all left.
alter table public.booking_groups
  add column closed_reason text;

alter table public.booking_groups
  add constraint booking_groups_closed_reason_valid
  check (closed_reason is null or closed_reason in ('all_left', 'room_declined'));

comment on column public.booking_groups.closed_reason is
  'all_left | room_declined. Only meaningful once status is cancelled.';

-- Students cannot insert holds directly any more. They request one by paying
-- into a group booking, or a provider answers a request. Availability is read
-- through the RPCs below.
drop policy if exists listing_room_bookings_insert_confirmed_visitor
  on public.listing_room_bookings;

revoke insert on table public.listing_room_bookings from authenticated;

drop policy if exists listing_room_bookings_select_public_listings
  on public.listing_room_bookings;

create policy listing_room_bookings_select_active
  on public.listing_room_bookings
  for select
  to authenticated
  using (
    status in ('requested', 'approved')
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and public.is_public_listing(l.id)
    )
  );

grant select (status, booking_group_id, resolved_at)
  on table public.listing_room_bookings to authenticated;

-- Which rooms are currently held on a public listing. Room numbers only: who
-- holds a room stays private.
create function public.listing_taken_rooms(target_listing uuid)
returns setof smallint
language sql
stable
security definer
set search_path = ''
as $$
  select b.room_number
  from public.listing_room_bookings b
  where b.listing_id = target_listing
    and b.status in ('requested', 'approved')
    and public.is_public_listing(target_listing)
  order by b.room_number;
$$;

comment on function public.listing_taken_rooms(uuid) is
  'Phase 2K: room numbers held (requested or approved) on a public listing.';

revoke all on function public.listing_taken_rooms(uuid) from public, anon;
grant execute on function public.listing_taken_rooms(uuid) to authenticated;

-- The caller''s own room request/status on a listing. Group members can see
-- the hold their group paid for, not just the account that made it.
create function public.my_room_reservation(target_listing uuid)
returns table (
  room_number smallint,
  status public.room_reservation_status,
  booking_group_id uuid,
  requested_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.room_number,
    b.status,
    b.booking_group_id,
    b.created_at,
    b.resolved_at
  from public.listing_room_bookings b
  where b.listing_id = target_listing
    and (
      b.booked_by = (select auth.uid())
      or (
        b.booking_group_id is not null
        and public.is_booking_group_member(b.booking_group_id)
      )
    )
  order by b.created_at desc
  limit 1;
$$;

comment on function public.my_room_reservation(uuid) is
  'Phase 2K: the caller''s latest room hold on a listing, with its approval state.';

revoke all on function public.my_room_reservation(uuid) from public, anon;
grant execute on function public.my_room_reservation(uuid) to authenticated;

-- The provider inbox: holds on the caller''s own listings, newest unanswered
-- first, with the group''s payment progress so a decision is informed.
create function public.provider_room_reservations()
returns table (
  reservation_id uuid,
  listing_id uuid,
  listing_title text,
  room_number smallint,
  requester_name text,
  status public.room_reservation_status,
  requested_at timestamptz,
  resolved_at timestamptz,
  group_id uuid,
  group_status public.booking_group_status,
  total_amount numeric,
  currency character(3),
  paid_count integer,
  member_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.listing_id,
    l.title,
    b.room_number,
    coalesce(nullif(btrim(p.display_name), ''), 'Student') as requester_name,
    b.status,
    b.created_at,
    b.resolved_at,
    g.id,
    g.status,
    g.total_amount,
    g.currency,
    (
      select count(*)::integer
      from public.booking_group_members m
      where m.group_id = g.id
        and m.status = 'joined'
        and m.paid_at is not null
    ),
    (
      select count(*)::integer
      from public.booking_group_members m
      where m.group_id = g.id
        and m.status = 'joined'
    )
  from public.listing_room_bookings b
  join public.listings l on l.id = b.listing_id
  left join public.profiles p on p.id = b.booked_by
  left join public.booking_groups g on g.id = b.booking_group_id
  where public.owns_listing(b.listing_id)
    and b.booked_by is not null
  order by (b.status = 'requested') desc, b.created_at desc
  limit 50;
$$;

comment on function public.provider_room_reservations() is
  'Phase 2K: room holds on the caller''s listings, unanswered requests first.';

revoke all on function public.provider_room_reservations() from public, anon;
grant execute on function public.provider_room_reservations() to authenticated;

-- Approve or decline a request. Declining closes the paid group, because that
-- group was formed to take this exact room and the room is no longer on offer.
create function public.respond_to_room_reservation(
  p_reservation_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.listing_room_bookings%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to answer reservations.' using errcode = '42501';
  end if;

  select b.*
    into v_reservation
  from public.listing_room_bookings b
  where b.id = p_reservation_id
    and public.owns_listing(b.listing_id)
  for update;

  if v_reservation.id is null then
    raise exception 'That reservation is not on one of your listings.'
      using errcode = '42501';
  end if;

  if v_reservation.status <> 'requested' then
    raise exception 'That request has already been answered.' using errcode = '22023';
  end if;

  update public.listing_room_bookings
  set status = (case when p_approve then 'approved' else 'declined' end)::public.room_reservation_status,
      resolved_at = now(),
      resolved_by = (select auth.uid())
  where id = p_reservation_id;

  if not p_approve and v_reservation.booking_group_id is not null then
    update public.booking_groups
    set status = 'cancelled',
        closed_reason = 'room_declined',
        updated_at = now()
    where id = v_reservation.booking_group_id
      and status in ('collecting', 'paid');
  end if;
end;
$$;

comment on function public.respond_to_room_reservation(uuid, boolean) is
  'Phase 2K: the listing owner approves or declines a room hold; a decline closes its group booking.';

revoke all on function public.respond_to_room_reservation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_room_reservation(uuid, boolean) to authenticated;

-- Creating a group checks active holds, not declined history.
create or replace function public.create_booking_group(
  p_listing_id uuid,
  p_room_number integer,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_total numeric(12, 2);
  v_currency character(3);
  v_total_rooms integer;
  v_group_id uuid;
  v_member uuid;
  v_position smallint := 0;
  v_count integer := 0;
begin
  if v_me is null then
    raise exception 'Sign in to book a room.' using errcode = '42501';
  end if;

  select l.rent_amount, l.currency, greatest(coalesce(l.total_rooms, 1), 1)
    into v_total, v_currency, v_total_rooms
  from public.listings l
  where l.id = p_listing_id
    and public.is_public_listing(l.id);

  if v_total is null or v_total <= 0 then
    raise exception 'This room cannot be booked yet.' using errcode = '22023';
  end if;

  if p_room_number is null
    or p_room_number < 1
    or p_room_number > v_total_rooms then
    raise exception 'Choose a room from this property.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.listing_viewing_requests r
    where r.listing_id = p_listing_id
      and r.requester_id = v_me
      and r.status in ('confirmed', 'completed')
  ) then
    raise exception 'A confirmed visit is needed before booking.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.listing_room_bookings b
    where b.listing_id = p_listing_id
      and b.room_number = p_room_number
      and b.status in ('requested', 'approved')
  ) then
    raise exception 'That room is already taken.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.booking_groups g
    where g.listing_id = p_listing_id
      and g.room_number = p_room_number
      and g.status in ('collecting', 'paid')
  ) then
    raise exception 'A group is already booking that room.' using errcode = '23505';
  end if;

  insert into public.booking_groups (listing_id, room_number, created_by, total_amount, currency)
  values (p_listing_id, p_room_number, v_me, v_total, v_currency)
  returning id into v_group_id;

  insert into public.booking_group_members (group_id, user_id, member_order)
  values (v_group_id, v_me, 0);
  v_position := 1;
  v_count := 1;

  for v_member in
    select distinct m
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
    where m is not null
      and m <> v_me
  loop
    if not public.roommates_connected(v_me, v_member) then
      raise exception 'You can only book with a connected roommate.' using errcode = '22023';
    end if;

    insert into public.booking_group_members (group_id, user_id, member_order)
    values (v_group_id, v_member, v_position);
    v_position := v_position + 1;
    v_count := v_count + 1;
  end loop;

  if v_count < 2 then
    raise exception 'Choose at least one roommate to book together.' using errcode = '22023';
  end if;

  perform public.recalculate_booking_group(v_group_id);
  return v_group_id;
end;
$$;

revoke all on function public.create_booking_group(uuid, integer, uuid[]) from public, anon;
grant execute on function public.create_booking_group(uuid, integer, uuid[]) to authenticated;

-- Full payment now creates a requested hold instead of silently taking the
-- room. The provider has the final say.
create or replace function public.pay_booking_share(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_group public.booking_groups%rowtype;
  v_unpaid integer;
begin
  if v_me is null then
    raise exception 'Sign in to pay your share.' using errcode = '42501';
  end if;

  select g.* into v_group
  from public.booking_groups g
  join public.booking_group_members m
    on m.group_id = g.id
   and m.user_id = v_me
   and m.status = 'joined'
  where g.id = p_group_id;

  if v_group.id is null then
    raise exception 'You are not in this booking.' using errcode = '42501';
  end if;

  if v_group.status = 'cancelled' then
    raise exception 'This booking was cancelled.' using errcode = '22023';
  end if;

  update public.booking_group_members
  set paid_at = now()
  where group_id = p_group_id
    and user_id = v_me
    and status = 'joined'
    and paid_at is null;

  if not found then
    raise exception 'Your share is already paid.' using errcode = '22023';
  end if;

  select count(*)::integer into v_unpaid
  from public.booking_group_members
  where group_id = p_group_id
    and status = 'joined'
    and paid_at is null;

  if v_unpaid = 0 then
    if exists (
      select 1
      from public.listing_room_bookings b
      where b.listing_id = v_group.listing_id
        and b.room_number = v_group.room_number
        and b.status in ('requested', 'approved')
    ) then
      raise exception 'That room was taken while the group was paying.' using errcode = '23505';
    end if;

    update public.booking_groups
    set status = 'paid', closed_reason = null, updated_at = now()
    where id = p_group_id;

    insert into public.listing_room_bookings (
      listing_id,
      room_number,
      booked_by,
      status,
      booking_group_id
    )
    values (
      v_group.listing_id,
      v_group.room_number,
      v_group.created_by,
      'requested',
      v_group.id
    );
  end if;
end;
$$;

comment on function public.pay_booking_share(uuid) is
  'Phase 2K: records the caller''s share and, when everyone has paid, requests the room from the provider.';

revoke all on function public.pay_booking_share(uuid) from public, anon;
grant execute on function public.pay_booking_share(uuid) to authenticated;

-- The student sees the reason their reservation was refused.
-- The return shape gains closed_reason, so the old function must be dropped
-- first (PostgreSQL will not change a function's return type in place).
drop function if exists public.booking_group_info(uuid);

create function public.booking_group_info(p_group_id uuid)
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  room_number smallint,
  total_amount numeric,
  currency character(3),
  status public.booking_group_status,
  created_by uuid,
  created_at timestamptz,
  closed_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.listing_id,
    l.title,
    g.room_number,
    g.total_amount,
    g.currency,
    g.status,
    g.created_by,
    g.created_at,
    g.closed_reason
  from public.booking_groups g
  join public.listings l on l.id = g.listing_id
  where g.id = p_group_id
    and public.is_booking_group_member(g.id);
$$;

revoke all on function public.booking_group_info(uuid) from public, anon;
grant execute on function public.booking_group_info(uuid) to authenticated;
