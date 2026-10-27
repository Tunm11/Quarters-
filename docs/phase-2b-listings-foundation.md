# Phase 2B — Supabase listings foundation

**Status: hold/restoration and lock-hardening design added, version-controlled
but not applied live.** The three Phase 2B migrations are still unapplied and
unshared, so they were revised in place rather than corrected with a forward
migration. The applied profile migrations were not edited.

## Inspection before this correction

- Branch `main`, latest commit `172df31 Reconcile Supabase database types`.
- The Phase 1 / Phase 2A UI work in the working tree was preserved.
- Applied migrations in the repository: `20261022145520_create_profiles`,
  `20261022150450` / `…455_revoke_profiles_trigger_function_api_execute`.
  Those files are the record of live history and were not modified.
- The three Phase 2B migrations are untracked files in this branch, so they have
  never been committed, shared, or applied. They can safely be rewritten in
  place; no migration history was altered.
- A read-only PostgREST probe of the live project (publishable key, anon role)
  returned `404 PGRST205` for `providers`, `provider_reviews`, `admin_users`,
  `listings`, `listing_addresses`, `listing_images`,
  `listing_administration`, `listing_moderation_events`,
  `listing_publication_events` and the superseded `listing_moderation`. The
  Phase 2B schema is therefore absent live.
- No Supabase CLI, database URL, management token or service-role key is
  available here, so migrations were not applied and types were not generated
  from the live project.

## The corrected business model

QUARTERS approves **providers**, not individual properties.

1. An authenticated user submits a provider application. The database forces it
   to `pending`.
2. An administrator approves, rejects or suspends the provider through an
   append-only review record.
3. An **approved** provider can create draft listings and publish them
   immediately. There is no per-listing administrator approval step.
4. Administrators moderate listings **after publication**: flag, request a
   correction, hide, restore, or archive. They do not need to approve every
   property.
5. A listing is publicly visible only while it is published, its provider is
   currently approved, and an administrator has not hidden it.
6. Provider approval means “authorised to publish on QUARTERS”. It is **not**
   identity verification and **not** proof that a property was inspected. The
   UI label is “Approved provider”, never “Verified property”.

Five states are deliberately separate:

| Question | Where it is answered |
| --- | --- |
| May this account publish at all? | `providers.status` (`pending`, `approved`, `rejected`, `suspended`) |
| Is this listing published, a draft, or archived? | `listings.publication_status` (`draft`, `published`, `archived`) |
| Has an administrator hidden it? | `listing_administration.visibility` (`visible`, `hidden`) |
| Is there a moderation issue? | `listing_administration.moderation_status` (`none`, `flagged`, `correction_requested`, `resolved`) |
| Does the property currently have space? | `listings.availability_status` (`available`, `limited`, `unavailable`) |

Public visibility is computed, never stored redundantly:

```text
publication_status = 'published'
AND providers.status = 'approved'
AND listing_administration.visibility = 'visible'
```

A flag or correction request therefore does **not** hide a listing and does
**not** suspend a provider. Hiding is a separate administrator action.

## Provider workflow and authorisation

### Tables

`public.providers` — one row per account.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `owner_id` | `uuid` NOT NULL UNIQUE → `auth.users(id)` ON DELETE CASCADE | never granted through the API |
| `kind` | `provider_kind` (`landlord`, `agent`) | |
| `display_name` | `text` NOT NULL, 2–80 after trim | public while approved |
| `status` | `provider_status` (`pending`, `approved`, `rejected`, `suspended`) | default `pending`; changed only by a review trigger |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` by trigger |

`public.admin_users` — the trusted administrator directory.

`user_id` PK → `auth.users(id)`, `granted_by`, `granted_at`, `note`. RLS is
enabled and **no client grant or policy exists**. Only the service role, SQL
editor, or a future trusted backend can insert a row.

`public.provider_reviews` — append-only authorisation history.

| Column | Notes |
| --- | --- |
| `provider_id` | reviewed provider |
| `decision` | `approved`, `rejected`, `suspended`; `pending` is forbidden |
| `provider_note` | visible to the provider |
| `internal_note` | internal only; no column grant |
| `evidence_references` | private references; no column grant |
| `reviewed_by` | acting administrator; no column grant |
| `reviewed_at`, `created_at` | server-set |

An `AFTER INSERT` trigger applies `decision` to `providers.status` and refuses a
review written by the owner of that provider record. A provider cannot approve
or suspend themselves.

### Client paths

| Actor | Allowed |
| --- | --- |
| Applicant | insert their own provider row with `status = 'pending'` |
| Applicant | read their own row whatever its status, plus approved providers |
| Applicant | **no** update or delete of `providers` |
| Administrator | read every provider and every review |
| Administrator | read applicant identity/profile through `admin_provider_application()` |
| Administrator | insert a review with `reviewed_by = auth.uid()` |
| Anyone | no update or delete of `provider_reviews` |

There is no client-editable role field, no `isAdmin` flag in a profile, no email
allow-list and no frontend-only check. `public.is_admin()` reads
`admin_users` through a `SECURITY DEFINER` function with an empty `search_path`.
Every administrative RPC checks it inside PostgreSQL.

**Provisioning an administrator (trusted path, not shipped as an app action):**

```sql
-- Run as the service role / project owner, never from the browser.
insert into public.admin_users (user_id, granted_by, note)
values ('<auth user uuid>', '<granting administrator uuid>', 'Initial administrator');
```

No such row is seeded by the migrations. Until the owner provisions at least one
administrator, no one can approve providers or moderate listings through the
API. This is intentional; there is no insecure bootstrap shortcut.

## Listing publication

`public.listings` holds property content. Its client-writable columns are the
content fields plus `publication_status`; `provider_id`, `id`, `created_at`,
`updated_at` and `first_published_at` are not client-writable.

Client publication transitions:

```text
draft      -> draft | published | archived
published  -> draft | published | archived
archived   -> archived            (ordinary clients)
```

An archived listing is terminal for an ordinary provider. A database trigger
blocks both the direct `archived -> published` transition and the two-step
`archived -> draft -> published` route. This prevents an administrative archive
from being undone by later provider edits. No unarchive RPC exists yet; a future
unarchive workflow must be an explicit, authorised administrator operation that
deliberately opts out of this guard. Provider self-archiving therefore also
requires that future workflow to return to draft/published.

Creation accepts `draft` or `published`. A published row must carry a
description, rent amount and rent period (`listings_published_requires_details`).
`first_published_at` is stamped by a trigger on the first publication and never
overwritten.

An approved provider publishing a new property therefore performs one insert
with `publication_status = 'published'` as themselves. The database checks
ownership and approval; no administrator is involved. Drafts remain private
until the provider publishes them.

A provider may edit published content without re-approval. The table's checks
still apply (title, description, rent, currency, arrays, enum values), so an edit
cannot bypass validation. Material content edits are written to
`listing_content_events` with the changed field names and their previous/new
values; the trigger ignores no-op updates and does not duplicate a
publication-only change as a content event. Publication-only changes still
increment the hold review revision.
`first_published_at` records the initial publication, and the publication trigger
records a `draft -> published` event when a listing is created directly as
published, so the publication history is complete from the first moment.

## Administrative moderation

`public.listing_administration` is one row per listing, created by an `AFTER
INSERT` trigger. It holds `visibility`, `moderation_status`, the latest
provider-facing `moderation_note`, `content_revision`, `hold_revision`, and
internal `hidden_reason`, `hidden_by`, `hidden_at`. It has no client
insert/update/delete path. The revision columns are read through
`admin_listing_review_state()`; they are not in the provider column grant.

`public.admin_apply_listing_action(listing_id, action, reason, provider_note)`
handles `flag`, `request_correction`, `resolve`, `hide` and `archive`. It enforces
`is_admin()` inside the database, locks the listing row first and then the
administration row in an explicit order, and writes an append-only event. It
**refuses `restore`**: restoration requires the separate, revision-checked
`admin_restore_listing()` operation below.

| Action | Publication | Visibility | Moderation | Reason required |
| --- | --- | --- | --- | --- |
| `flag` | unchanged | unchanged | `flagged` | yes |
| `request_correction` | unchanged | unchanged | `correction_requested` | yes |
| `resolve` | unchanged | unchanged | `resolved` | no |
| `hide` | unchanged | `hidden` | unchanged | yes |
| `archive` | `archived` | `hidden` | unchanged | yes |

Important consequences:

- A flag or correction request does not hide the property. An administrator can
  hide it separately if safety requires it.
- `hide` starts an administrative hold. `archive` starts a hold and records the
  archived publication state. Both snapshot the current content revision.
- A generic `restore` is rejected. The dedicated restoration operation never
  changes `publication_status`, so a still-archived listing cannot be
  accidentally republished by clearing a hold.

`public.listing_moderation_events` records `action`, resulting moderation and
visibility states, publication state, reason, provider note, acting
administrator and timestamp. Restoration rows also record `review_decision` and
`reviewed_revision`. `public.listing_publication_events` records every change of
`publication_status` with the previous and new state and the actor. Both are
append-only: no client insert, update or delete grant or policy exists.
Administrators write through the checked RPCs; the publication trigger writes the
publication history.

Providers can read their own history, including the reason, provider note and
timestamps, but the acting administrator UUID and restoration review metadata
are **not** in the provider column grants. Content/address/image events also
exclude `changed_by` from the provider grant, because an administrator can delete
an image row or Storage object. Administrators read the full audit rows through
`admin_listing_moderation_history()`, `admin_listing_publication_history()` and
`admin_listing_content_history()`. They cannot alter or erase history. Deletion
is limited to drafts that were never published and have no moderation,
publication **or content-change** events. A draft with an address, image row or
other material edit has an audit marker, so a provider cannot hard-delete it and
cascade the audit rows away.

### Administrative hold and restoration

A hold is represented by `listing_administration.visibility = 'hidden'` plus
`hold_revision`, the `content_revision` at which the hold began.

`content_revision` is a monotonic counter on `listing_administration`. It is
incremented by:

- material changes to the listing row: title, description, accommodation type,
  institution, city, neighbourhood, rent/currency/period, availability,
  bedrooms/bathrooms, furnishing, facilities and property rules;
- changes to `publication_status`, so changing the lifecycle cannot silently
  bypass a review;
- address inserts, updates and removals (the audit marker contains no address
  values);
- image-row inserts, updates and removals; and
- `storage.objects` inserts, replacements and removals in `listing-images`,
  including replacing the bytes at the same object path through the Storage API.

All markers are written to `listing_content_events`. Address and image markers
contain only a change label and empty value objects, so private address details
and Storage metadata are not copied into the audit trail. The current address,
image rows and Storage objects remain available to the administrator through
their own admin read paths.

The lifecycle is:

1. An administrator applies `hide` or `archive` with a reason and optional
   provider note. The listing becomes hidden immediately; its current
   `content_revision` is recorded as `hold_revision`.
2. Public Explore queries, `listing_images` reads and Storage object reads all
   fail because `is_public_listing()` requires `visibility = 'visible'`.
3. The provider sees the reason/note through their existing moderation feedback
   (`listing_moderation_events` and `moderation_note`). They may submit
   corrections while the listing remains hidden; every material change is
   audited and increments `content_revision`.
4. `admin_listing_review_state(listing_id)` gives an administrator the current
   content revision, hold revision, publication state, provider status and
   public-visibility result. The administrator inspects the current listing,
   private address, images, publication history and `listing_content_events`.
5. `admin_restore_listing(listing_id, reviewed_revision, reason, provider_note)`
   requires `is_admin()`, an active hold and an exact match between
   `reviewed_revision` and the current `content_revision`. It locks the listing,
then administration, then provider, in that explicit order before comparing.
6. A stale revision raises SQLSTATE `40001` and leaves the listing hidden. The
   listing row is locked before every address, image-row and Storage-object
   mutation, so a concurrent write either commits before the comparison (causing
   stale rejection) or waits until restoration commits. The shared lock order is
   listing -> administration -> provider; the content triggers take the listing
   lock first and update administration in their AFTER audit step.
7. Successful restoration clears `visibility` and `hold_revision`, writes a
   `restore` event with the administrator, timestamp, reason, provider note,
   `review_decision = 'approved'` and `reviewed_revision`, and returns whether the
   result is publicly visible.

Restoration only clears the administrative hold. It does not publish a draft,
unarchive an archived listing, or override a provider suspension. The returned
`publicly_visible` value is true only when `publication_status = 'published'` and
`providers.status = 'approved'`. A suspended or unapproved provider's listing
stays private even after its hold is cleared; a later reinstatement follows the
normal provider-status rule.

Providers cannot clear the hold, write `visibility`/`hold_revision`, call the
revision helpers, call `admin_apply_listing_action('restore', ...)`, or call
`admin_restore_listing()`. After a successful restoration, later provider edits
follow the existing published-listing policy; there is no new per-edit approval
requirement. Archived listings remain the exception: they cannot move back to
draft or published through the ordinary client update path.

## Suspension and reinstatement

Provider suspension is a review decision, not a bulk update of listings:

- Every write policy for a listing, address, image row or storage object checks
  `is_approved_provider_owner`/`can_manage_listing`. A suspended provider loses
  all of those writes immediately.
- Public reads, image reads and storage reads check the provider's current
  status. Existing published listings disappear from Explore and from public
  image access as soon as the suspension is recorded, without modifying the
  listings.
- Reinstatement makes only listings that are still `published` and `visible`
  public again. Individually hidden or archived listings stay hidden.
- Clearing a hold through `admin_restore_listing()` while the provider is
  suspended or rejected records the reviewed revision and makes the listing
  visible in the database, but it does **not** make it public. Provider status
  still gates Explore, image rows and Storage reads.
- An administrator can inspect every listing of a suspended provider and hide
  individual properties before reinstating the account if any need further
  review.
- The suspension and reinstatement decisions remain in `provider_reviews`. No
  listings are deleted or rewritten.

## Storage security

Migration `…153400` creates a **private** `listing-images` bucket, 8 MB, limited
to `image/jpeg`, `image/png` and `image/webp`. It corrects an existing bucket
with the same id to private/limited rather than silently accepting incompatible
settings, and it refuses to install policies if `storage.objects` does not have
RLS enabled.

Object paths are exactly `<provider_id>/<listing_id>/<file>` in the bucket. A
BEFORE trigger on `storage.objects` parses old/new paths and locks the parent
listing row before an insert, replacement, rename or removal; the existing AFTER
trigger then bumps the review revision and writes the audit marker. This
serializes the metadata transaction with `admin_restore_listing()`. It does not
by itself prove that Storage wrote replacement bytes after the metadata lock; see
the staging gate and remaining risk about byte-versus-metadata ordering.

| Role | Read | Write |
| --- | --- | --- |
| `anon` / any student | objects whose `listing_images` row belongs to a currently public listing | none |
| Managing provider | own listing objects in any publication state, including drafts, hidden listings and suspended/rejected records | insert/update/delete only while the provider is approved and the path resolves to a listing they manage |
| Administrator | any object in the bucket | delete only |
| Orphan object | not public | not writable by clients; administrator/service cleanup |

A private bucket is required because a public bucket would serve object URLs
without consulting listing visibility. The `listing_images` table and the
Storage object policies use the same visibility helpers, so hiding, archiving or
suspending removes public image access. The trigger also validates that an image
path matches its listing's provider folder, rejects traversal and cross-provider
paths, and the Storage policy rejects a path that does not resolve to a managed
listing.

Deleting an image row or a listing does not automatically delete the Storage
object. Orphans are never public, and an administrator or future cleanup job can
remove them.

A Storage-object audit trigger covers inserts, replacements and removals in
`listing-images`. This is required because replacing bytes at an existing path
through the Storage API does not update `listing_images`; without it, a held
listing could be restored with an unreviewed image. Object updates that move
between listing paths bump both affected listings. Updates whose only difference
is `last_accessed_at` are ignored so access tracking does not invalidate a hold.
The trigger is a `SECURITY DEFINER` function with an empty `search_path`, and its
function EXECUTE privilege is revoked from API roles.

The migration also installs **restrictive** policies scoped to
`listing-images`. Restrictive policies are ANDed with every permissive policy,
so a broad existing policy cannot grant draft/hidden image access or upload
rights. Each restrictive policy uses
`bucket_id is distinct from 'listing-images' OR <the intended rule>`, leaving
unrelated buckets unaffected. The guards cover `anon`/`authenticated` SELECT,
INSERT, UPDATE and DELETE.

Existing policies are still additive on top of the intended permissive policies;
the restrictive guards make the listing-image rules authoritative. The live
project's complete `storage.objects` policy set must still be audited when the
migration is applied, because only the dashboard/service role can enumerate it.

### Preflight before applying

The repository cannot enumerate policies created in the live Supabase dashboard.
Run these read-only queries as the project owner before `supabase db push`:

```sql
-- Inspect every live Storage policy. Any permissive USING true / WITH CHECK true
-- policy is the reason the restrictive guards exist; do not delete unrelated
-- policies just to make the migration apply.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

select relrowsecurity as storage_objects_rls
from pg_class
where oid = 'storage.objects'::regclass;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'listing-images';
```

If a `listing-images` bucket already exists, inspect its objects/ownership before
the migration updates it to private with image-only limits. A permissive policy
found by the first query can remain in place; the restrictive policies are
scoped so it cannot widen listing-image access and unrelated buckets keep
working. Also review existing **restrictive** policies: unlike a broad permissive
policy, a narrow restrictive policy from another feature could block
`listing-images` because restrictive policies are ANDed with everything. That
would make uploads/reads fail rather than grant extra access, and must be
resolved before applying.

Check for name collisions before applying. The expected new objects are the ten
Phase 2B tables (`providers`, `admin_users`, `provider_reviews`, `listings`,
`listing_addresses`, `listing_images`, `listing_administration`,
`listing_moderation_events`, `listing_publication_events` and
`listing_content_events`), their enums, the helper/RPC/trigger functions, the
`listing_*`, `providers_*` and `provider_reviews_*` policies, and the
`listings_*`, `provider_reviews_*`, `listing_images_*` and
`listing_addresses_*` triggers. The migration also creates
`storage_objects_record_listing_image_change` on `storage.objects`; confirm the
migration role can create that trigger, that no trigger with that name exists,
and that Storage maintenance/restore tooling tolerates triggers on the Storage
schema. Run the corresponding `pg_class`, `pg_type`, `pg_proc`, `pg_policies` and
`information_schema.triggers` queries (or `\d` in the SQL editor) and stop if any
name already belongs to a different object. Do not rewrite applied migration
history to resolve a collision.

## RLS summary

RLS is enabled on every Phase 2B table. Default `anon`/`authenticated` table
privileges are revoked, then explicit column grants are issued.

| Table | anon | authenticated (student) | authenticated (provider) | administrator |
| --- | --- | --- | --- | --- |
| `admin_users` | none | none | none | service-role provisioning only |
| `providers` | approved rows, public columns | approved + own row; insert own pending application | own read; no update/delete | all rows; review history |
| `provider_reviews` | none | none | own provider-facing columns | all columns; append-only insert |
| `listings` | published + approved provider + visible | public rows only | public + own; insert/update while approved; delete never-published unreviewed drafts | all rows |
| `listing_addresses` | none | none | own SELECT/INSERT/UPDATE while approved | all rows |
| `listing_images` | images of public listings | public rows only | public + own; manage while approved | all rows; delete any |
| `listing_administration` | none | none | own provider-facing columns; revisions excluded | all rows; writes via reviewed RPC |
| `listing_moderation_events` | none | none | own rows; actor and review metadata excluded | all rows; actor/review via admin RPC |
| `listing_publication_events` | none | none | own rows; actor column excluded | all rows; actor via admin RPC |
| `listing_content_events` | none | none | own rows; actor excluded | all rows; actor via admin RPC; trigger only |

Helper functions are `SECURITY DEFINER` with `search_path = ''`, so policies do
not recursively evaluate RLS and `providers.owner_id`/`admin_users` are never
exposed to the browser:

| Function | Purpose |
| --- | --- |
| `owns_provider(uuid)` | any provider row owned by `auth.uid()` |
| `is_approved_provider_owner(uuid)` | owner **and** currently approved |
| `is_admin()` | caller is in `admin_users` |
| `owns_listing(uuid)` | listing belongs to a provider owned by the caller, regardless of status |
| `can_manage_listing(uuid)` | approved owner of the listing |
| `is_public_listing(uuid)` | published + approved provider + visible |
| `can_delete_listing(uuid)` | never-published draft with no moderation, publication or content history |
| `listing_image_listing_id(text)` | strict path → listing parser |
| `is_own_listing_image(text)` / `is_public_listing_image(text)` / `can_manage_listing_image(text)` | Storage policy helpers |
| `admin_provider_application(uuid)` | admin-only applicant identity/profile details |
| `admin_listing_review_state(uuid)` | admin-only current revision/hold/visibility review model |
| `admin_restore_listing(uuid, bigint, text, text)` | exact-revision, locked restoration with audit |
| `admin_listing_content_history(uuid)` | admin-only content/address/image audit with actor |
| `admin_listing_moderation_history(uuid)` | admin-only moderation audit with actor and review decision |
| `admin_listing_publication_history(uuid)` | admin-only publication audit with actor |

Trigger helpers `bump_listing_content_revision()` and
`record_listing_content_change()` are also `SECURITY DEFINER` with an empty
`search_path`; their EXECUTE privileges are revoked from API roles, and only
trusted triggers call them.

Address, image-row and Storage-object mutations have BEFORE lock triggers that
take the parent listing row lock before the child mutation. Restoration takes
the same lock first, then administration, then provider, so a content write
cannot compare/slip between review and visibility update. The lock triggers are
trigger-only, `SECURITY DEFINER` where they read the parent row, and have EXECUTE
revoked from API roles.

Trigger functions are `SECURITY INVOKER` where they only touch `NEW`, and
`SECURITY DEFINER` where they must update an audit/administration table. EXECUTE
is revoked from `PUBLIC`, `anon` and `authenticated` on trigger functions. This
includes the `storage.objects` lock and audit triggers for listing-image object
writes.

The canonical order covers the restoration/content paths. A future transaction
that intentionally edits multiple listings, or mixes provider-review and
listing-administration calls, must still acquire rows in a consistent order;
PostgreSQL will detect and abort a true deadlock rather than allow it to corrupt
state.

## Migrations and migration safety

| Version | Name | File |
| --- | --- | --- |
| `20261022153000` | `create_provider_authorisation` | `supabase/migrations/20261022153000_create_provider_authorisation.sql` |
| `20261022153200` | `create_listing_foundation` | `supabase/migrations/20261022153200_create_listing_foundation.sql` |
| `20261022153400` | `create_listing_image_storage` | `supabase/migrations/20261022153400_create_listing_image_storage.sql` |

These files are **not applied** and are not in shared history. They were revised
in place for this correction. The applied profile migrations and migration
history were untouched. No live database, Storage, Auth or PostgREST change was
made; no commit, push or deploy was performed.

To apply later (project owner, with Supabase CLI credentials and explicit
authorisation):

```bash
supabase link --project-ref <ref>
supabase db push
supabase gen types typescript --linked > src/lib/database.types.ts
```

After applying, verify with real identities: provider application → admin
approval → immediate publish; pending/rejected/suspended denial; suspension
hiding existing listings; reinstatement not restoring hidden/archived rows;
Storage upload/read/delete through the HTTP layer; and PostgREST representation
inserts. Then regenerate types and replace the hand-derived file.

## Database types

`src/lib/database.types.ts` describes the corrected schema, enums, helper
functions, admin RPCs and relationships. **It is derived from the migration
files, not generated from the live database.** The file documents which fields
are absent from column grants; do not use `select("*")` on `providers`,
`provider_reviews`, `admin_users`, `listing_administration`,
`listing_moderation_events` or `listing_content_events` from the client. Use the
administrator RPCs for actor/review/audit fields.

## Verification performed

`bun run test:db` applies the real migration SQL to an in-process PostgreSQL
(PGlite 0.5.11) with Supabase stand-ins (`anon`/`authenticated` roles,
`auth.uid()` from JWT claims, `storage.buckets`/`storage.objects`). It runs 55
checks as public, student, approved, pending, rejected and suspended providers,
and administrators.

| Area | Proved locally |
| --- | --- |
| Immediate publication | an approved provider inserts a published listing and it is public at once; a draft stays private until published; content edits need no approval |
| Provider gating | pending, rejected and suspended providers cannot publish; suspended providers cannot edit/delete listings or add image rows/objects; they retain read access to their own records and image objects |
| Public visibility | only published + approved-provider + visible listings; drafts, hidden, archived and suspended-provider listings absent; flags and correction requests do not hide |
| Moderation | administrators inspect all listings/private records, flag and request corrections, hide/archive, and use the reviewed restoration path; a reason is required; non-admins and missing listings are rejected with authorisation/constraint errors |
| Holds and restoration | hide/archive removes a listing and its image rows/objects from public access; provider correction edits remain hidden and are audited; listing, address, image-row and Storage-object changes each invalidate a prior review; stale restoration returns SQLSTATE 40001 and leaves the hold; a second restoration is rejected and cannot duplicate the approval; exact-revision restoration records the administrator, reason, review decision and revision and makes an eligible published/approved listing public again |
| Restoration edge cases | a failed restore leaves the listing hidden; an archived listing stays archived and private after its hold is cleared; a provider cannot republish an archived listing directly or through draft; a suspended provider's listing stays private after hold clearance and becomes public only after reinstatement; a provider cannot clear a hold or call the review/restore RPCs |
| History | providers can read own moderation/publication history without administrator UUIDs or review metadata but cannot insert/update/delete it; initial publication is recorded; material content edits are audited; published/reviewed listings cannot be deleted; an untouched never-published draft can be deleted; a draft with content, moderation or publication audit rows cannot be deleted and its events survive |
| Address and image audit | private address changes and image-row/Storage-object additions, replacements and removals create marker events and bump the review revision; address markers contain no address values; provider write/delete attempts on audit records are denied; privileged cascade deletion does not raise a false missing-listing error |
| Suspension | suspension removes existing listings from public Explore without changing them; reinstatement restores only still-published and visible rows; independent hiding survives reinstatement; administrative archive cannot be bypassed by republishing |
| Admin security | no client path to `admin_users`; students cannot self-approve a provider or review; administrators cannot forge a reviewer or review their own provider record; a provider cannot update its own status; applicant identity and full actor audit are admin-only RPCs |
| Storage | bucket private with image limits; public reads only for public listings; provider reads own draft/hidden objects; approved-provider writes only; pending/rejected/suspended/student/cross-provider/traversal writes denied; broad permissive policies cannot widen listing-image access; unrelated buckets remain usable; admins read/delete |
| Constraints | exact `numeric` rent; negative rent, non-NGN currency and incomplete publishing rejected; one cover and one image per position; provider with listings cannot be deleted; untouched draft delete cascades its administration row, while audited drafts are retained |

All expected denials assert the PostgreSQL SQLSTATE (`42501` for
authorisation/permission, `23514`/`23503` where a constraint or missing row is the
specific reason, and `40001` for a stale restoration review), so an unrelated
error cannot be mistaken for a successful access-control test.

### Local harness limitation

PGlite 0.5.11 mis-evaluates `INSERT … RETURNING` when RLS policies need to read
the newly inserted row through a `SECURITY DEFINER` ownership helper. The
harness therefore inserts without `RETURNING` and reads the row back with a
normal `SELECT` in the same transaction. This is a harness workaround, not a
change to the migration. **The live PostgREST/PostgreSQL
`return=representation` path has not been verified** and must be exercised after
the migrations are applied. The product policies themselves did not need a
workaround.

The harness is local PostgreSQL, not live Supabase. It does not prove Auth JWT
issuance, PostgREST embedding/representation, the Storage HTTP layer, signed
URLs, the deployed database state, or true multi-connection lock contention. The
hold tests prove stale-revision rejection after sequential listing, address,
image-row and Storage-object edits, plus rejection of a repeated restoration.
Restoration uses explicit `FOR UPDATE` locks on the listing, administration and
provider rows in that order; a real two-connection race still needs staging
verification.

A Storage upload may write object bytes before it updates the `storage.objects`
metadata row. Database triggers can serialize the metadata transaction, but they
cannot prove that the bytes were written after the listing lock was taken. If
Supabase Storage updates metadata after publishing new bytes, a reviewed
restoration could expose replacement bytes that were not part of the reviewed
revision. This must be tested against the live Storage HTTP path; a fully
byte-level guarantee would require an upload workflow that reserves the listing
lock before writing to the object store.

Project checks run for this correction:

| Command | Result |
| --- | --- |
| `bun run test:db` | 55 checks passed, 0 failed |
| `bun run typecheck` | exit 0 |
| `bun run test` | 54 tests passed |
| `bun run build` | exit 0 |

## Staging gate

Local verification is complete, but this is **not live Supabase verification**.
The following must pass before calling the work staging-ready:

1. Run the Storage/policy and name-collision preflight above and record the
   results. A live permissive `storage.objects` policy must be identified, not
   assumed absent.
2. Apply the three migrations in order with explicit owner authorisation. Do not
   hand-edit migration history; do not apply them from this workspace.
3. Regenerate `src/lib/database.types.ts` from the linked project and run the
   project checks again against the generated types.
4. Provision at least one `admin_users` row through the trusted service/SQL
   path. No administrator exists until that step.
5. Exercise the live HTTP layer: provider application → administrator approval →
   immediate publication; pending/rejected/suspended denials; hide/archive and
   revision-checked restoration; suspension removing public listings; Storage
   upload/read/delete and signed/private URL behaviour; PostgREST representation
   inserts. The PGlite harness does not prove Auth JWT issuance, PostgREST
   embedding or Storage HTTP policy enforcement.
6. Exercise the hold lifecycle live: hide/archive, public Explore and Storage
   denial, provider correction edits (including an image replacement through the
   Storage HTTP API), `admin_listing_review_state()`, stale-revision rejection,
   successful restoration, archived restoration remaining archived, and a
   suspended provider's listing remaining private until reinstatement.
7. Run real two-connection concurrency tests: hold a restoration transaction
   open and issue a listing edit, address write, image-row write and Storage
   metadata write from other connections. Confirm each write waits or commits
   before the revision comparison, and that no unreviewed version becomes public.
   Also race two restoration calls and confirm exactly one succeeds and one is
   rejected. PGlite is single-connection, so the local suite proves stale-revision
   rejection and repeated-attempt rejection, not inter-transaction scheduling.
8. Verify the Storage byte-level ordering. Replace bytes at an existing object
   path while a hold is active and while a restoration is in flight. Confirm the
   `storage.objects` metadata update fires the BEFORE lock and AFTER audit
   triggers before the new bytes can be read through the Storage HTTP path. If
   Supabase Storage writes bytes before metadata, the database trigger cannot
   provide a byte-level review guarantee; an upload workflow that reserves the
   listing lock before writing bytes would be required.
9. Decide the unarchive policy before exposing provider controls. Archived
   listings are terminal for ordinary clients and there is no unarchive RPC yet;
   an authorised administrator workflow must be designed before providers can
   return an archived property to draft/published.

## Remaining dependencies

1. **Administrator provisioning is not automated.** `admin_users` has no client
   access; the owner must seed the first administrator through the service
   role/SQL editor. No insecure shortcut exists.
2. **Provider onboarding UI is not built.** The database accepts a pending
   application, but no application form, document upload or admin review screen
   exists. `admin_provider_application()` gives administrators the owner UUID and
   profile display name; applicant evidence/contact details and richer
   application fields belong to the onboarding phase. Auth email is not exposed
   by that RPC.
3. **No admin dashboard.** All capabilities are enforced in the database; the UI
   is later work.
4. **No publishing UI, property detail pages, saved properties, viewing
   requests, messaging or payments.**
5. **No unarchive workflow.** Archived listings are terminal for ordinary
   clients; a future authorised administrator action is required to return one
   to draft/published. Provider self-archiving has the same limitation.
6. **Migrations are unapplied and types are hand-derived.** Apply, verify and
   regenerate before relying on the schema in production.
7. **No cover-photo requirement.** Ordering and a single cover are enforced, but
   publishing does not require a cover image; that needs a trigger or publishing
   rule.
8. **Audit markers for address and images are intentionally sparse.** The
   `address`, `images` and `image_storage` markers prove that a material change
   occurred and invalidate review, but they do not copy private addresses or
   duplicate image rows. An administrator must inspect the current address,
   images and Storage objects; the admin review UI is not built.
9. **No notification delivery.** `provider_note` and moderation history are
   stored; email/in-app notification is later work.
10. **Account deletion needs listing handling.** `listings.provider_id` is
   `ON DELETE RESTRICT`, so the owner must archive/reassign listings before the
   provider row can be removed.
11. **Agent delegation is not modelled.** One account owns one provider record.
12. **Storage cleanup is manual.** Deleting rows does not delete objects;
    orphans are non-public and can be removed by an administrator/service job.
13. **The Storage-object lock and audit triggers are live-unverified.** The
    migration and PGlite harness create and exercise them, but Supabase Storage's
    exact update path, trigger permissions, and byte-versus-metadata ordering have
    not been tested against the live project. Verify after applying; if Storage
    cannot use the triggers, or writes bytes before the metadata row changes, the
    hold review revision does not fully cover in-place byte replacements.

## Files added or changed for this correction

Added (untracked):

- `supabase/migrations/20261022153000_create_provider_authorisation.sql`
- `supabase/migrations/20261022153200_create_listing_foundation.sql`
- `supabase/migrations/20261022153400_create_listing_image_storage.sql`
- `scripts/verify-listings-rls.mjs`
- `docs/phase-2b-listings-foundation.md`

Changed:

- `src/lib/database.types.ts` — corrected tables, enums, functions and write aliases
- `src/components/ui/property-card.tsx` — “Approved provider” wording, not verification
- `src/components/ui/property-card.test.tsx` — matching assertion
- `package.json` / `bun.lock` — `test:db` and `@electric-sql/pglite`
- `README.md` — corrected Phase 2B summary and test count

Nothing was applied, deployed, committed or pushed.
