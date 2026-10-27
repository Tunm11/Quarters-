-- Saved searches, and the alert when a new room matches one.
--
-- A saved search is the Explore query plus the filter sheet choices, kept per
-- account with an optional "notify me when a new room matches" switch. It is
-- deliberately stored as its own columns rather than as a blob of JSON: the
-- matching trigger compares them against public.listings in SQL, so an alert
-- does not depend on a client being open.
--
-- The trigger fires when a room is published — either inserted as already
-- published, or published later by its provider. Rooms that become public for
-- other reasons (an administrator restoring a provider, a provider approval)
-- are not covered, and a saved search is never re-evaluated on every listing
-- edit, so the promise stays "tell me when a new room matches".
--
-- Delivery reuses public.notify_user(), the single insertion point for the
-- activity feed, so the existing notifications_send_push trigger forwards these
-- rows as web push wherever the student has subscribed.

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /** Shown in the alert title and in the list on the Saved tab. */
  name text not null,
  /** The Explore search box, matched as a substring of the listing's text. */
  query text not null default '',
  /** Explore's room-type shortcut: all, private, shared or hostel. */
  category text not null default 'all',
  /** The budget band chosen in the filter sheet; null means no budget filter. */
  budget_min integer,
  budget_max integer,
  /** The filter sheet's room types. Empty means no type filter. */
  types public.accommodation_type[] not null default '{}',
  /** The filter sheet's bedroom counts. Empty means no bedroom filter. */
  bedrooms smallint[] not null default '{}',
  /** Selected facilities. All of them must be present on a matching room. */
  facilities text[] not null default '{}',
  /** Whether a matching room should write an activity row. */
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_name_length
    check (char_length(btrim(name)) between 1 and 40),
  constraint saved_searches_query_length check (char_length(query) <= 80),
  constraint saved_searches_category_allowed
    check (category in ('all', 'private', 'shared', 'hostel')),
  constraint saved_searches_budget_non_negative
    check (
      (budget_min is null or budget_min >= 0)
      and (budget_max is null or budget_max >= 0)
    ),
  constraint saved_searches_budget_ordered
    check (budget_min is null or budget_max is null or budget_max >= budget_min),
  -- The filter sheet offers one bedroom count per published value, so a search
  -- cannot hold more of them than a person would tap. Nulls are rejected
  -- outright: an array with a gap would report a null count in an alert.
  constraint saved_searches_bedrooms_size check (cardinality(bedrooms) <= 16),
  constraint saved_searches_bedrooms_no_nulls
    check (array_position(bedrooms, null) is null),
  constraint saved_searches_facilities_size check (cardinality(facilities) <= 30),
  constraint saved_searches_facilities_no_nulls
    check (array_position(facilities, null) is null)
);

comment on table public.saved_searches is
  'Phase 2N: the searches an account has saved on Explore, and whether each one should alert when a new room matches. Private to that account.';

create index saved_searches_user_idx
  on public.saved_searches (user_id, created_at desc);

-- A match check reads the searches that want to be told about a publish.
create index saved_searches_notify_idx
  on public.saved_searches (user_id)
  where notify;

create trigger saved_searches_touch_updated_at
  before update on public.saved_searches
  for each row
  execute function public.touch_updated_at();

alter table public.saved_searches enable row level security;

revoke all on table public.saved_searches from anon, authenticated;

grant select (
  id, user_id, name, query, category, budget_min, budget_max, types,
  bedrooms, facilities, notify, created_at, updated_at
) on table public.saved_searches to authenticated;
grant insert (
  user_id, name, query, category, budget_min, budget_max, types, bedrooms,
  facilities, notify
) on table public.saved_searches to authenticated;
grant update (
  name, query, category, budget_min, budget_max, types, bedrooms, facilities,
  notify
) on table public.saved_searches to authenticated;
grant delete on table public.saved_searches to authenticated;

create policy saved_searches_select_owner
  on public.saved_searches
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy saved_searches_insert_owner
  on public.saved_searches
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_searches_update_owner
  on public.saved_searches
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_searches_delete_owner
  on public.saved_searches
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Matching a newly published room against every saved search.
------------------------------------------------------------------------------

create function public.notify_saved_search_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_search record;
  v_haystack text;
  v_location text;
  v_rent text;
  v_body text;
begin
  -- Only a room with a page of its own can be opened from an alert.
  if not public.is_public_listing(new.id) then
    return new;
  end if;

  select pv.owner_id into v_owner
  from public.listings l
  join public.providers pv on pv.id = l.provider_id
  where l.id = new.id;

  -- The same text the Explore search box covers: title, area, institution, the
  -- room type and the facilities. Both spellings of the room type are present
  -- so "self-contained" and "self contained" behave alike.
  v_haystack := lower(
    concat_ws(
      ' ',
      new.title,
      new.city,
      new.neighbourhood,
      new.institution,
      replace(new.accommodation_type::text, '_', ' '),
      replace(new.accommodation_type::text, '_', '-'),
      array_to_string(new.facilities, ' ')
    )
  );

  v_location := concat_ws(', ', new.neighbourhood, new.city);

  if new.rent_amount is not null then
    v_rent := '₦' || regexp_replace(
      to_char(new.rent_amount, 'FM999,999,999,999.00'),
      '\.00$',
      ''
    ) || case new.rent_period
           when 'week' then ' a week'
           when 'month' then ' a month'
           when 'quarter' then ' a quarter'
           when 'term' then ' a term'
           when 'year' then ' a year'
           else ''
         end;
  end if;

  v_body := new.title
    || case when v_location <> '' then ' · ' || v_location else '' end
    || case when v_rent is not null then ' · ' || v_rent else '' end;

  for v_search in
    select s.id, s.user_id, s.name
    from public.saved_searches s
    where s.notify
      -- The provider does not need to be told that they published a room, and
      -- never through a search they saved for themselves.
      and (v_owner is null or s.user_id <> v_owner)
      and (s.query = '' or position(lower(s.query) in v_haystack) > 0)
      and (
        s.category = 'all'
        or new.accommodation_type::text = case s.category
             when 'private' then 'private_room'
             when 'shared' then 'shared_room'
             else 'hostel'
           end
      )
      -- Both bounds absent means the search has no budget opinion; otherwise the
      -- room needs a rent inside the band, exactly like the client-side filter.
      and (
        (s.budget_min is null and s.budget_max is null)
        or (
          new.rent_amount is not null
          and (s.budget_min is null or new.rent_amount >= s.budget_min)
          and (s.budget_max is null or new.rent_amount <= s.budget_max)
        )
      )
      and (cardinality(s.types) = 0 or new.accommodation_type = any(s.types))
      and (
        cardinality(s.bedrooms) = 0
        or (new.bedrooms is not null and new.bedrooms = any(s.bedrooms))
      )
      -- Every selected facility must be present, so the search narrows rather
      -- than widens.
      and (cardinality(s.facilities) = 0 or s.facilities <@ new.facilities)
  loop
    perform public.notify_user(
      v_search.user_id,
      'saved_search_match',
      'New room matches “' || v_search.name || '”',
      v_body,
      '/property/' || new.id::text
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_saved_search_matches() is
  'Phase 2N: alerts each account whose saved search a newly published room matches.';

revoke all on function public.notify_saved_search_matches()
  from public, anon, authenticated;

-- A room inserted already published (the provider published it in one step).
create trigger listings_notify_saved_search_matches_on_insert
  after insert on public.listings
  for each row
  execute function public.notify_saved_search_matches();

-- A draft that is published later. Publication is the moment the room becomes
-- findable on Explore, which is what a saved search is watching for.
create trigger listings_notify_saved_search_matches_on_publish
  after update of publication_status on public.listings
  for each row
  when (old.publication_status is distinct from new.publication_status)
  execute function public.notify_saved_search_matches();
