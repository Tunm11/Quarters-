-- Shortlist collections, and sending a whole shortlist to a roommate.
--
-- Three additive changes:
--   * saved_listing_collections  named folders a student files saved rooms into;
--   * saved_listings.collection_id  which folder a saved room sits in
--                                 (null = Unsorted);
--   * roommate_messages.shared_listing_ids  one message can carry several rooms
--                                 instead of a single property card.
--
-- A room still sits in at most one collection — saved_listings keeps its
-- (user_id, listing_id) primary key — so a collection is a folder rather than a
-- tag. Deleting a collection keeps the rooms: they simply fall back to Unsorted.

create table public.saved_listing_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint saved_listing_collections_name_length
    check (char_length(btrim(name)) between 1 and 40)
);

comment on table public.saved_listing_collections is
  'The named folders an account files its saved rooms into. Private to that account.';

-- One folder per name per account: case and surrounding space do not matter.
create unique index saved_listing_collections_name_idx
  on public.saved_listing_collections (user_id, lower(btrim(name)));

create index saved_listing_collections_user_idx
  on public.saved_listing_collections (user_id, created_at);

alter table public.saved_listing_collections enable row level security;

revoke all on table public.saved_listing_collections from anon, authenticated;

grant select (id, user_id, name, created_at)
  on table public.saved_listing_collections to authenticated;
grant insert (user_id, name)
  on table public.saved_listing_collections to authenticated;
grant update (name)
  on table public.saved_listing_collections to authenticated;
grant delete
  on table public.saved_listing_collections to authenticated;

create policy saved_listing_collections_select_owner
  on public.saved_listing_collections
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy saved_listing_collections_insert_owner
  on public.saved_listing_collections
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_listing_collections_update_owner
  on public.saved_listing_collections
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_listing_collections_delete_owner
  on public.saved_listing_collections
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Filing a saved room into a folder
-- ---------------------------------------------------------------------------

alter table public.saved_listings
  add column collection_id uuid
    references public.saved_listing_collections (id) on delete set null;

comment on column public.saved_listings.collection_id is
  'The folder this saved room sits in; null means Unsorted.';

create index saved_listings_collection_idx
  on public.saved_listings (collection_id)
  where collection_id is not null;

grant select (collection_id) on table public.saved_listings to authenticated;
grant insert (collection_id) on table public.saved_listings to authenticated;
-- Moving a room between folders is the only edit a saved row accepts.
grant update (collection_id) on table public.saved_listings to authenticated;

-- Saving a room into a folder is the same write as saving it plainly, except
-- the folder must belong to the same account.
drop policy saved_listings_insert_owner on public.saved_listings;

create policy saved_listings_insert_owner
  on public.saved_listings
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_public_listing(listing_id)
    and (
      collection_id is null
      or exists (
        select 1
        from public.saved_listing_collections c
        where c.id = collection_id
          and c.user_id = (select auth.uid())
      )
    )
  );

create policy saved_listings_update_owner
  on public.saved_listings
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      collection_id is null
      or exists (
        select 1
        from public.saved_listing_collections c
        where c.id = collection_id
          and c.user_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Sharing a shortlist with a roommate
-- ---------------------------------------------------------------------------

alter table public.roommate_messages
  add column shared_listing_ids uuid[] not null default '{}';

comment on column public.roommate_messages.shared_listing_ids is
  'The rooms a shortlist message carries, in the order they were saved. Empty for every other message kind.';

create index roommate_messages_shared_listing_ids_idx
  on public.roommate_messages using gin (shared_listing_ids)
  where cardinality(shared_listing_ids) > 0;

-- A shared shortlist is a message, not a payload: keep it to a screenful.
alter table public.roommate_messages
  add constraint roommate_messages_shortlist_size
    check (cardinality(shared_listing_ids) <= 12);

grant select (shared_listing_ids)
  on table public.roommate_messages to authenticated;
grant insert (shared_listing_ids)
  on table public.roommate_messages to authenticated;

-- "Delete for everyone" clears a message's attachments. That rule was written
-- before this column existed, so it lives in a trigger instead of a second copy
-- of the delete path.
create or replace function public.clear_roommate_message_attachments()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.image_path := null;
    new.shared_listing_id := null;
    new.shared_listing_ids := '{}';
  end if;
  return new;
end;
$$;

revoke all on function public.clear_roommate_message_attachments()
  from public, anon, authenticated;

create trigger roommate_messages_clear_attachments
  before update on public.roommate_messages
  for each row execute function public.clear_roommate_message_attachments();
