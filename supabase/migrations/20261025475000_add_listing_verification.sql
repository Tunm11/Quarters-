-- Listing-level trust: "verified" and "inspected", separate from provider approval.
--
-- Until now the only trust signal a room carried was its provider's approval,
-- which says the account may publish here — nothing about this particular room.
-- These two columns record checks QUARTERS actually performed on the listing
-- itself:
--
--   verified_at  — the address, rent and room details were checked against what
--                  the provider states.
--   inspected_at — someone from QUARTERS visited the property.
--
-- Both are NULL until a moderator sets them, and nothing in the provider flow
-- can set them: the columns are granted to authenticated only for reading, so
-- a lister cannot assert its own verification. Only
-- public.admin_set_listing_verification() writes them, and only for an
-- administrator.
--
-- Additive and non-destructive: two nullable columns, their grants and one
-- guard trigger. No existing row changes.

alter table public.listings
  add column verified_at timestamptz,
  add column inspected_at timestamptz;

comment on column public.listings.verified_at is
  'When a QUARTERS moderator verified the address, rent and room details. NULL means the listing has not been verified.';
comment on column public.listings.inspected_at is
  'When someone from QUARTERS inspected the property in person. NULL means no inspection is on record.';

-- An inspection is stronger evidence than a desk verification, so a listing
-- cannot claim one without the other. The RPC sets both together.
alter table public.listings
  add constraint listings_inspection_implies_verification
    check (inspected_at is null or verified_at is not null);

-- Readable wherever the listing is, including by anonymous visitors on a
-- published room. Never writable by a client role.
grant select (verified_at, inspected_at) on table public.listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Material edits drop the checks
-- ---------------------------------------------------------------------------
-- A verification is about what the listing said at the time. If the provider
-- later changes the title, the rent, the period, the location or the type, the
-- old check no longer covers it, so both marks are cleared and a moderator has
-- to look again. The moderator's own write sets the columns, so it is exempt.

create function public.clear_listing_verification_on_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verified_at is not distinct from old.verified_at
     and new.inspected_at is not distinct from old.inspected_at
     and (
       new.title is distinct from old.title
       or new.rent_amount is distinct from old.rent_amount
       or new.rent_period is distinct from old.rent_period
       or new.city is distinct from old.city
       or new.neighbourhood is distinct from old.neighbourhood
       or new.accommodation_type is distinct from old.accommodation_type
     )
  then
    new.verified_at := null;
    new.inspected_at := null;
  end if;

  return new;
end;
$$;

comment on function public.clear_listing_verification_on_edit() is
  'Phase 2P: a material edit by the provider drops verified_at and inspected_at so a stale badge cannot survive a changed room.';

revoke all on function public.clear_listing_verification_on_edit() from public, anon, authenticated;

create trigger listings_clear_verification_on_edit
  before update on public.listings
  for each row
  execute function public.clear_listing_verification_on_edit();

-- ---------------------------------------------------------------------------
-- The moderator's write path
-- ---------------------------------------------------------------------------
-- There is no admin screen yet (moderation runs in SQL or the dashboard), so
-- the one supported way to mark a listing is this function. It refuses anyone
-- who is not an administrator, and it can only ever set or clear the two
-- timestamps — never any other listing field.

create function public.admin_set_listing_verification(
  p_listing_id uuid,
  p_verified boolean,
  p_inspected boolean
)
returns table (verified_at timestamptz, inspected_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a QUARTERS administrator can verify or inspect a listing.'
      using errcode = '42501';
  end if;

  if p_inspected and not p_verified then
    raise exception 'A listing must be verified before it can be marked inspected.'
      using errcode = '22023';
  end if;

  return query
    update public.listings as l
       set verified_at = case
             when p_verified then coalesce(l.verified_at, now())
             else null
           end,
           inspected_at = case
             when p_inspected then coalesce(l.inspected_at, now())
             else null
           end
     where l.id = p_listing_id
    returning l.verified_at, l.inspected_at;

  if not found then
    raise exception 'That listing does not exist.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.admin_set_listing_verification(uuid, boolean, boolean) is
  'Phase 2P: an administrator marks a listing verified and/or inspected. The first time a check is set it stamps now(); clearing it removes the mark.';

revoke all on function public.admin_set_listing_verification(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.admin_set_listing_verification(uuid, boolean, boolean)
  to authenticated;
