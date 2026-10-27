-- Report a listing.
--
-- One report per account per listing, so a single unhappy student cannot bury a
-- property in duplicate rows. Reporting is open to any signed-in account that
-- can see the listing, because the person best placed to notice a scam has
-- often never made it as far as a viewing.
--
-- Reports are write-only for students: the row is inserted and nobody edits it
-- afterwards. Administrators read every report through is_admin(); they can
-- move its status along, and nothing else in the row is client-writable.

create type public.listing_report_reason as enum (
  'scam',
  'wrong_details',
  'already_taken',
  'unreachable',
  'offensive',
  'duplicate',
  'other'
);

comment on type public.listing_report_reason is
  'Why a listing was reported. Mirrored by listingReportReasonLabels in the app.';

create type public.listing_report_status as enum ('open', 'reviewed', 'dismissed');

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason public.listing_report_reason not null,
  details text,
  status public.listing_report_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint listing_reports_details_length
    check (details is null or char_length(btrim(details)) between 10 and 1000),
  -- "Something else" cannot be understood without words.
  constraint listing_reports_other_requires_details
    check (reason <> 'other' or details is not null),
  constraint listing_reports_once_per_reporter unique (listing_id, reporter_id)
);

comment on table public.listing_reports is
  'Student reports about a listing. Read by administrators, never by other students.';

create index listing_reports_listing_idx
  on public.listing_reports (listing_id, created_at desc);

create index listing_reports_open_idx
  on public.listing_reports (created_at desc)
  where status = 'open';

alter table public.listing_reports enable row level security;

revoke all on table public.listing_reports from anon, authenticated;

grant select (id, listing_id, reporter_id, reason, details, status, created_at)
  on table public.listing_reports to authenticated;

grant insert (listing_id, reporter_id, reason, details)
  on table public.listing_reports to authenticated;

-- The only edit an administrator can make from the API.
grant update (status) on table public.listing_reports to authenticated;

create policy listing_reports_insert_own
  on public.listing_reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.is_public_listing(listing_id)
  );

-- A student sees the reports they filed (so the screen can say "you reported
-- this"), and administrators see everyone's.
create policy listing_reports_select_own
  on public.listing_reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy listing_reports_select_admin
  on public.listing_reports
  for select
  to authenticated
  using (public.is_admin());

create policy listing_reports_update_admin
  on public.listing_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
