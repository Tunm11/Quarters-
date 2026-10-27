-- Booking a room together, and splitting the rent between the roommates.
--
-- Two tables plus the RPCs that own the rules:
--   * booking_groups        — one room, one rent total, one currency;
--   * booking_group_members — who is in it, their share, and whether they paid.
--
-- The rules live in the database, not the UI:
--   * a group starts with two or more connected roommates (the creator plus at
--     least one accepted roommate connection);
--   * the rent is split evenly to the kobo, with the leftover kobo going to the
--     earlier members, so the shares always add up to the total exactly;
--   * a member may leave only while nobody has paid, and the split is then
--     re-calculated over the people still in the group — which also cancels the
--     group when the last person leaves;
--   * paying stamps that member's share, and when the last share is paid the
--     group becomes `paid` and the room is held for the creator.
--
-- Money is NUMERIC, never a float. Payment itself is recorded here only: no card
-- or transfer is processed by this build.

create type public.booking_group_status as enum ('collecting', 'paid', 'cancelled');

create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  room_number smallint not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  total_amount numeric(12, 2) not null,
  currency character(3) not null default 'NGN',
  status public.booking_group_status not null default 'collecting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_groups_total_positive check (total_amount > 0),
  constraint booking_groups_room_range check (room_number between 1 and 200)
);

comment on table public.booking_groups is
  'Phase 2J: a room booked together by two or more roommates, with the rent split between them.';

create index booking_groups_listing_idx
  on public.booking_groups (listing_id, created_at desc);

create table public.booking_group_members (
  group_id uuid not null references public.booking_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Insertion order, so the split is deterministic (earlier people take the
  -- leftover kobo).
  member_order smallint not null default 0,
  share_amount numeric(12, 2) not null default 0,
  paid_at timestamptz,
  status text not null default 'joined',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint booking_group_members_status
    check (status in ('joined', 'left')),
  constraint booking_group_members_share
    check (share_amount >= 0)
);

comment on table public.booking_group_members is
  'Phase 2J: one row per roommate in a group booking, with their share and payment time.';
comment on column public.booking_group_members.share_amount is
  'Authoritative share for this member, recalculated whenever the group changes before any payment.';

create index booking_group_members_user_idx
  on public.booking_group_members (user_id, joined_at desc);

alter table public.booking_groups enable row level security;
alter table public.booking_group_members enable row level security;

-- No client writes at all: every mutation goes through the RPCs below, which
-- enforce the split and payment rules in one transaction.
revoke all on table public.booking_groups from anon, authenticated;
revoke all on table public.booking_group_members from anon, authenticated;

grant select (id, listing_id, room_number, created_by, total_amount, currency, status, created_at)
  on table public.booking_groups to authenticated;
grant select (group_id, user_id, member_order, share_amount, paid_at, status, joined_at)
  on table public.booking_group_members to authenticated;

create function public.is_booking_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking_group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_booking_group_member(uuid) from public, anon;
grant execute on function public.is_booking_group_member(uuid) to authenticated;

create policy booking_groups_select_members
  on public.booking_groups
  for select
  to authenticated
  using (public.is_booking_group_member(id));

create policy booking_group_members_select_members
  on public.booking_group_members
  for select
  to authenticated
  using (public.is_booking_group_member(group_id));

-- Two accounts are roommates when an accepted interest links one's profile to
-- the other, in either direction.
create function public.roommates_connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null
    and p_b is not null
    and p_a <> p_b
    and exists (
      select 1
      from public.roommate_interests i
      join public.roommate_profiles p on p.id = i.profile_id
      where i.status = 'accepted'
        and (
          (i.sender_id = p_a and p.user_id = p_b)
          or (i.sender_id = p_b and p.user_id = p_a)
        )
    );
$$;

comment on function public.roommates_connected(uuid, uuid) is
  'Phase 2J: true when the two accounts are accepted roommate connections.';

revoke all on function public.roommates_connected(uuid, uuid) from public, anon;
grant execute on function public.roommates_connected(uuid, uuid) to authenticated;

-- Split the rent across the members still in the group. Runs only while nobody
-- has paid: once a share is settled, the amounts are frozen.
create function public.recalculate_booking_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(12, 2);
  v_count integer;
  v_base numeric(12, 2);
  v_remainder integer;
  v_index integer := 0;
  v_member record;
begin
  select total_amount into v_total
  from public.booking_groups
  where id = p_group_id
    and status = 'collecting';

  if v_total is null then
    return;
  end if;

  if exists (
    select 1
    from public.booking_group_members
    where group_id = p_group_id
      and paid_at is not null
  ) then
    return;
  end if;

  select count(*)::integer into v_count
  from public.booking_group_members
  where group_id = p_group_id
    and status = 'joined';

  if v_count = 0 then
    update public.booking_groups
    set status = 'cancelled', updated_at = now()
    where id = p_group_id;
    return;
  end if;

  -- Whole kobo each, then hand the remainder to the earliest members.
  v_base := floor(v_total * 100 / v_count) / 100;
  v_remainder := round(v_total * 100)::integer - round(v_base * 100)::integer * v_count;

  for v_member in
    select user_id
    from public.booking_group_members
    where group_id = p_group_id
      and status = 'joined'
    order by member_order, user_id
  loop
    update public.booking_group_members
    set share_amount = v_base + case when v_index < v_remainder then 0.01 else 0 end
    where group_id = p_group_id
      and user_id = v_member.user_id;
    v_index := v_index + 1;
  end loop;
end;
$$;

revoke all on function public.recalculate_booking_group(uuid) from public, anon;
grant execute on function public.recalculate_booking_group(uuid) to authenticated;

-- Start a group booking: the caller plus one or more connected roommates, on a
-- room that is free, with the listing's rent as the total.
create function public.create_booking_group(
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
      and r.status = 'confirmed'
  ) then
    raise exception 'A confirmed visit is needed before booking.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.listing_room_bookings b
    where b.listing_id = p_listing_id
      and b.room_number = p_room_number
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

comment on function public.create_booking_group(uuid, integer, uuid[]) is
  'Phase 2J: creates a group booking with the rent split across connected roommates.';

revoke all on function public.create_booking_group(uuid, integer, uuid[]) from public, anon;
grant execute on function public.create_booking_group(uuid, integer, uuid[]) to authenticated;

-- Leave a group booking. Allowed only before anyone has paid; the remaining
-- roommates then carry the rent between them.
create function public.leave_booking_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to change this booking.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.booking_group_members
    where group_id = p_group_id
      and paid_at is not null
  ) then
    raise exception 'Someone has already paid, so the booking can no longer change.'
      using errcode = '22023';
  end if;

  update public.booking_group_members
  set status = 'left', share_amount = 0, paid_at = null
  where group_id = p_group_id
    and user_id = v_me
    and status = 'joined';

  if not found then
    raise exception 'You are not in this booking.' using errcode = '42501';
  end if;

  perform public.recalculate_booking_group(p_group_id);
end;
$$;

comment on function public.leave_booking_group(uuid) is
  'Phase 2J: leaves a group booking before payment and re-splits the rent.';

revoke all on function public.leave_booking_group(uuid) from public, anon;
grant execute on function public.leave_booking_group(uuid) to authenticated;

-- Record the caller's share as paid. When the last share lands, the group is
-- settled and the room is held for whoever created the booking.
create function public.pay_booking_share(p_group_id uuid)
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
        and b.booked_by <> v_group.created_by
    ) then
      raise exception 'That room was taken while the group was paying.' using errcode = '23505';
    end if;

    update public.booking_groups
    set status = 'paid', updated_at = now()
    where id = p_group_id;

    insert into public.listing_room_bookings (listing_id, room_number, booked_by)
    values (v_group.listing_id, v_group.room_number, v_group.created_by)
    on conflict (listing_id, room_number) do nothing;
  end if;
end;
$$;

comment on function public.pay_booking_share(uuid) is
  'Phase 2J: records the caller''s share as paid; settles the group when everyone has.';

revoke all on function public.pay_booking_share(uuid) from public, anon;
grant execute on function public.pay_booking_share(uuid) to authenticated;

-- The group itself: room, rent and status. Members-only.
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
  created_at timestamptz
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
    g.created_at
  from public.booking_groups g
  join public.listings l on l.id = g.listing_id
  where g.id = p_group_id
    and public.is_booking_group_member(g.id);
$$;

revoke all on function public.booking_group_info(uuid) from public, anon;
grant execute on function public.booking_group_info(uuid) to authenticated;

-- Who is in the group, their share, and whether they have paid. Names come from
-- the private profiles table, which is why this is SECURITY DEFINER.
create function public.booking_group_participants(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  status text,
  share_amount numeric,
  paid_at timestamptz,
  is_creator boolean,
  member_order smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Roommate') as display_name,
    m.status,
    m.share_amount,
    m.paid_at,
    (m.user_id = g.created_by) as is_creator,
    m.member_order
  from public.booking_group_members m
  join public.booking_groups g on g.id = m.group_id
  left join public.profiles p on p.id = m.user_id
  where m.group_id = p_group_id
    and public.is_booking_group_member(p_group_id)
  order by m.member_order, m.user_id;
$$;

revoke all on function public.booking_group_participants(uuid) from public, anon;
grant execute on function public.booking_group_participants(uuid) to authenticated;

-- The caller's active group booking for a listing, so the property screen can
-- reopen it instead of starting a second one.
create function public.my_booking_group(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id
  from public.booking_groups g
  join public.booking_group_members m
    on m.group_id = g.id
   and m.user_id = (select auth.uid())
   and m.status = 'joined'
  where g.listing_id = p_listing_id
    and g.status in ('collecting', 'paid')
  order by g.created_at desc
  limit 1;
$$;

revoke all on function public.my_booking_group(uuid) from public, anon;
grant execute on function public.my_booking_group(uuid) to authenticated;
