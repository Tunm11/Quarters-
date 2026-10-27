-- Alerts when a saved room's rent or availability changes.
--
-- The Settings switch for "Updates on saved rooms" had no delivery behind it.
-- Two things were missing:
--
--   1. An account-level preference the database can read. The switch used to
--      live only in localStorage, where no trigger can see it, so it could not
--      gate anything.
--   2. A trigger on public.listings. Providers may already change rent,
--      billing period and availability in place; until now nothing watched for
--      it.
--
-- Both triggers write through public.notify_user(), the single insertion point
-- for the activity feed. The existing notifications_send_push trigger therefore
-- delivers these rows as web push wherever the student has subscribed.

alter table public.profiles
  add column if not exists saved_room_alerts boolean not null default true;

comment on column public.profiles.saved_room_alerts is
  'Phase 2M: whether this account wants activity rows when a room it saved changes rent or availability. Owner-writable; read by the saved-room triggers.';

-- Column-level grant, matching the display_name/avatar_url pattern: the owner
-- may change this switch and nothing else.
grant update (saved_room_alerts) on table public.profiles to authenticated;

------------------------------------------------------------------------------
-- Rent or billing period changed.
------------------------------------------------------------------------------

create function public.notify_saved_room_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_saver uuid;
  v_body text;
begin
  -- A room that is not currently public has no page a student can open, so a
  -- quiet edit or a hidden room must not produce an alert.
  if not public.is_public_listing(new.id) then
    return new;
  end if;

  -- A published room always carries rent; the guard keeps the body sensible if
  -- a privileged edit ever lands in between.
  if new.rent_amount is null then
    return new;
  end if;

  select pv.owner_id into v_owner
  from public.listings l
  join public.providers pv on pv.id = l.provider_id
  where l.id = new.id;

  v_body := new.title || ' — rent is now ₦'
    || regexp_replace(to_char(new.rent_amount, 'FM999,999,999,999.00'), '\.00$', '')
    || case new.rent_period
         when 'week' then ' a week'
         when 'month' then ' a month'
         when 'quarter' then ' a quarter'
         when 'term' then ' a term'
         when 'year' then ' a year'
         else ''
       end;

  if old.rent_amount is not null then
    v_body := v_body || ' (was ₦'
      || regexp_replace(to_char(old.rent_amount, 'FM999,999,999,999.00'), '\.00$', '')
      || case old.rent_period
           when 'week' then ' a week'
           when 'month' then ' a month'
           when 'quarter' then ' a quarter'
           when 'term' then ' a term'
           when 'year' then ' a year'
           else ''
         end
      || ')';
  end if;

  for v_saver in
    select s.user_id
    from public.saved_listings s
    left join public.profiles p on p.id = s.user_id
    where s.listing_id = new.id
      -- The provider does not need to be told about their own edit.
      and (v_owner is null or s.user_id <> v_owner)
      -- A missing profile row still gets alerts: the column defaults to true.
      and coalesce(p.saved_room_alerts, true)
  loop
    perform public.notify_user(
      v_saver,
      'saved_room_price_changed',
      'Rent changed on a saved room',
      v_body,
      '/property/' || new.id::text
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_saved_room_price_change() is
  'Alerts every saver when a public listing''s rent or billing period changes.';

create trigger listings_notify_saved_room_price_change
  after update of rent_amount, rent_period on public.listings
  for each row
  when (
    old.rent_amount is distinct from new.rent_amount
    or old.rent_period is distinct from new.rent_period
  )
  execute function public.notify_saved_room_price_change();

------------------------------------------------------------------------------
-- Availability changed.
------------------------------------------------------------------------------

create function public.notify_saved_room_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_saver uuid;
  v_kind public.notification_kind;
  v_title text;
  v_body text;
begin
  if not public.is_public_listing(new.id) then
    return new;
  end if;

  select pv.owner_id into v_owner
  from public.listings l
  join public.providers pv on pv.id = l.provider_id
  where l.id = new.id;

  v_body := new.title || ' is now ' || new.availability_status::text
    || ' (was ' || old.availability_status::text || ').';

  if new.availability_status = 'available' then
    v_kind := 'saved_room_available';
    v_title := 'A saved room is available again';
  elsif new.availability_status = 'limited' then
    v_kind := 'saved_room_availability_changed';
    v_title := 'Limited rooms left at a saved property';
  else
    v_kind := 'saved_room_availability_changed';
    v_title := 'A saved room is now unavailable';
  end if;

  for v_saver in
    select s.user_id
    from public.saved_listings s
    left join public.profiles p on p.id = s.user_id
    where s.listing_id = new.id
      and (v_owner is null or s.user_id <> v_owner)
      and coalesce(p.saved_room_alerts, true)
  loop
    perform public.notify_user(
      v_saver,
      v_kind,
      v_title,
      v_body,
      '/property/' || new.id::text
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_saved_room_availability_change() is
  'Alerts every saver when a public listing''s availability changes.';

create trigger listings_notify_saved_room_availability_change
  after update of availability_status on public.listings
  for each row
  when (old.availability_status is distinct from new.availability_status)
  execute function public.notify_saved_room_availability_change();
