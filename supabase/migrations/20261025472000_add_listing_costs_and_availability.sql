-- Move-in cost breakdown and dated availability.
--
-- Until now the only cost information a student had was the rent plus whatever
-- the lister wrote in the description, which is exactly where agency fees,
-- caution deposits and "utilities extra" used to hide. These are real columns so
-- the app can itemise them, total them, and say plainly what the lister left
-- unstated.
--
-- Availability is likewise structured: an earliest move-in date on the listing,
-- plus dated holds the provider records for a room that is spoken for. Holds are
-- what the calendar reads; a listing without any is simply "available", never a
-- fabricated schedule.

alter table public.listings
  add column agency_fee_amount numeric(12, 2),
  add column caution_deposit_amount numeric(12, 2),
  add column utilities_amount numeric(12, 2),
  add column utilities_period public.rent_period,
  add column utilities_note text,
  add column available_from date;

comment on column public.listings.agency_fee_amount is
  'One-off agency/commission fee in the listing currency. NULL when not stated.';
comment on column public.listings.caution_deposit_amount is
  'Refundable caution/security deposit. NULL when not stated.';
comment on column public.listings.utilities_amount is
  'Stated utilities cost per utilities_period. NULL when the cost is unknown.';
comment on column public.listings.utilities_period is
  'The period utilities_amount covers. Set together with the amount, or neither.';
comment on column public.listings.utilities_note is
  'How utilities are charged or estimated, in the provider''s words.';
comment on column public.listings.available_from is
  'Earliest move-in date the provider states. NULL when they have not said.';

alter table public.listings
  add constraint listings_agency_fee_positive
    check (agency_fee_amount is null or agency_fee_amount > 0),
  add constraint listings_caution_deposit_positive
    check (caution_deposit_amount is null or caution_deposit_amount > 0),
  add constraint listings_utilities_amount_positive
    check (utilities_amount is null or utilities_amount > 0),
  -- An amount with no period, or a period with no amount, cannot be totalled
  -- and would render as "utilities: free" instead of "utilities: not stated".
  add constraint listings_utilities_paired
    check ((utilities_amount is null) = (utilities_period is null)),
  add constraint listings_utilities_note_length
    check (utilities_note is null or char_length(btrim(utilities_note)) between 3 and 160);

-- The column grants are explicit lists, so each new column is added to the
-- readable set and to the provider-writable sets separately. provider_id and the
-- timestamps stay out of both.
grant select (
  agency_fee_amount,
  caution_deposit_amount,
  utilities_amount,
  utilities_period,
  utilities_note,
  available_from
) on table public.listings to anon, authenticated;

grant insert (
  agency_fee_amount,
  caution_deposit_amount,
  utilities_amount,
  utilities_period,
  utilities_note,
  available_from
) on table public.listings to authenticated;

grant update (
  agency_fee_amount,
  caution_deposit_amount,
  utilities_amount,
  utilities_period,
  utilities_note,
  available_from
) on table public.listings to authenticated;

-- Dated unavailability the provider records, e.g. a room held for a returning
-- tenant until January. Publicly readable for published listings, writable only
-- by the provider who owns the listing.
create table public.listing_availability_holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint listing_availability_holds_order check (ends_on >= starts_on),
  constraint listing_availability_holds_span check (ends_on - starts_on <= 366),
  constraint listing_availability_holds_note_length
    check (note is null or char_length(btrim(note)) between 2 and 120)
);

comment on table public.listing_availability_holds is
  'Dated windows a provider has withheld. The availability calendar marks these months as taken.';

create index listing_availability_holds_listing_idx
  on public.listing_availability_holds (listing_id, starts_on);

-- Ownership comes from public.owns_listing(), created with the listing
-- foundation: it reaches providers.owner_id, which clients cannot read, and it
-- already holds the grant these policies need.

alter table public.listing_availability_holds enable row level security;

revoke all on table public.listing_availability_holds from anon, authenticated;

grant select (id, listing_id, starts_on, ends_on, note, created_at)
  on table public.listing_availability_holds to anon, authenticated;

grant insert (listing_id, starts_on, ends_on, note)
  on table public.listing_availability_holds to authenticated;

grant update (starts_on, ends_on, note)
  on table public.listing_availability_holds to authenticated;

grant delete on table public.listing_availability_holds to authenticated;

create policy listing_availability_holds_select_public
  on public.listing_availability_holds
  for select
  to anon, authenticated
  using (public.is_public_listing(listing_id));

-- A provider can see the holds on their own listing while it is still a draft.
create policy listing_availability_holds_select_owner
  on public.listing_availability_holds
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_availability_holds_write_owner
  on public.listing_availability_holds
  for insert
  to authenticated
  with check (public.owns_listing(listing_id));

create policy listing_availability_holds_update_owner
  on public.listing_availability_holds
  for update
  to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

create policy listing_availability_holds_delete_owner
  on public.listing_availability_holds
  for delete
  to authenticated
  using (public.owns_listing(listing_id));
