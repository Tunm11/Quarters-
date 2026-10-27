-- A booked room gets a receipt and a renewal clock.
--
-- When the listing's provider approves a paid group's room, the booking is
-- final: a receipt is issued, the rent period sets the renewal date, and the
-- student sees the booking on Home until they renew or cancel.
--
-- Rules:
--   * one active booking per student — create_booking_group refuses another
--     while a receipt is active, so a booked student cannot book again;
--   * cancelling frees the room and closes the receipt and the group;
--   * renewing pushes the renewal date forward by one rent period. No card is
--     charged: payment is recorded, not processed.

create type public.booking_receipt_status as enum ('active', 'cancelled');

create table public.booking_receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.booking_groups (id) on delete cascade,
  receipt_number text not null unique,
  issued_at timestamptz not null default now(),
  -- When the rent next falls due / the booking must be renewed or cancelled.
  renewal_at timestamptz not null,
  status public.booking_receipt_status not null default 'active',
  renewed_at timestamptz,
  renewal_count integer not null default 0,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.booking_receipts is
  'Phase 2L: one receipt per approved group booking, carrying the renewal deadline.';
comment on column public.booking_receipts.renewal_at is
  'The rent period after issue; the Home card counts down to this moment.';

create index booking_receipts_status_idx
  on public.booking_receipts (status, renewal_at);

alter table public.booking_receipts enable row level security;
revoke all on table public.booking_receipts from anon, authenticated;

-- Members read their own receipt; no client writes, every change is an RPC.
grant select on table public.booking_receipts to authenticated;

create policy booking_receipts_select_members
  on public.booking_receipts
  for select
  to authenticated
  using (public.is_booking_group_member(group_id));

-- Cancelling from Home is a tenant action, distinct from everyone leaving a
-- collecting group or the lister declining the room.
alter table public.booking_groups
  drop constraint booking_groups_closed_reason_valid;

alter table public.booking_groups
  add constraint booking_groups_closed_reason_valid
  check (
    closed_reason is null
    or closed_reason in ('all_left', 'room_declined', 'tenant_cancelled')
  );

-- Issue the receipt and work out the renewal date from how the room is let.
create function public.issue_booking_receipt(
  p_group_id uuid,
  p_issued_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_life interval;
  v_number text;
begin
  select
    case l.rent_period
      when 'week' then interval '7 days'
      when 'month' then interval '1 month'
      when 'quarter' then interval '3 months'
      when 'term' then make_interval(months => coalesce(l.rent_session_months, 9))
      when 'year' then make_interval(months => coalesce(l.rent_session_months, 12))
      else interval '1 year'
    end
  into v_life
  from public.booking_groups g
  join public.listings l on l.id = g.listing_id
  where g.id = p_group_id;

  if v_life is null then
    raise exception 'That booking cannot be issued a receipt.' using errcode = '22023';
  end if;

  v_number := 'QT-' || to_char(p_issued_at, 'YYYYMMDD') || '-' ||
    upper(substr(replace(p_group_id::text, '-', ''), 1, 6));

  insert into public.booking_receipts (
    group_id,
    receipt_number,
    issued_at,
    renewal_at
  )
  values (p_group_id, v_number, p_issued_at, p_issued_at + v_life)
  on conflict (group_id) do nothing;
end;
$$;

comment on function public.issue_booking_receipt(uuid, timestamptz) is
  'Phase 2L: issues one receipt for an approved booking and sets its renewal date.';

-- Internal only: approval and the backfill call it. A client must not be able
-- to mint a receipt for a booking that was never approved.
revoke all on function public.issue_booking_receipt(uuid, timestamptz) from public, anon, authenticated;

-- Approving a room now also issues the receipt. Everything else about the
-- provider's decision stays the same.
create or replace function public.respond_to_room_reservation(
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

  if p_approve then
    if v_reservation.booking_group_id is not null then
      perform public.issue_booking_receipt(v_reservation.booking_group_id, now());
    end if;
  elsif v_reservation.booking_group_id is not null then
    update public.booking_groups
    set status = 'cancelled',
        closed_reason = 'room_declined',
        updated_at = now()
    where id = v_reservation.booking_group_id
      and status in ('collecting', 'paid');
  end if;
end;
$$;

revoke all on function public.respond_to_room_reservation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_room_reservation(uuid, boolean) to authenticated;

-- One active booking per student. A second group cannot start until the first
-- is cancelled (renewing keeps it active).
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

  if exists (
    select 1
    from public.booking_receipts r
    join public.booking_group_members m on m.group_id = r.group_id
    where r.status = 'active'
      and m.user_id = v_me
      and m.status = 'joined'
  ) then
    raise exception 'You already have a room booked. Renew or cancel that booking from Home first.'
      using errcode = '23505';
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

-- The tenant's side: cancel the booking, release the room and close the receipt.
create function public.cancel_booking(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_receipt public.booking_receipts%rowtype;
begin
  if v_me is null then
    raise exception 'Sign in to cancel this booking.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.booking_group_members m
    where m.group_id = p_group_id
      and m.user_id = v_me
      and m.status = 'joined'
  ) then
    raise exception 'You are not in this booking.' using errcode = '42501';
  end if;

  select r.* into v_receipt
  from public.booking_receipts r
  where r.group_id = p_group_id
    and r.status = 'active'
  for update;

  if v_receipt.id is null then
    raise exception 'This booking is already closed.' using errcode = '22023';
  end if;

  update public.booking_receipts
  set status = 'cancelled',
      cancelled_at = now()
  where id = v_receipt.id;

  update public.booking_groups
  set status = 'cancelled',
      closed_reason = 'tenant_cancelled',
      updated_at = now()
  where id = p_group_id;

  update public.listing_room_bookings
  set status = 'declined',
      resolved_at = now(),
      resolved_by = v_me
  where booking_group_id = p_group_id
    and status in ('requested', 'approved');
end;
$$;

comment on function public.cancel_booking(uuid) is
  'Phase 2L: a tenant cancels their booking; the room is released and the receipt closed.';

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Renew the rent: move the renewal deadline forward by one rent period.
create function public.renew_booking(p_group_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_receipt public.booking_receipts%rowtype;
  v_life interval;
  v_next timestamptz;
begin
  if v_me is null then
    raise exception 'Sign in to renew this booking.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.booking_group_members m
    where m.group_id = p_group_id
      and m.user_id = v_me
      and m.status = 'joined'
  ) then
    raise exception 'You are not in this booking.' using errcode = '42501';
  end if;

  select r.* into v_receipt
  from public.booking_receipts r
  where r.group_id = p_group_id
    and r.status = 'active'
  for update;

  if v_receipt.id is null then
    raise exception 'This booking is already closed.' using errcode = '22023';
  end if;

  select
    case l.rent_period
      when 'week' then interval '7 days'
      when 'month' then interval '1 month'
      when 'quarter' then interval '3 months'
      when 'term' then make_interval(months => coalesce(l.rent_session_months, 9))
      when 'year' then make_interval(months => coalesce(l.rent_session_months, 12))
      else interval '1 year'
    end
  into v_life
  from public.booking_groups g
  join public.listings l on l.id = g.listing_id
  where g.id = p_group_id;

  v_next := greatest(v_receipt.renewal_at, now()) + v_life;

  update public.booking_receipts
  set renewal_at = v_next,
      renewed_at = now(),
      renewal_count = renewal_count + 1
  where id = v_receipt.id;

  return v_next;
end;
$$;

comment on function public.renew_booking(uuid) is
  'Phase 2L: extends the renewal deadline by one rent period (payment recorded, not charged).';

revoke all on function public.renew_booking(uuid) from public, anon;
grant execute on function public.renew_booking(uuid) to authenticated;

-- Home reads this: the caller's bookings with the property and payment summary
-- a receipt needs, newest active first.
create function public.my_bookings()
returns table (
  group_id uuid,
  receipt_number text,
  status public.booking_receipt_status,
  issued_at timestamptz,
  renewal_at timestamptz,
  cancelled_at timestamptz,
  renewal_count integer,
  listing_id uuid,
  listing_title text,
  city text,
  neighbourhood text,
  institution text,
  accommodation_type public.accommodation_type,
  rent_amount numeric,
  rent_period public.rent_period,
  rent_session_months smallint,
  total_amount numeric,
  currency character(3),
  room_number smallint,
  group_status public.booking_group_status,
  paid_count integer,
  member_count integer,
  created_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.group_id,
    r.receipt_number,
    r.status,
    r.issued_at,
    r.renewal_at,
    r.cancelled_at,
    r.renewal_count,
    l.id,
    l.title,
    l.city,
    l.neighbourhood,
    l.institution,
    l.accommodation_type,
    l.rent_amount,
    l.rent_period,
    l.rent_session_months,
    g.total_amount,
    g.currency,
    g.room_number,
    g.status,
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
    ),
    g.created_by
  from public.booking_receipts r
  join public.booking_groups g on g.id = r.group_id
  join public.listings l on l.id = g.listing_id
  where exists (
    select 1
    from public.booking_group_members m
    where m.group_id = g.id
      and m.user_id = (select auth.uid())
      and m.status = 'joined'
  )
  order by (r.status = 'active') desc, r.issued_at desc;
$$;

comment on function public.my_bookings() is
  'Phase 2L: the caller''s receipts and renewal clocks, active bookings first.';

revoke all on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated;

-- Existing approved demo bookings get their receipt too, so Home has something
-- real to show before any new booking is approved.
do $$
declare
  booking record;
begin
  for booking in
    select distinct
      g.id,
      coalesce(b.resolved_at, g.updated_at, now()) as issued_at
    from public.booking_groups g
    join public.listing_room_bookings b on b.booking_group_id = g.id
    where b.status = 'approved'
      and g.status = 'paid'
  loop
    perform public.issue_booking_receipt(booking.id, booking.issued_at);
  end loop;
end;
$$;
