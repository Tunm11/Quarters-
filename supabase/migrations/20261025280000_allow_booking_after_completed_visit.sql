-- Booking together: a completed viewing still unlocks the room.
--
-- create_booking_group() required the caller's viewing request to be
-- 'confirmed'. A provider marks a visit 'completed' once it has happened, which
-- is exactly when a student is ready to pay for the room, so accept either
-- status. Everything else about the rule stays the same: the room must be free,
-- the listing public, and the group made of connected roommates.

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
  'Phase 2J: creates a group booking after a confirmed or completed visit, with the rent split across connected roommates.';

revoke all on function public.create_booking_group(uuid, integer, uuid[]) from public, anon;
grant execute on function public.create_booking_group(uuid, integer, uuid[]) to authenticated;
