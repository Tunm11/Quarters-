-- The provider's approve/decline decision assigns an enum column from a CASE
-- expression, which PostgreSQL types as text. Cast it explicitly.

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

revoke all on function public.respond_to_room_reservation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_room_reservation(uuid, boolean) to authenticated;
