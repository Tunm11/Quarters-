-- Saved rooms: the shortlist behind the Saved tab.
--
-- Additive: one table, its grants and policies. A listing is saved per account,
-- once; saving the same room twice is a no-op rather than an error, and only the
-- owner of a row can read or remove it.
--
-- A room can only be saved while it is publicly visible, so a hidden or
-- archived listing cannot be added to a shortlist. Rows that become invisible
-- later stay put (the listing read model simply skips them) so an unpublished
-- room can come back to the shortlist if it is restored.

create table public.saved_listings (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

comment on table public.saved_listings is
  'Phase 2I: the rooms an account has shortlisted. Private to that account.';

create index saved_listings_user_idx
  on public.saved_listings (user_id, created_at desc);

alter table public.saved_listings enable row level security;

revoke all on table public.saved_listings from anon, authenticated;

grant select (user_id, listing_id, created_at)
  on table public.saved_listings to authenticated;
grant insert (user_id, listing_id)
  on table public.saved_listings to authenticated;
grant delete
  on table public.saved_listings to authenticated;

create policy saved_listings_select_owner
  on public.saved_listings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy saved_listings_insert_owner
  on public.saved_listings
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_public_listing(listing_id)
  );

create policy saved_listings_delete_owner
  on public.saved_listings
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
