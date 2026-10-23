-- Phase 2B — provider authorisation foundation.
--
-- Provider approval is a permission to publish, not proof of identity or
-- property inspection. "approved" means "authorised to list on QUARTERS".
--
-- Workflow:
--   * An authenticated user may submit their own provider application. The row
--     is forced to status 'pending' by policy; applicants cannot set any other
--     status, update the row or delete it.
--   * Only an administrator (public.admin_users, provisioned by a trusted
--     backend) may insert a provider review. The review records the decision,
--     provider-facing note, private internal note, evidence references, the
--     acting reviewer and the timestamp.
--   * The latest review drives providers.status. Suspension therefore takes
--     effect immediately for every public visibility check (see the listings
--     migration), without mutating the provider's listings.
--
-- Administrator authorisation is not a profile field, an email address or a
-- frontend flag: it is a row in public.admin_users that only the trusted
-- service-role/dashboard path can create. This migration ships no client write
-- grant or policy for that table. Until an admin-provisioning process exists,
-- admins must be created outside the app (documented dependency).
--
-- Status is separate from listing moderation and property availability:
--   providers.status             -> may this account publish listings?
--   listings.publication_status  -> is this listing published/archived/draft?
--   listing_administration       -> administrative visibility and moderation state
--   listings.availability_status -> does the property currently have space?

create type public.provider_kind as enum ('landlord', 'agent');

create type public.provider_status as enum (
  'pending',
  'approved',
  'rejected',
  'suspended'
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one provider record per account. Deleting the account removes the
  -- authorisation, but a provider that still has listings is protected by the
  -- ON DELETE RESTRICT foreign key on listings.provider_id: listings must be
  -- archived or reassigned before the account can be removed.
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  kind public.provider_kind not null,
  display_name text not null,
  status public.provider_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_display_name_length
    check (char_length(btrim(display_name)) between 2 and 80)
);

comment on table public.providers is
  'Phase 2B: provider application and publishing authorisation.';
comment on column public.providers.owner_id is
  'The auth user who controls this provider. Never exposed through the client table API; administrators read it through admin_provider_application().';
comment on column public.providers.status is
  'pending | approved | rejected | suspended. Derived from provider_reviews.';
comment on column public.providers.display_name is
  'Provider or agency display name; public only while the provider is approved.';

create index providers_status_idx on public.providers (status);

-- Trusted administrator directory. No client grants or policies: only the
-- service role/dashboard can provision an administrator. is_admin() reads it
-- through a SECURITY DEFINER function.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  constraint admin_users_note_length
    check (note is null or char_length(btrim(note)) between 1 and 500)
);

comment on table public.admin_users is
  'Phase 2B: administrator authorisation. Trusted provisioning only; no client access.';

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

-- Immutable provider review history. One row per decision; the latest row is the
-- current authorisation state and drives providers.status.
create table public.provider_reviews (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers (id) on delete cascade,
  decision public.provider_status not null,
  -- Provider-facing explanation of the decision.
  provider_note text,
  -- Internal reviewer notes: never exposed through the table API.
  internal_note text,
  -- Private references to evidence held in a future private bucket; never
  -- exposed through the table API and never populated with fabricated records.
  evidence_references text[] not null default '{}'::text[],
  -- The authorised reviewer. Private; no table column grant exists.
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_reviews_decision_is_final
    check (decision <> 'pending'),
  constraint provider_reviews_provider_note_length
    check (provider_note is null or char_length(btrim(provider_note)) between 1 and 2000),
  constraint provider_reviews_internal_note_length
    check (internal_note is null or char_length(btrim(internal_note)) between 1 and 4000),
  constraint provider_reviews_evidence_size
    check (cardinality(evidence_references) <= 20),
  constraint provider_reviews_evidence_no_nulls
    check (array_position(evidence_references, null) is null)
);

comment on table public.provider_reviews is
  'Phase 2B: provider approval/rejection/suspension history. Admin write path only.';
comment on column public.provider_reviews.provider_note is
  'Visible to the provider who owns the record.';
comment on column public.provider_reviews.internal_note is
  'Internal only. No table column grant; admins read it through the admin RPC.';
comment on column public.provider_reviews.evidence_references is
  'Internal references to evidence; no table column grant.';
comment on column public.provider_reviews.reviewed_by is
  'Authorised reviewer account. No table column grant.';

create index provider_reviews_provider_idx
  on public.provider_reviews (provider_id, id desc);

-- updated_at is maintained server-side. SECURITY INVOKER, empty search_path,
-- trigger-only, and no API EXECUTE: same hardening as public.profiles.
create function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

create trigger providers_touch_updated_at
  before update on public.providers
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Authorisation checks
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies can check ownership/administration without
-- exposing providers.owner_id or admin_users, and without recursive RLS.
create function public.owns_provider(target_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = target_provider_id
      and p.owner_id = (select auth.uid())
  );
$$;

create function public.is_approved_provider_owner(target_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = target_provider_id
      and p.status = 'approved'
      and p.owner_id = (select auth.uid())
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_provider(uuid) from public, anon;
revoke all on function public.is_approved_provider_owner(uuid) from public, anon;
revoke all on function public.is_admin() from public, anon;

grant execute on function public.owns_provider(uuid) to authenticated;
grant execute on function public.is_approved_provider_owner(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- A provider review is the single source of truth for providers.status. The
-- trigger keeps the authorisation state and the audit trail consistent.
create function public.provider_reviews_apply_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision = 'pending' then
    raise exception 'a provider review must record approved, rejected or suspended'
      using errcode = '23514';
  end if;

  -- An administrator must not approve or suspend their own provider record.
  if new.reviewed_by is not null and exists (
    select 1
    from public.providers p
    where p.id = new.provider_id
      and p.owner_id = new.reviewed_by
  ) then
    raise exception 'a reviewer cannot review their own provider record'
      using errcode = '42501';
  end if;

  update public.providers
  set status = new.decision
  where id = new.provider_id;

  if not found then
    raise exception 'provider % does not exist', new.provider_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.provider_reviews_apply_decision() from public, anon, authenticated;

create trigger provider_reviews_apply_decision
  after insert on public.provider_reviews
  for each row
  execute function public.provider_reviews_apply_decision();

-- Administrators can read the private review details (internal notes, evidence
-- references and reviewer identity) through this checked RPC. Ordinary users
-- receive an authorisation error; providers use the table's provider-facing
-- columns.
create function public.admin_provider_review_history(target_provider_id uuid)
returns table (
  id bigint,
  provider_id uuid,
  decision public.provider_status,
  provider_note text,
  internal_note text,
  evidence_references text[],
  reviewed_by uuid,
  reviewed_at timestamptz
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
    select r.id,
           r.provider_id,
           r.decision,
           r.provider_note,
           r.internal_note,
           r.evidence_references,
           r.reviewed_by,
           r.reviewed_at
    from public.provider_reviews r
    where r.provider_id = target_provider_id
    order by r.id desc;
end;
$$;

revoke all on function public.admin_provider_review_history(uuid) from public, anon;
grant execute on function public.admin_provider_review_history(uuid) to authenticated;

-- Administrators also need the applicant identity and profile name when
-- reviewing an application. providers.owner_id is deliberately absent from the
-- table's column grants, so this checked RPC is the only client path. It does
-- not expose auth email addresses; a future dashboard can use the Auth admin API
-- through a trusted backend if contact details are required.
create function public.admin_provider_application(target_provider_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  kind public.provider_kind,
  display_name text,
  status public.provider_status,
  created_at timestamptz,
  updated_at timestamptz,
  owner_display_name text
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
    select p.id,
           p.owner_id,
           p.kind,
           p.display_name,
           p.status,
           p.created_at,
           p.updated_at,
           pr.display_name
    from public.providers p
    left join public.profiles pr on pr.id = p.owner_id
    where p.id = target_provider_id;
end;
$$;

revoke all on function public.admin_provider_application(uuid) from public, anon;
grant execute on function public.admin_provider_application(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and policies: providers
-- ---------------------------------------------------------------------------

alter table public.providers enable row level security;

revoke all on table public.providers from anon, authenticated;

grant select (id, kind, display_name, status, created_at, updated_at)
  on table public.providers to anon, authenticated;

-- An authenticated user may submit their own application. The status is forced
-- to pending by the policy; approval happens only through provider_reviews.
grant insert (owner_id, kind, display_name, status)
  on table public.providers to authenticated;

create policy providers_select_public
  on public.providers
  for select
  to anon, authenticated
  using (status = 'approved');

create policy providers_select_own
  on public.providers
  for select
  to authenticated
  using (public.owns_provider(id));

create policy providers_select_admin
  on public.providers
  for select
  to authenticated
  using (public.is_admin());

create policy providers_insert_application
  on public.providers
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'pending'
  );

-- No update or delete grant/policy: applicants cannot change their status or
-- erase an application. Administrators change status only by inserting a
-- provider review.

-- ---------------------------------------------------------------------------
-- Grants and policies: provider_reviews
-- ---------------------------------------------------------------------------

alter table public.provider_reviews enable row level security;

revoke all on table public.provider_reviews from anon, authenticated;

-- Provider-facing columns only. Internal notes, evidence references and the
-- reviewer identity are exposed only through admin_provider_review_history().
grant select (id, provider_id, decision, provider_note, reviewed_at)
  on table public.provider_reviews to authenticated;

grant insert (
  provider_id,
  decision,
  provider_note,
  internal_note,
  evidence_references,
  reviewed_by
) on table public.provider_reviews to authenticated;

create policy provider_reviews_select_own
  on public.provider_reviews
  for select
  to authenticated
  using (public.owns_provider(provider_id));

create policy provider_reviews_select_admin
  on public.provider_reviews
  for select
  to authenticated
  using (public.is_admin());

-- The reviewer must be the authenticated administrator; a client cannot forge
-- another reviewer's identity. reviewed_at is not grantable and defaults to now.
create policy provider_reviews_insert_admin
  on public.provider_reviews
  for insert
  to authenticated
  with check (
    public.is_admin()
    and reviewed_by = (select auth.uid())
  );

-- No update/delete grant or policy: review history is append-only.
