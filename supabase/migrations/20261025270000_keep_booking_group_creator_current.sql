-- Booking together: the room must follow whoever is still in the booking.
--
-- leave_booking_group() re-splits the rent after a roommate leaves, but the
-- group keeps `created_by` as the account the room is held for at settlement.
-- If the person who started the booking leaves before anyone pays, the room
-- would otherwise be held for somebody who is no longer in the group. Hand the
-- booking to the earliest remaining member instead, then re-split.
--
-- Everything else is unchanged: a member can only leave before the first share
-- is paid, and the last person leaving cancels the group.

create or replace function public.leave_booking_group(p_group_id uuid)
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

  -- The room is held for the creator when everyone has paid. If the creator
  -- just left, the earliest roommate still in takes over that role.
  update public.booking_groups g
  set created_by = coalesce(
        (
          select m.user_id
          from public.booking_group_members m
          where m.group_id = p_group_id
            and m.status = 'joined'
          order by m.member_order, m.user_id
          limit 1
        ),
        g.created_by
      ),
      updated_at = now()
  where g.id = p_group_id
    and g.created_by = v_me
    and g.status = 'collecting';

  perform public.recalculate_booking_group(p_group_id);
end;
$$;

comment on function public.leave_booking_group(uuid) is
  'Phase 2J: leaves a group booking before payment, hands the booking to a remaining member and re-splits the rent.';

revoke all on function public.leave_booking_group(uuid) from public, anon;
grant execute on function public.leave_booking_group(uuid) to authenticated;
