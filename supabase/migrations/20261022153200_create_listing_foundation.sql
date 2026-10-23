-- Phase 2B — accommodation listings foundation.
--
-- Confirmed business model:
--   * Administrators approve providers.
--   * Approved providers publish listings immediately, without waiting for
--     per-listing administrator approval.
--   * Administrators moderate listings after publication: flag, request
--     corrections, hide, archive, and record history. Clearing a hold requires
--     a separate revision-checked restoration after an administrator reviews
--     the current content.
--
-- Separate concepts (never interchangeable):
--   providers.status                  -> is the account allowed to publish?
--   listings.publication_status       -> draft | published | archived
--   listings.availability_status      -> available | limited | unavailable
--   listing_administration.visibility -> visible | hidden (administrative)
--   listing_administration.moderation_status -> none | flagged | correction_requested | resolved
--
-- Public visibility is computed, not stored:
--   publication_status = 'published'
--   AND the provider is currently approved
--   AND administrative visibility = 'visible'
-- A provider suspension therefore hides existing listings immediately without
-- mutating them, and reinstatement restores only listings that are still
-- published and not independently hidden or archived.
--
-- "Approved provider" is a publishing authorisation, not identity verification
-- and not proof that a property was inspected.
--
-- Money is exact NUMERIC, never floating point.

create type public.accommodation_type as enum (
  'self_contained',
  'private_room',
  'shared_room',
  'hostel',
  'apartment'
);

create type public.rent_period as enum (
  'week',
  'month',
  'quarter',
  'term',
  'year'
);

create type public.furnishing_status as enum (
  'furnished',
  'semi_furnished',
  'unfurnished'
);

-- Provider-controlled lifecycle. Administrative hiding is tracked separately so
-- restoring a hidden listing never silently republishes an archived one.
create type public.publication_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.availability_status as enum (
  'available',
  'limited',
  'unavailable'
);

create type public.listing_visibility as enum (
  'visible',
  'hidden'
);

create type public.listing_moderation_status as enum (
  'none',
  'flagged',
  'correction_requested',
  'resolved'
);

create type public.listing_admin_action as enum (
  'flag',
  'request_correction',
  'resolve',
  'hide',
  'restore',
  'archive'
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  -- The provider authorised to manage this property. Immutable for clients:
  -- provider_id is absent from the update grant, so ownership cannot be moved.
  provider_id uuid not null references public.providers (id) on delete restrict,
  title text not null,
  description text,
  accommodation_type public.accommodation_type not null,
  -- Optional: many student properties are not tied to one institution.
  institution text,
  city text not null,
  neighbourhood text,
  rent_amount numeric(12, 2),
  currency character(3) not null default 'NGN',
  rent_period public.rent_period,
  -- Availability is separate from publication and moderation.
  availability_status public.availability_status not null default 'available',
  -- Nullable because a shared room or hostel bed has no conventional count.
  bedrooms smallint,
  bathrooms smallint,
  furnishing_status public.furnishing_status,
  facilities text[] not null default '{}'::text[],
  property_rules text[] not null default '{}'::text[],
  publication_status public.publication_status not null default 'draft',
  -- Set once, the first time the listing is published; retained as history.
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_title_length
    check (char_length(btrim(title)) between 4 and 120),
  constraint listings_description_length
    check (description is null or char_length(btrim(description)) between 20 and 4000),
  constraint listings_institution_length
    check (institution is null or char_length(btrim(institution)) between 1 and 120),
  constraint listings_city_length
    check (char_length(btrim(city)) between 2 and 80),
  constraint listings_neighbourhood_length
    check (neighbourhood is null or char_length(btrim(neighbourhood)) between 1 and 80),
  constraint listings_currency_supported
    check (currency = 'NGN'),
  constraint listings_rent_amount_positive
    check (rent_amount is null or rent_amount > 0),
  constraint listings_bedrooms_range
    check (bedrooms is null or bedrooms between 0 and 50),
  constraint listings_bathrooms_range
    check (bathrooms is null or bathrooms between 0 and 50),
  constraint listings_facilities_size
    check (cardinality(facilities) <= 30),
  constraint listings_facilities_no_nulls
    check (array_position(facilities, null) is null),
  constraint listings_rules_size
    check (cardinality(property_rules) <= 30),
  constraint listings_rules_no_nulls
    check (array_position(property_rules, null) is null),
  -- A published listing must carry the details a student needs to evaluate it.
  constraint listings_published_requires_details
    check (
      publication_status <> 'published'
      or (
        description is not null
        and rent_amount is not null
        and rent_period is not null
      )
    )
);

comment on table public.listings is
  'Phase 2B: accommodation listings. Approved providers publish immediately.';
comment on column public.listings.provider_id is
  'Provider authorised to manage the property. Clients cannot change it after insert.';
comment on column public.listings.currency is
  'ISO 4217 code. Only NGN is supported in this phase.';
comment on column public.listings.rent_amount is
  'Exact rent per rent_period, in the supported currency. Never a float.';
comment on column public.listings.bedrooms is
  'NULL when a bedroom count does not apply (shared room, hostel bed).';
comment on column public.listings.publication_status is
  'draft | published | archived. Administrative hiding is stored separately.';
comment on column public.listings.first_published_at is
  'Server-set on the first transition to published; never client-writable.';

-- Browse/read paths that future Explore queries will use.
create index listings_public_browse_idx
  on public.listings (city, first_published_at desc)
  where publication_status = 'published';

create index listings_public_institution_idx
  on public.listings (institution)
  where publication_status = 'published' and institution is not null;

create index listings_provider_idx
  on public.listings (provider_id, created_at desc);

create index listings_facilities_gin_idx
  on public.listings using gin (facilities);

-- ---------------------------------------------------------------------------
-- Exact address (private)
-- ---------------------------------------------------------------------------

-- Kept out of public.listings so an anonymous read cannot reveal where a
-- vacant property is. The managing provider and administrators can read it.
create table public.listing_addresses (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  address_line text not null,
  landmark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_addresses_address_line_length
    check (char_length(btrim(address_line)) between 4 and 240),
  constraint listing_addresses_landmark_length
    check (landmark is null or char_length(btrim(landmark)) between 2 and 160)
);

comment on table public.listing_addresses is
  'Phase 2B: exact property address. Provider and administrator only.';

create trigger listing_addresses_touch_updated_at
  before update on public.listing_addresses
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Photographs
-- ---------------------------------------------------------------------------

-- Storage object paths live in the private "listing-images" bucket created by
-- migration ...3400. Sensitive provider/verification documents must never use
-- that bucket; they need a separate private bucket and are not modelled here.
create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- Object path inside the bucket: <provider_id>/<listing_id>/<file>.
  storage_path text not null,
  alt_text text,
  position smallint not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint listing_images_storage_path_length
    check (char_length(btrim(storage_path)) between 3 and 1024),
  constraint listing_images_storage_path_is_path
    check (storage_path !~ '^/' and storage_path !~* '^[a-z][a-z0-9+.-]*://'),
  constraint listing_images_alt_text_length
    check (alt_text is null or char_length(btrim(alt_text)) between 1 and 300),
  constraint listing_images_position_range
    check (position between 0 and 99),
  -- Deferrable so a reorder can swap positions inside one transaction/RPC.
  constraint listing_images_position_unique
    unique (listing_id, position) deferrable initially deferred
);

comment on table public.listing_images is
  'Phase 2B: property photographs. storage_path points into the private listing-images bucket.';
comment on column public.listing_images.storage_path is
  'Object path <provider_id>/<listing_id>/<file>. Never a full URL.';

create unique index listing_images_storage_path_idx
  on public.listing_images (storage_path);

-- At most one cover image per listing.
create unique index listing_images_one_cover_idx
  on public.listing_images (listing_id)
  where is_cover;

create index listing_images_display_order_idx
  on public.listing_images (listing_id, position);

-- ---------------------------------------------------------------------------
-- Administrative visibility and moderation (private)
-- ---------------------------------------------------------------------------

-- One row per listing, created automatically. Publication remains the provider's
-- lifecycle; hiding and moderation belong to administrators.
create table public.listing_administration (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  visibility public.listing_visibility not null default 'visible',
  moderation_status public.listing_moderation_status not null default 'none',
  -- Latest provider-facing moderation note.
  moderation_note text,
  -- Monotonic sequence of material public-content changes. It is bumped by
  -- listing, private-address, image-row and Storage-object triggers. A restore
  -- must name the exact revision an administrator reviewed.
  content_revision bigint not null default 0,
  -- The content revision at the start of the current administrative hold. It is
  -- diagnostic and audit context; review validity is checked against the
  -- current content_revision.
  hold_revision bigint,
  hidden_reason text,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_administration_note_length
    check (moderation_note is null or char_length(btrim(moderation_note)) between 1 and 2000),
  constraint listing_administration_hidden_reason_length
    check (hidden_reason is null or char_length(btrim(hidden_reason)) between 3 and 2000),
  constraint listing_administration_revisions_nonnegative
    check (content_revision >= 0 and (hold_revision is null or hold_revision >= 0))
);

comment on table public.listing_administration is
  'Phase 2B: administrative visibility and moderation state. Never public.';
comment on column public.listing_administration.content_revision is
  'Monotonic material-content revision used to reject stale restoration reviews.';
comment on column public.listing_administration.hold_revision is
  'content_revision when the current administrative hold began.';

create trigger listing_administration_touch_updated_at
  before update on public.listing_administration
  for each row
  execute function public.touch_updated_at();

-- Append-only moderation/visibility history. Providers may read their own
-- provider-facing rows; administrators may read everything.
create table public.listing_moderation_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  action public.listing_admin_action not null,
  moderation_status public.listing_moderation_status not null,
  visibility public.listing_visibility not null,
  publication_status public.publication_status not null,
  reason text,
  provider_note text,
  acted_by uuid references auth.users (id) on delete set null,
  acted_at timestamptz not null default now(),
  -- Restoration review metadata. The generic moderation function leaves these
  -- null; admin_restore_listing() records the approved revision. They are not
  -- granted to providers through the table API.
  review_decision text,
  reviewed_revision bigint,
  constraint listing_moderation_events_reason_length
    check (reason is null or char_length(btrim(reason)) between 3 and 2000),
  constraint listing_moderation_events_provider_note_length
    check (provider_note is null or char_length(btrim(provider_note)) between 1 and 2000),
  constraint listing_moderation_events_review_decision
    check (review_decision is null or review_decision in ('approved', 'changes_requested')),
  constraint listing_moderation_events_reviewed_revision
    check (reviewed_revision is null or reviewed_revision >= 0)
);

comment on table public.listing_moderation_events is
  'Phase 2B: append-only listing moderation and visibility history.';

create index listing_moderation_events_listing_idx
  on public.listing_moderation_events (listing_id, id desc);

-- Publication history, separate from current public visibility.
create table public.listing_publication_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  from_status public.publication_status not null,
  to_status public.publication_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint listing_publication_events_changed
    check (from_status <> to_status)
);

comment on table public.listing_publication_events is
  'Phase 2B: provider/administrator publication transitions, preserved separately from visibility.';

create index listing_publication_events_listing_idx
  on public.listing_publication_events (listing_id, id desc);

-- Append-only audit of material listing-content edits. The listing trigger
-- records only fields that actually changed, with their previous and new values.
-- Address and image triggers write marker events here without copying private
-- address details or duplicating image rows.
create table public.listing_content_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  changed_fields text[] not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  constraint listing_content_events_fields_not_empty
    check (cardinality(changed_fields) > 0),
  constraint listing_content_events_fields_no_nulls
    check (array_position(changed_fields, null) is null),
  constraint listing_content_events_previous_object
    check (jsonb_typeof(previous_values) = 'object'),
  constraint listing_content_events_new_object
    check (jsonb_typeof(new_values) = 'object')
);

comment on table public.listing_content_events is
  'Phase 2B: append-only audit of material listing-content edits.';
comment on column public.listing_content_events.changed_fields is
  'Material columns whose value changed in this update.';
comment on column public.listing_content_events.previous_values is
  'Previous values for changed listing fields only; address/image markers are empty. Provider and administrator only.';
comment on column public.listing_content_events.new_values is
  'New values for changed listing fields only; address/image markers are empty. Provider and administrator only.';

create index listing_content_events_listing_idx
  on public.listing_content_events (listing_id, id desc);

-- Bump the review revision without writing a content event. Used for a
-- publication-status change, which is audited in listing_publication_events
-- rather than duplicated as a content event.
create function public.bump_listing_content_revision(target_listing_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.listing_administration
  set content_revision = content_revision + 1
  where listing_id = target_listing_id;
end;
$$;

revoke all on function public.bump_listing_content_revision(uuid)
  from public, anon, authenticated;

-- Record one material change and invalidate any earlier restoration review.
-- Address and image triggers intentionally pass empty JSON values so private
-- address details are not copied into the audit trail; administrators inspect
-- the current address/image rows after seeing that a change occurred.
create function public.record_listing_content_change(
  target_listing_id uuid,
  changed_fields text[],
  previous_values jsonb default '{}'::jsonb,
  new_values jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.listing_administration
  set content_revision = content_revision + 1
  where listing_id = target_listing_id;

  if found then
    insert into public.listing_content_events
      (listing_id, changed_by, changed_fields, previous_values, new_values)
    values
      (target_listing_id, (select auth.uid()), changed_fields, previous_values, new_values);
  end if;
end;
$$;

revoke all on function public.record_listing_content_change(uuid, text[], jsonb, jsonb)
  from public, anon, authenticated;

-- The private address is not part of listings. Its changes still invalidate a
-- held review, but the audit event deliberately contains no address values.
-- An administrator inspects the current listing_addresses row after seeing the
-- change marker.
create function public.listing_addresses_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_listing_content_change(new.listing_id, array['address']);
    return new;
  elsif tg_op = 'UPDATE' then
    -- Reassignment is not client-granted, but a privileged path may move the
    -- address. Audit both listings so neither review revision can hide the move.
    if new.listing_id is distinct from old.listing_id then
      perform public.record_listing_content_change(old.listing_id, array['address']);
      perform public.record_listing_content_change(new.listing_id, array['address']);
      return new;
    end if;
    if new.address_line is not distinct from old.address_line
       and new.landmark is not distinct from old.landmark then
      return new;
    end if;
    perform public.record_listing_content_change(new.listing_id, array['address']);
    return new;
  else
    perform public.record_listing_content_change(old.listing_id, array['address']);
    return old;
  end if;
end;
$$;

revoke all on function public.listing_addresses_record_change()
  from public, anon, authenticated;

create trigger listing_addresses_record_change
  after insert or update or delete on public.listing_addresses
  for each row
  execute function public.listing_addresses_record_change();

-- Image row metadata/path changes (and additions/removals) are material. The
-- audit marker records that images changed without duplicating image rows in
-- the event. Storage object bytes are covered separately by the trigger in
-- migration ...3400.
create function public.listing_images_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_listing_content_change(new.listing_id, array['images']);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id then
      perform public.record_listing_content_change(old.listing_id, array['images']);
      perform public.record_listing_content_change(new.listing_id, array['images']);
      return new;
    end if;
    if new.storage_path is not distinct from old.storage_path
       and new.alt_text is not distinct from old.alt_text
       and new.position is not distinct from old.position
       and new.is_cover is not distinct from old.is_cover then
      return new;
    end if;
    perform public.record_listing_content_change(new.listing_id, array['images']);
    return new;
  else
    perform public.record_listing_content_change(old.listing_id, array['images']);
    return old;
  end if;
end;
$$;

revoke all on function public.listing_images_record_change()
  from public, anon, authenticated;

create trigger listing_images_record_change
  after insert or update or delete on public.listing_images
  for each row
  execute function public.listing_images_record_change();

-- ---------------------------------------------------------------------------
-- Content-mutation lock ordering
-- ---------------------------------------------------------------------------
--
-- Address, image-row and Storage-object changes must acquire the parent listing
-- row lock BEFORE the child mutation. admin_restore_listing() takes the same
-- listing lock first, then the administration lock, then the provider lock. A
-- content edit therefore either commits before restoration (bumping the
-- revision and making the reviewed revision stale) or waits until restoration
-- commits; it cannot slip between the revision comparison and the visibility
-- update. The AFTER audit triggers below/elsewhere still update
-- listing_administration while the listing lock is held.
--
-- The triggers are named to sort before the existing validation/timestamp
-- triggers for the same timing. The shared order is:
--   listing row -> listing_administration row -> providers row (restore only)
-- so the audit path and restoration cannot form the opposite lock order.
create function public.listing_addresses_lock_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.listing_id;
  else
    target_id := new.listing_id;
  end if;

  -- Reassignment is not granted to clients, but a privileged path may move a
  -- row. Lock both parents in UUID order so two such mutations cannot form a
  -- cross-order deadlock.
  if tg_op = 'UPDATE' and new.listing_id is distinct from old.listing_id then
    perform 1
    from public.listings l
    where l.id in (old.listing_id, new.listing_id)
    order by l.id
    for update;
  else
    perform 1
    from public.listings l
    where l.id = target_id
    for update;
  end if;

  -- During a cascading parent delete the listing row may already be gone. The
  -- child delete is part of that cascade, so there is nothing left to
  -- serialize; do not turn the cascade into a misleading 23503 error.
  if tg_op = 'DELETE' then
    return old;
  end if;

  if not found then
    raise exception 'listing % does not exist', target_id using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.listing_addresses_lock_parent()
  from public, anon, authenticated;

create trigger listing_addresses_lock_parent
  before insert or update or delete on public.listing_addresses
  for each row
  execute function public.listing_addresses_lock_parent();

create function public.listing_images_lock_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.listing_id;
  else
    target_id := new.listing_id;
  end if;

  if tg_op = 'UPDATE' and new.listing_id is distinct from old.listing_id then
    perform 1
    from public.listings l
    where l.id in (old.listing_id, new.listing_id)
    order by l.id
    for update;
  else
    perform 1
    from public.listings l
    where l.id = target_id
    for update;
  end if;

  -- During a cascading parent delete the listing row may already be gone. The
  -- child delete is part of that cascade, so there is nothing left to
  -- serialize; do not turn the cascade into a misleading 23503 error.
  if tg_op = 'DELETE' then
    return old;
  end if;

  if not found then
    raise exception 'listing % does not exist', target_id using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.listing_images_lock_parent()
  from public, anon, authenticated;

create trigger listing_images_lock_parent
  before insert or update or delete on public.listing_images
  for each row
  execute function public.listing_images_lock_parent();

-- ---------------------------------------------------------------------------
-- Read helpers (no recursive RLS)
-- ---------------------------------------------------------------------------

-- Ownership/read access, regardless of provider status. A rejected or
-- suspended provider can still see their own records and feedback.
create function public.owns_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = target_listing_id
      and public.owns_provider(l.provider_id)
  );
$$;

-- Write access: only an approved provider that owns the listing.
create function public.can_manage_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = target_listing_id
      and public.is_approved_provider_owner(l.provider_id)
  );
$$;

-- Public visibility: published, provider currently approved, and not hidden by
-- an administrator. A moderation flag or correction request does NOT hide it.
create function public.is_public_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.providers p on p.id = l.provider_id
    left join public.listing_administration a on a.listing_id = l.id
    where l.id = target_listing_id
      and l.publication_status = 'published'
      and p.status = 'approved'
      and coalesce(a.visibility, 'visible'::public.listing_visibility) = 'visible'
  );
$$;

-- Deletion is limited to drafts that have never been published and have no
-- moderation, publication or content-change history. The content-event check is
-- essential: address, image and listing edits are audited, and a hard delete
-- would otherwise cascade those audit rows away. Published/reviewed history is
-- preserved.
create function public.can_delete_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = target_listing_id
      and l.publication_status = 'draft'
      and l.first_published_at is null
      and public.is_approved_provider_owner(l.provider_id)
      and not exists (
        select 1 from public.listing_moderation_events e where e.listing_id = l.id
      )
      and not exists (
        select 1 from public.listing_publication_events p where p.listing_id = l.id
      )
      and not exists (
        select 1 from public.listing_content_events c where c.listing_id = l.id
      )
  );
$$;

-- Parses an object path of the form <provider_id>/<listing_id>/<file> and
-- returns the listing, but only when the path's provider matches the listing's
-- provider and the path contains exactly one file segment. Returns NULL for
-- malformed, traversal or cross-provider paths.
create function public.listing_image_listing_id(object_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
  from public.listings l
  where array_length(string_to_array(object_name, '/'), 1) = 3
    and (string_to_array(object_name, '/'))[1] = l.provider_id::text
    and (string_to_array(object_name, '/'))[2] = l.id::text
    and btrim((string_to_array(object_name, '/'))[3]) <> ''
    and (string_to_array(object_name, '/'))[3] <> '.'
    and (string_to_array(object_name, '/'))[3] <> '..'
    and object_name !~ '(^|/)\.\.(/|$)'
    and object_name !~ '//'
  limit 1;
$$;

create function public.is_own_listing_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.owns_listing(public.listing_image_listing_id(object_name));
$$;

create function public.is_public_listing_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listing_images i
    where i.storage_path = object_name
      and public.is_public_listing(i.listing_id)
  );
$$;

create function public.can_manage_listing_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_listing(public.listing_image_listing_id(object_name));
$$;

revoke all on function public.owns_listing(uuid) from public, anon;
revoke all on function public.can_manage_listing(uuid) from public, anon;
revoke all on function public.is_public_listing(uuid) from public, anon;
revoke all on function public.can_delete_listing(uuid) from public, anon;
revoke all on function public.listing_image_listing_id(text) from public, anon, authenticated;
revoke all on function public.is_own_listing_image(text) from public, anon;
revoke all on function public.is_public_listing_image(text) from public, anon;
revoke all on function public.can_manage_listing_image(text) from public, anon;

grant execute on function public.owns_listing(uuid) to authenticated;
grant execute on function public.can_manage_listing(uuid) to authenticated;
grant execute on function public.is_public_listing(uuid) to anon, authenticated;
grant execute on function public.can_delete_listing(uuid) to authenticated;
grant execute on function public.is_own_listing_image(text) to authenticated;
grant execute on function public.is_public_listing_image(text) to anon, authenticated;
grant execute on function public.can_manage_listing_image(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Timeline triggers
-- ---------------------------------------------------------------------------

create function public.listings_set_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.publication_status = 'published' and new.first_published_at is null then
    new.first_published_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.listings_set_timestamps() from public, anon, authenticated;

create trigger listings_set_timestamps
  before insert or update on public.listings
  for each row
  execute function public.listings_set_timestamps();

create function public.listings_create_administration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.listing_administration (listing_id)
  values (new.id)
  on conflict (listing_id) do nothing;
  return new;
end;
$$;

revoke all on function public.listings_create_administration() from public, anon, authenticated;

create trigger listings_create_administration
  after insert on public.listings
  for each row
  execute function public.listings_create_administration();

create function public.listings_record_publication_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A listing created directly as published has no prior UPDATE. Record the
    -- initial publication as draft -> published; first_published_at carries the
    -- same moment. This keeps the publication audit complete without inventing
    -- a separate event type.
    if new.publication_status = 'published' then
      insert into public.listing_publication_events
        (listing_id, from_status, to_status, changed_by)
      values
        (new.id, 'draft', 'published', (select auth.uid()));
    end if;
  elsif new.publication_status is distinct from old.publication_status then
    insert into public.listing_publication_events
      (listing_id, from_status, to_status, changed_by)
    values
      (new.id, old.publication_status, new.publication_status, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function public.listings_record_publication_event() from public, anon, authenticated;

create trigger listings_record_publication_event
  after update of publication_status on public.listings
  for each row
  execute function public.listings_record_publication_event();

create trigger listings_record_initial_publication
  after insert on public.listings
  for each row
  execute function public.listings_record_publication_event();

-- Records material content edits and bumps the review revision, including
-- changes made while an administrative hold is active. Publication-status
-- changes also bump the revision (their own publication event is the audit
-- record); a provider therefore cannot invalidate a review silently by flipping
-- publication_status while hidden.
create function public.listings_record_content_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_content jsonb :=
    to_jsonb(old)
    - 'id' - 'provider_id' - 'publication_status' - 'first_published_at'
    - 'created_at' - 'updated_at';
  current_content jsonb :=
    to_jsonb(new)
    - 'id' - 'provider_id' - 'publication_status' - 'first_published_at'
    - 'created_at' - 'updated_at';
  changed_fields text[];
  previous_values jsonb;
  new_values jsonb;
begin
  if new.publication_status is distinct from old.publication_status then
    perform public.bump_listing_content_revision(new.id);
  end if;

  if previous_content = current_content then
    return new;
  end if;

  select array_agg(field_name order by field_name)
    into changed_fields
  from (
    select key as field_name
    from jsonb_each(previous_content)
    where (previous_content -> key) is distinct from (current_content -> key)
    union
    select key as field_name
    from jsonb_each(current_content)
    where (previous_content -> key) is distinct from (current_content -> key)
  ) changed;

  if changed_fields is null or cardinality(changed_fields) = 0 then
    return new;
  end if;

  select coalesce(jsonb_object_agg(f.field_name, previous_content -> f.field_name), '{}'::jsonb)
    into previous_values
  from unnest(changed_fields) as f(field_name);

  select coalesce(jsonb_object_agg(f.field_name, current_content -> f.field_name), '{}'::jsonb)
    into new_values
  from unnest(changed_fields) as f(field_name);

  perform public.record_listing_content_change(
    new.id, changed_fields, previous_values, new_values
  );

  return new;
end;
$$;

revoke all on function public.listings_record_content_event() from public, anon, authenticated;

create trigger listings_record_content_event
  after update of title, description, accommodation_type, institution, city,
    neighbourhood, rent_amount, currency, rent_period, availability_status,
    bedrooms, bathrooms, furnishing_status, facilities, property_rules,
    publication_status
  on public.listings
  for each row
  execute function public.listings_record_content_event();

-- An archived listing is terminal for ordinary clients. This closes the
-- two-step archived -> draft -> published bypass as well as the direct
-- archived -> published transition: once archived, a provider cannot move the
-- row back to an active lifecycle state. A future unarchive action must be an
-- explicit, authorised administrator operation that deliberately opts out of
-- this guard; the current Phase 2B API intentionally has no such bypass.
create function public.listings_prevent_archived_republish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.publication_status = 'archived'
     and new.publication_status in ('draft', 'published') then
    raise exception 'archived listings cannot be republished; an explicit authorised unarchive workflow is required'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.listings_prevent_archived_republish()
  from public, anon, authenticated;

create trigger listings_prevent_archived_republish
  before update of publication_status on public.listings
  for each row
  execute function public.listings_prevent_archived_republish();

-- Validates that an image row points only at its own listing's provider folder.
create function public.listing_images_validate_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_prefix text;
  remainder text;
begin
  select l.provider_id::text || '/' || l.id::text || '/'
    into expected_prefix
  from public.listings l
  where l.id = new.listing_id;

  if expected_prefix is null then
    raise exception 'listing % does not exist', new.listing_id using errcode = '23503';
  end if;

  if new.storage_path not like expected_prefix || '%' then
    raise exception 'storage_path must start with %', expected_prefix using errcode = '23514';
  end if;

  remainder := substring(new.storage_path from char_length(expected_prefix) + 1);

  if remainder is null
     or btrim(remainder) = ''
     or remainder <> btrim(remainder)
     or remainder in ('.', '..')
     or position('/' in remainder) > 0
     or new.storage_path ~ '(^|/)\.\.(/|$)'
     or new.storage_path ~ '//'
  then
    raise exception 'storage_path must be <provider_id>/<listing_id>/<file>'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.listing_images_validate_path() from public, anon, authenticated;

create trigger listing_images_validate_path
  before insert or update on public.listing_images
  for each row
  execute function public.listing_images_validate_path();

-- ---------------------------------------------------------------------------
-- Administrative moderation operation
-- ---------------------------------------------------------------------------

-- The trusted moderation entry point for flag, request_correction, resolve,
-- hide and archive. Restoration is intentionally NOT handled here: it requires
-- admin_restore_listing() with a reviewed content revision. This function
-- enforces administrator authorisation and writes an append-only audit event.
create function public.admin_apply_listing_action(
  target_listing_id uuid,
  action public.listing_admin_action,
  reason text,
  provider_note text default null
)
returns public.listing_admin_action
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := (select auth.uid());
  current_publication public.publication_status;
  current_visibility public.listing_visibility;
  current_moderation public.listing_moderation_status;
  new_publication public.publication_status;
  new_visibility public.listing_visibility;
  new_moderation public.listing_moderation_status;
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  if action = 'restore' then
    raise exception 'restore requires admin_restore_listing() with a reviewed content revision'
      using errcode = '23514';
  end if;

  if reason is not null
     and (char_length(btrim(reason)) < 3 or char_length(btrim(reason)) > 2000) then
    raise exception 'reason must be between 3 and 2000 characters' using errcode = '23514';
  end if;

  if action in ('flag', 'request_correction', 'hide', 'archive') and reason is null then
    raise exception 'a reason is required for this moderation action' using errcode = '23514';
  end if;

  if provider_note is not null
     and (char_length(btrim(provider_note)) < 1 or char_length(btrim(provider_note)) > 2000) then
    raise exception 'provider_note must be between 1 and 2000 characters' using errcode = '23514';
  end if;

  -- Canonical lock order: listing row first, then administration. Do not use a
  -- multi-table FOR UPDATE here; its lock order is plan-dependent and can
  -- deadlock with the BEFORE content-mutation triggers, which lock the listing
  -- first and then update administration in their AFTER audit step.
  select l.publication_status
    into current_publication
  from public.listings l
  where l.id = target_listing_id
  for update;

  if not found then
    raise exception 'listing % does not exist', target_listing_id using errcode = '23503';
  end if;

  select a.visibility, a.moderation_status
    into current_visibility, current_moderation
  from public.listing_administration a
  where a.listing_id = target_listing_id
  for update;

  if not found then
    raise exception 'listing administration for % does not exist', target_listing_id
      using errcode = '23503';
  end if;

  new_publication := current_publication;
  new_visibility := current_visibility;
  new_moderation := current_moderation;

  case action
    when 'flag' then
      new_moderation := 'flagged';
    when 'request_correction' then
      new_moderation := 'correction_requested';
    when 'resolve' then
      new_moderation := 'resolved';
    when 'hide' then
      new_visibility := 'hidden';
    when 'archive' then
      -- An administrative archive is a moderation hold as well as a
      -- publication state. The hidden flag keeps the listing out of public
      -- visibility even if the provider edits it or changes its publication
      -- status through the ordinary update path; only an explicit restore can
      -- clear the hold. Review the current publication state and content before
      -- restoring, because a provider may have changed either while hidden.
      new_publication := 'archived';
      new_visibility := 'hidden';
  end case;

  if new_publication is distinct from current_publication then
    update public.listings
    set publication_status = new_publication
    where id = target_listing_id;
  end if;

  update public.listing_administration
  set visibility = new_visibility,
      moderation_status = new_moderation,
      moderation_note = coalesce(provider_note, moderation_note),
      hold_revision = case
        when action in ('hide', 'archive') then content_revision
        else hold_revision
      end,
      hidden_reason = case
        when action in ('hide', 'archive') then reason
        else hidden_reason
      end,
      hidden_by = case
        when action in ('hide', 'archive') then admin_id
        else hidden_by
      end,
      hidden_at = case
        when action in ('hide', 'archive') then pg_catalog.now()
        else hidden_at
      end
  where listing_id = target_listing_id;

  insert into public.listing_moderation_events
    (listing_id, action, moderation_status, visibility, publication_status,
     reason, provider_note, acted_by)
  values
    (target_listing_id, action, new_moderation, new_visibility, new_publication,
     reason, provider_note, admin_id);

  return action;
end;
$$;

revoke all on function public.admin_apply_listing_action(uuid, public.listing_admin_action, text, text)
  from public, anon;
grant execute on function public.admin_apply_listing_action(uuid, public.listing_admin_action, text, text)
  to authenticated;

-- Read model for the restoration UI. The administrator can see the current
-- revision and hold context, then inspect the listing/address/image/content
-- events. Only admin_restore_listing() can clear the hold, and it requires the
-- exact current revision under a row lock.
create function public.admin_listing_review_state(target_listing_id uuid)
returns table (
  listing_id uuid,
  publication_status public.publication_status,
  provider_status public.provider_status,
  visibility public.listing_visibility,
  moderation_status public.listing_moderation_status,
  content_revision bigint,
  hold_revision bigint,
  held boolean,
  publicly_visible boolean,
  last_content_change_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  return query
    select l.id,
           l.publication_status,
           p.status,
           a.visibility,
           a.moderation_status,
           a.content_revision,
           a.hold_revision,
           a.visibility = 'hidden' and a.hold_revision is not null,
           l.publication_status = 'published'
             and p.status = 'approved'
             and a.visibility = 'visible',
           (select max(e.changed_at)
            from public.listing_content_events e
            where e.listing_id = l.id)
    from public.listings l
    join public.providers p on p.id = l.provider_id
    join public.listing_administration a on a.listing_id = l.id
    where l.id = target_listing_id;
end;
$$;

revoke all on function public.admin_listing_review_state(uuid) from public, anon;
grant execute on function public.admin_listing_review_state(uuid) to authenticated;

-- Content edits also need an admin-only actor-aware history. Providers can see
-- what changed in their own listing but not who acted; an administrator delete
-- of an image/storage object must not leak the administrator UUID through the
-- provider-facing content table.
create function public.admin_listing_content_history(target_listing_id uuid)
returns table (
  id bigint,
  listing_id uuid,
  changed_by uuid,
  changed_at timestamptz,
  changed_fields text[],
  previous_values jsonb,
  new_values jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  return query
    select e.id,
           e.listing_id,
           e.changed_by,
           e.changed_at,
           e.changed_fields,
           e.previous_values,
           e.new_values
    from public.listing_content_events e
    where e.listing_id = target_listing_id
    order by e.id;
end;
$$;

revoke all on function public.admin_listing_content_history(uuid) from public, anon;
grant execute on function public.admin_listing_content_history(uuid) to authenticated;

-- Explicit, atomic restoration after review. The caller must be an
-- administrator, the listing must be on an administrative hold, and the
-- reviewed revision must equal the current content revision. Row locks on the
-- listing, administration and provider rows wait for any provider/address/
-- image/Storage write, so a concurrent change either commits before the
-- comparison (stale rejection) or waits until after restoration.
--
-- Restoration only clears the hold. It never changes publication_status. The
-- returned publicly_visible flag is true only when the listing is published and
-- its provider is still approved, so archived/draft/suspended listings stay
-- private even after their hold is cleared.
create function public.admin_restore_listing(
  target_listing_id uuid,
  reviewed_revision bigint,
  reason text,
  provider_note text default null
)
returns table (
  listing_id uuid,
  visibility public.listing_visibility,
  publication_status public.publication_status,
  provider_status public.provider_status,
  publicly_visible boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := (select auth.uid());
  current_provider_id uuid;
  current_publication public.publication_status;
  current_provider public.provider_status;
  current_visibility public.listing_visibility;
  current_moderation public.listing_moderation_status;
  current_revision bigint;
  current_hold_revision bigint;
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  if reason is null
     or char_length(btrim(reason)) < 3
     or char_length(btrim(reason)) > 2000 then
    raise exception 'a restoration reason between 3 and 2000 characters is required'
      using errcode = '23514';
  end if;

  if provider_note is not null
     and (char_length(btrim(provider_note)) < 1 or char_length(btrim(provider_note)) > 2000) then
    raise exception 'provider_note must be between 1 and 2000 characters' using errcode = '23514';
  end if;

  -- Canonical lock order: listing -> administration -> provider. The listing
  -- lock is also taken by the BEFORE address/image/Storage triggers, so a
  -- content mutation either commits before this comparison (leaving a stale
  -- revision) or waits until restoration commits. Explicit single-row locks
  -- avoid the plan-dependent order of a multi-table FOR UPDATE join.
  select l.provider_id, l.publication_status
    into current_provider_id, current_publication
  from public.listings l
  where l.id = target_listing_id
  for update;

  if not found then
    raise exception 'listing % does not exist', target_listing_id using errcode = '23503';
  end if;

  select a.visibility,
         a.moderation_status,
         a.content_revision,
         a.hold_revision
    into current_visibility,
         current_moderation,
         current_revision,
         current_hold_revision
  from public.listing_administration a
  where a.listing_id = target_listing_id
  for update;

  if not found then
    raise exception 'listing administration for % does not exist', target_listing_id
      using errcode = '23503';
  end if;

  select p.status
    into current_provider
  from public.providers p
  where p.id = current_provider_id
  for update;

  if not found then
    raise exception 'provider for listing % does not exist', target_listing_id
      using errcode = '23503';
  end if;

  if current_visibility <> 'hidden' or current_hold_revision is null then
    raise exception 'listing is not on an administrative hold' using errcode = '23514';
  end if;

  -- 40001 (serialization_failure) is deliberately used for a stale review so a
  -- client can distinguish it from malformed input and must re-review.
  if reviewed_revision is null or reviewed_revision <> current_revision then
    raise exception 'the reviewed content revision is stale; inspect the current listing and review again'
      using errcode = '40001';
  end if;

  update public.listing_administration as a
  set visibility = 'visible',
      hold_revision = null,
      moderation_note = coalesce(provider_note, a.moderation_note),
      hidden_reason = null,
      hidden_by = null,
      hidden_at = null
  where a.listing_id = target_listing_id;

  insert into public.listing_moderation_events
    (listing_id, action, moderation_status, visibility, publication_status,
     reason, provider_note, acted_by, review_decision, reviewed_revision)
  values
    (target_listing_id, 'restore', current_moderation, 'visible', current_publication,
     reason, provider_note, admin_id, 'approved', reviewed_revision);

  return query
    select target_listing_id,
           'visible'::public.listing_visibility,
           current_publication,
           current_provider,
           current_publication = 'published' and current_provider = 'approved';
end;
$$;

revoke all on function public.admin_restore_listing(uuid, bigint, text, text)
  from public, anon;
grant execute on function public.admin_restore_listing(uuid, bigint, text, text)
  to authenticated;

-- Provider-facing event rows intentionally omit the acting administrator's
-- UUID. Administrators use these checked RPCs when they need the full audit
-- record, including the actor. This keeps provider history useful without
-- exposing internal administrator identities through the table API.
create function public.admin_listing_moderation_history(target_listing_id uuid)
returns table (
  id bigint,
  listing_id uuid,
  action public.listing_admin_action,
  moderation_status public.listing_moderation_status,
  visibility public.listing_visibility,
  publication_status public.publication_status,
  reason text,
  provider_note text,
  acted_by uuid,
  acted_at timestamptz,
  review_decision text,
  reviewed_revision bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  return query
    select e.id,
           e.listing_id,
           e.action,
           e.moderation_status,
           e.visibility,
           e.publication_status,
           e.reason,
           e.provider_note,
           e.acted_by,
           e.acted_at,
           e.review_decision,
           e.reviewed_revision
    from public.listing_moderation_events e
    where e.listing_id = target_listing_id
    order by e.id;
end;
$$;

revoke all on function public.admin_listing_moderation_history(uuid) from public, anon;
grant execute on function public.admin_listing_moderation_history(uuid) to authenticated;

create function public.admin_listing_publication_history(target_listing_id uuid)
returns table (
  id bigint,
  listing_id uuid,
  from_status public.publication_status,
  to_status public.publication_status,
  changed_by uuid,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator authorisation required' using errcode = '42501';
  end if;

  return query
    select e.id,
           e.listing_id,
           e.from_status,
           e.to_status,
           e.changed_by,
           e.changed_at
    from public.listing_publication_events e
    where e.listing_id = target_listing_id
    order by e.id;
end;
$$;

revoke all on function public.admin_listing_publication_history(uuid) from public, anon;
grant execute on function public.admin_listing_publication_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and policies: listings
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;

revoke all on table public.listings from anon, authenticated;

-- Every column of a listing is public-safe by design; private data lives in
-- listing_administration / listing_addresses / events. The explicit column list
-- means a future sensitive column is not exposed automatically.
grant select (
  id,
  provider_id,
  title,
  description,
  accommodation_type,
  institution,
  city,
  neighbourhood,
  rent_amount,
  currency,
  rent_period,
  availability_status,
  bedrooms,
  bathrooms,
  furnishing_status,
  facilities,
  property_rules,
  publication_status,
  first_published_at,
  created_at,
  updated_at
) on table public.listings to anon, authenticated;

grant insert (
  provider_id,
  title,
  description,
  accommodation_type,
  institution,
  city,
  neighbourhood,
  rent_amount,
  currency,
  rent_period,
  availability_status,
  bedrooms,
  bathrooms,
  furnishing_status,
  facilities,
  property_rules,
  publication_status
) on table public.listings to authenticated;

-- provider_id, id and every timestamp are absent: ownership and audit data are
-- not client-writable. Administrative visibility/moderation are separate tables.
grant update (
  title,
  description,
  accommodation_type,
  institution,
  city,
  neighbourhood,
  rent_amount,
  currency,
  rent_period,
  availability_status,
  bedrooms,
  bathrooms,
  furnishing_status,
  facilities,
  property_rules,
  publication_status
) on table public.listings to authenticated;

grant delete on table public.listings to authenticated;

create policy listings_select_public
  on public.listings
  for select
  to anon, authenticated
  using (public.is_public_listing(id));

create policy listings_select_own
  on public.listings
  for select
  to authenticated
  using (public.owns_listing(id));

create policy listings_select_admin
  on public.listings
  for select
  to authenticated
  using (public.is_admin());

create policy listings_insert_by_approved_provider
  on public.listings
  for insert
  to authenticated
  with check (
    public.is_approved_provider_owner(provider_id)
    and publication_status in ('draft', 'published')
  );

create policy listings_update_by_approved_provider
  on public.listings
  for update
  to authenticated
  using (public.is_approved_provider_owner(provider_id))
  with check (
    public.is_approved_provider_owner(provider_id)
    and publication_status in ('draft', 'published', 'archived')
  );

create policy listings_delete_own_unpublished_drafts
  on public.listings
  for delete
  to authenticated
  using (public.can_delete_listing(id));

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_addresses
-- ---------------------------------------------------------------------------

alter table public.listing_addresses enable row level security;

revoke all on table public.listing_addresses from anon, authenticated;

grant select (listing_id, address_line, landmark, created_at, updated_at)
  on table public.listing_addresses to authenticated;
grant insert (listing_id, address_line, landmark)
  on table public.listing_addresses to authenticated;
grant update (address_line, landmark)
  on table public.listing_addresses to authenticated;

create policy listing_addresses_select_own
  on public.listing_addresses
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_addresses_select_admin
  on public.listing_addresses
  for select
  to authenticated
  using (public.is_admin());

create policy listing_addresses_insert_own
  on public.listing_addresses
  for insert
  to authenticated
  with check (public.can_manage_listing(listing_id));

create policy listing_addresses_update_own
  on public.listing_addresses
  for update
  to authenticated
  using (public.can_manage_listing(listing_id))
  with check (public.can_manage_listing(listing_id));

-- No grant and no policy for anon: anonymous visitors cannot read addresses.

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_images
-- ---------------------------------------------------------------------------

alter table public.listing_images enable row level security;

revoke all on table public.listing_images from anon, authenticated;

grant select (id, listing_id, storage_path, alt_text, position, is_cover, created_at)
  on table public.listing_images to anon, authenticated;
grant insert (listing_id, storage_path, alt_text, position, is_cover)
  on table public.listing_images to authenticated;
grant update (storage_path, alt_text, position, is_cover)
  on table public.listing_images to authenticated;
grant delete on table public.listing_images to authenticated;

-- Image rows are public only while their listing is publicly visible.
create policy listing_images_select_public
  on public.listing_images
  for select
  to anon, authenticated
  using (public.is_public_listing(listing_id));

create policy listing_images_select_own
  on public.listing_images
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_images_select_admin
  on public.listing_images
  for select
  to authenticated
  using (public.is_admin());

create policy listing_images_insert_own
  on public.listing_images
  for insert
  to authenticated
  with check (public.can_manage_listing(listing_id));

create policy listing_images_update_own
  on public.listing_images
  for update
  to authenticated
  using (public.can_manage_listing(listing_id))
  with check (public.can_manage_listing(listing_id));

create policy listing_images_delete_own
  on public.listing_images
  for delete
  to authenticated
  using (public.can_manage_listing(listing_id));

create policy listing_images_delete_admin
  on public.listing_images
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_administration
-- ---------------------------------------------------------------------------

alter table public.listing_administration enable row level security;

revoke all on table public.listing_administration from anon, authenticated;

-- Provider-facing columns only. hidden_reason/hidden_by/hidden_at stay internal;
-- the provider-facing reason is available in listing_moderation_events.
grant select (listing_id, visibility, moderation_status, moderation_note, updated_at)
  on table public.listing_administration to authenticated;

create policy listing_administration_select_own
  on public.listing_administration
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_administration_select_admin
  on public.listing_administration
  for select
  to authenticated
  using (public.is_admin());

-- No client insert/update/delete: rows are created by trigger and changed by
-- admin_apply_listing_action().

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_moderation_events
-- ---------------------------------------------------------------------------

alter table public.listing_moderation_events enable row level security;

revoke all on table public.listing_moderation_events from anon, authenticated;

grant select (id, listing_id, action, moderation_status, visibility, publication_status,
              reason, provider_note, acted_at)
  on table public.listing_moderation_events to authenticated;

create policy listing_moderation_events_select_own
  on public.listing_moderation_events
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_moderation_events_select_admin
  on public.listing_moderation_events
  for select
  to authenticated
  using (public.is_admin());

-- Append-only: no client insert/update/delete grant or policy. Administrators
-- write through admin_apply_listing_action().

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_publication_events
-- ---------------------------------------------------------------------------

alter table public.listing_publication_events enable row level security;

revoke all on table public.listing_publication_events from anon, authenticated;

grant select (id, listing_id, from_status, to_status, changed_at)
  on table public.listing_publication_events to authenticated;

create policy listing_publication_events_select_own
  on public.listing_publication_events
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_publication_events_select_admin
  on public.listing_publication_events
  for select
  to authenticated
  using (public.is_admin());

-- Append-only: written by trigger only.

-- ---------------------------------------------------------------------------
-- Grants and policies: listing_content_events
-- ---------------------------------------------------------------------------

alter table public.listing_content_events enable row level security;

revoke all on table public.listing_content_events from anon, authenticated;

grant select (id, listing_id, changed_at, changed_fields,
              previous_values, new_values)
  on table public.listing_content_events to authenticated;

create policy listing_content_events_select_own
  on public.listing_content_events
  for select
  to authenticated
  using (public.owns_listing(listing_id));

create policy listing_content_events_select_admin
  on public.listing_content_events
  for select
  to authenticated
  using (public.is_admin());

-- Append-only: written by trigger only; no client insert/update/delete grant or
-- policy exists.

-- ---------------------------------------------------------------------------
-- Saved properties compatibility (deliberately not created in this phase)
-- ---------------------------------------------------------------------------
--
-- A future saved_listings table is expected to look like:
--   student_id uuid references auth.users (id) on delete cascade
--   listing_id uuid references public.listings (id) on delete cascade
--   primary key (student_id, listing_id)
--   RLS: own rows only, for select/insert/delete, with the insert policy
--        requiring the listing to be publicly visible.
-- That shape gives one save per student per listing, private ownership, and
-- referential cleanup when a listing is removed. It is not created here because
-- saving belongs to its own phase and there are no rows to preserve yet.
-- Archived listings are retained (publication_status = 'archived'), so saves
-- would survive archiving; only a hard delete removes them.
