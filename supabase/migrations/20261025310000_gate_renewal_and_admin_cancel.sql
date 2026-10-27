-- Rent is renewed only once the allocated period is over, and a paid booking is
-- cancelled only with QUARTERS administrator approval.
--
-- The UI hides the Renew button until the renewal date and shows support
-- guidance instead of a self-service cancel, but the database is the authority:
-- renewing early is rejected with the date it opens, and a tenant cannot cancel
-- their own paid booking at all.

create or replace function public.renew_booking(p_group_id uuid)
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

  if now() < v_receipt.renewal_at then
    raise exception 'Rent can be renewed from %.',
      to_char(v_receipt.renewal_at, 'DD Mon YYYY')
      using errcode = '22023';
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
  'Phase 2L: renews the rent only after the current period ends, extending by one rent period.';

revoke all on function public.renew_booking(uuid) from public, anon;
grant execute on function public.renew_booking(uuid) to authenticated;

-- Cancelling a paid booking is an administrator action. Tenants are directed to
-- QUARTERS support in the app; only an administrator can actually close it.
create or replace function public.cancel_booking(p_group_id uuid)
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

  if not public.is_admin() then
    raise exception 'A paid booking can only be cancelled by a QUARTERS administrator. Message QUARTERS support with your receipt number.'
      using errcode = '42501';
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
  'Phase 2L: administrator-only cancellation of a paid booking; releases the room and closes the receipt.';

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
