-- Group visits from a group chat.
--
-- A group visit was only ever a pair: listing_group_visits named the requester
-- and one roommate profile, so a property shared into a group of three had no
-- way to say "we all want to see it".
--
-- The table now targets either a connected roommate profile (the existing 1:1
-- case, unchanged) or a chat group, never both:
--
--   listing_id + roommate_profile_id  — a student asks a connected roommate
--   listing_id + group_id             — the group asks for the whole group
--
-- The provider still reads the same table under their listing, so both kinds
-- show up together. One request per listing per group, so tapping again is
-- harmless.

alter table public.listing_group_visits
  add column if not exists group_id uuid
    references public.chat_groups (id) on delete cascade;

alter table public.listing_group_visits
  alter column roommate_profile_id drop not null;

alter table public.listing_group_visits
  drop constraint if exists listing_group_visits_target;

alter table public.listing_group_visits
  add constraint listing_group_visits_target
  check (num_nonnulls(roommate_profile_id, group_id) = 1);

comment on column public.listing_group_visits.group_id is
  'Set when a whole chat group asked for a joint viewing; then roommate_profile_id is null.';

create unique index if not exists listing_group_visits_one_per_group
  on public.listing_group_visits (listing_id, group_id)
  where group_id is not null;

grant select (group_id) on table public.listing_group_visits to authenticated;
grant insert (group_id) on table public.listing_group_visits to authenticated;

-- Every member of the group sees the request on the shared property card.
drop policy if exists listing_group_visits_select_group on public.listing_group_visits;

create policy listing_group_visits_select_group
  on public.listing_group_visits
  for select
  to authenticated
  using (
    group_id is not null
    and public.is_chat_group_member(group_id)
  );

-- Any member may ask, as themselves, for a live public listing in a group they
-- belong to. The 1:1 insert policy is untouched, and insert policies are OR'ed.
drop policy if exists listing_group_visits_insert_group on public.listing_group_visits;

create policy listing_group_visits_insert_group
  on public.listing_group_visits
  for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and group_id is not null
    and public.is_public_listing(listing_id)
    and public.is_chat_group_member(group_id)
  );
