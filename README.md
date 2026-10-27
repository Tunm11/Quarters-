# QUARTERS 2.0

A mobile-first student accommodation and roommate discovery platform, initially
focused on Nigeria.

## Project principles

- Build a mobile-first, accessible interface.
- Use Supabase for authentication, database, storage, and backend functionality.
- Keep application code, schema, and access rules version-controlled.
- Enforce authorization and data access rules on the server.
- Clearly distinguish sample data from real listings and user activity.
- Never report a successful operation unless it actually succeeds.

## Status

**Stage 1 — Authentication and profile foundation (current).**

Working in this repository:

- Email/password sign-up, sign-in, and sign-out through real Supabase Auth.
- Persistent sessions, restored by Supabase on load.
- A built-out protected `/account` profile: identity summary, provider status,
  shortcuts, and display-name editing.
- A protected `/settings` page with account and provider summaries, email
  change, profile photo upload, account deletion, device notification
  preferences, a real reduce-motion switch, password change, device and session
  management (end one device, sign out others, sign out everywhere), privacy
  notes, and About links.
- A typed Supabase client with explicit missing-configuration handling.
- An applied `public.profiles` table with RLS and least-privilege grants.
- Landing, Explore shell, How-it-works page, 404, design tokens, and UI
  primitives from Stage 0.

**Not available yet:** payments and in-app moderation screens. Roommate
discovery, listing browsing, visits and messaging are implemented against
Supabase. No mock API, mock auth, or fallback backend exists. Email change,
profile photos and account deletion are implemented against real Supabase Auth,
Storage and Postgres — see [`docs/account-settings.md`](docs/account-settings.md).

**Phase 2B — listings foundation (version-controlled, not applied live).**
The accommodation schema, provider-approval model, RLS policies, grants,
post-publication moderation, content-edit history, revision-checked
administrative holds/restoration with lock-ordered address/image/Storage
content triggers, actor-safe administrative RPCs, and the private
`listing-images` bucket with restrictive guards against broad existing Storage
policies are defined in three migrations. They are applied to the Supabase
project; Explore and Home read the published catalogue through RLS. No listing
creation, moderation or admin UI exists yet. Approved providers publish
immediately; a provider is approved only by an administrator recorded in
`admin_users` (a trusted provisioning step), and administrators moderate listings
after publication. A held listing cannot become public again without an
explicit, revision-matched administrator restoration. See
[`docs/phase-2b-listings-foundation.md`](docs/phase-2b-listings-foundation.md).

The profiles migration has been applied to the Supabase project. `/account`
reads and writes only the signed-in user's row; if the table or an RLS policy is
missing, it shows an explicit profile error instead of pretending the profile
loaded.

**Saved-room alerts (version-controlled, not applied live).**
`20261025390000_add_saved_room_alert_kinds.sql` and
`20261025391000_add_saved_room_alerts.sql` add triggers on `public.listings`: a
change to rent, billing period or availability on a public room writes an
activity row for every account that saved it, which the existing push trigger
then delivers. The Settings switch for these alerts is stored on
`profiles.saved_room_alerts` (default on) because a database trigger cannot read
a device preference. Until those two migrations are applied to the project, the
switch is present but no alerts are written.

**Account settings (version-controlled, not applied live).**
`20261025400000_add_account_avatars_and_deletion.sql` adds a private `avatars`
bucket (owner-only writes, signed reads), a trigger that keeps
`profiles.avatar_url` inside the caller's own folder, and
`delete_own_account(p_confirm)`, the SECURITY DEFINER RPC the Settings screen
calls. Email change needs no migration: it uses Supabase Auth's confirmation
flow. Until the migration is applied, uploads and deletion report that the
account migration is missing instead of claiming success. Apply it with:

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025400000_add_account_avatars_and_deletion.sql
```

See [`docs/account-settings.md`](docs/account-settings.md) for the flow, the
refusal rules and the remaining limits.

**Devices and sessions (version-controlled, not applied live).**
`20261025420000_add_session_management.sql` adds `list_own_sessions()` and
`revoke_own_session(uuid)`, two SECURITY DEFINER RPCs that expose only the
caller's own rows in Supabase's `auth.sessions` table. Settings → **Devices &
sessions** lists each signed-in device (browser and platform summarised from the
stored user agent, last refresh, IP, first sign-in), flags this browser, ends a
single session, and can sign out every other device (Supabase
`signOut({ scope: 'others' })`) or every device including this one. Until the
migration is applied, the section reports that session management is missing
instead of showing a device list. Apply it with:

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025420000_add_session_management.sql
```

See [`docs/session-management.md`](docs/session-management.md) for the rules and
limits.

**Roommate safety and verification re-review (applied).**
`20261025440000_add_roommate_safety_and_appeals.sql` adds pairwise blocking,
moderator reports, and verification re-review requests. A block hides both
profiles from discovery, withdraws interests and refuses new messages; it can be
undone from Settings → **Blocked roommates**. Reports and blocks are reachable
from a roommate profile, from a one-to-one chat's options menu, and from the
member list in a group chat. A suspended or blocked
verification now shows the moderator's reason and any automated flags on the
verification screen, and offers a re-review request. Suspended students can also
correct their answers before asking again; blocked accounts cannot edit answers
but can still appeal. `20261025441000_fix_blocked_interest_withdrawal.sql`
corrects the interest guard so a block can withdraw existing interests.
`20261025450000_add_safety_notification_kinds.sql` and
`20261025451000_add_safety_notifications.sql` give these flows real activity
rows: a saved block confirms to the blocker, a resolved or dismissed report
reaches its reporter, and an approved or declined re-review reaches the student.
Those rows go through `notify_user()`, so the existing `notifications_send_push`
trigger delivers them to every browser that turned push on — there is no mock
preview in the app any more. All four migrations are applied to the project.
Apply them with:

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025440000_add_roommate_safety_and_appeals.sql \
  supabase/migrations/20261025441000_fix_blocked_interest_withdrawal.sql \
  supabase/migrations/20261025450000_add_safety_notification_kinds.sql \
  supabase/migrations/20261025451000_add_safety_notifications.sql
```

See [`docs/roommate-safety-and-appeals.md`](docs/roommate-safety-and-appeals.md)
for the enforcement rules and remaining limits.

**Saved searches and new-room alerts (applied live on 2026-10-27).**
Saving a search on Explore keeps the query and filter-sheet choices on the
account, each with its own "notify me when a room matches" switch. The rows live
in `public.saved_searches` as real columns (not a serialized blob) because
`20261025461000_add_saved_searches.sql` matches them in SQL: a room inserted as
published — or a draft published later — writes one activity row through
`notify_user()` for every saved search it fits, so the existing push trigger
delivers it too. Matching mirrors the Explore filter exactly (keyword, room-type
shortcut, budget band, room types, bedrooms, and every selected facility), and
the provider who publishes a room is never alerted for it. If a database runs
without the migration, the Saved tab's searches view reports that saved searches
are missing rather than pretending they were stored. Apply both with:

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025460000_add_saved_search_match_notification_kind.sql \
  supabase/migrations/20261025461000_add_saved_searches.sql
```

See [`docs/saved-searches.md`](docs/saved-searches.md) for the matching rules,
the URL round-trip and the remaining limits.

**Reviews, reports, move-in costs and availability (applied live on 2026-10-27).**
The room page now carries a star rating with written reviews, a private
report-a-listing route into administrator triage, an itemised move-in cost
breakdown, and a month availability calendar. Reviews are gated on evidence the
student produced in the app — a completed visit or a room they hold — enforced by
`listing_review_basis()` and `save_listing_review()`, and shown without the
reviewer's identity. Costs are real columns (`agency_fee_amount`,
`caution_deposit_amount`, `utilities_amount`/`utilities_period`, `available_from`)
rather than description prose, and the total is labelled "at least" whenever the
provider left a line unstated. The calendar reads `available_from`, dated
provider holds and the rooms students already hold; with no dates it draws no
grid at all. Apply the three migrations with:

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025470000_add_listing_reviews.sql \
  supabase/migrations/20261025471000_add_listing_reports.sql \
  supabase/migrations/20261025472000_add_listing_costs_and_availability.sql
```

See [`docs/listing-trust.md`](docs/listing-trust.md) for the rules, the report
reasons and what is still missing (notably a provider-facing listing editor).

**Reporting and blocking from anywhere you meet someone (applied live on
2026-10-27).** Reporting is no longer tied to navigating to a profile: a room
can be reported from the room page or straight from the conversation with the
lister, and a person can be reported or blocked from their profile, from a
one-to-one chat, or from the member list of a group chat — where a stranger is
most likely to be the problem. `20261025473000_add_group_member_safety_targets.sql`
gives the group member list the `roommate_profile_id` each member can be acted
on through (null for an agent or owner who has none), and
`20261025474000_add_my_reports.sql` adds `my_reports()`, so Settings →
**Reports you filed** shows every report you sent with its status instead of it
disappearing. Apply both with:

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025473000_add_group_member_safety_targets.sql \
  supabase/migrations/20261025474000_add_my_reports.sql
```

See [`docs/safety-reporting.md`](docs/safety-reporting.md) for what can be
reported, who can read it, and the limits that remain.

**Verified and inspected listings (applied live on 2026-10-27).** Provider
approval is no longer the only trust signal on a room. `verified_at` and
`inspected_at` on `listings` record checks a moderator made on the listing
itself — the details were verified, and/or the property was visited — and both
are null until they do. Clients can read the stamps but never write them: the
columns carry `select` grants only, so a lister cannot self-verify, and the one
write path is `admin_set_listing_verification()`, which refuses anyone without
`is_admin()`. A material edit (title, rent, period, location, room type) drops
both stamps so a stale badge cannot outlive a changed room; an inspection cannot
exist without a verification. The card shows `Inspected` / `Verified listing`
chips only when the row holds the timestamp, and the room page has a **What
QUARTERS checked** panel with the date of each check or an honest "Not checked
yet". Apply it with:

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025475000_add_listing_verification.sql
```

See [`docs/listing-trust.md`](docs/listing-trust.md#verified-and-inspected-listings)
for the grants, the trigger and the marking function.

**Offline shortlist and inbox.** The service worker used to serve only the app
shell, so losing signal meant a shell and an error on every screen. The last
good read of the shortlist and of the conversation inbox is now kept locally
(`src/offline/`, namespaced per account, 14-day expiry) and rendered read-only
when the browser reports no connection: saved rooms keep their filing and their
photographs, the inbox keeps its conversations, and both say "Offline copy, last
read …" instead of passing cached rows off as live. A live `OfflineBanner` shows
while disconnected, writes are refused with a reason rather than queued, and the
service worker now keeps a bounded cache of signed Storage photographs, because
the app cannot mint a new signed URL offline. That worker also registers against
the dev server in a media-only mode (`/sw.js?mode=dev`), so the photograph cache
runs in the preview instead of only in a build; `bun run test:offline-worker`
reads the built `dist/sw.js` and exercises it against the real build output. See
[`docs/offline.md`](docs/offline.md).

See [`docs/stage-0.md`](docs/stage-0.md) and
[`docs/stage-1.md`](docs/stage-1.md) for the scope records.

## Stack

| Concern         | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| Framework       | React 19 + Vite 8 (TypeScript, SPA)                          |
| Language        | TypeScript 7                                                 |
| Styling         | Tailwind CSS 4 (CSS-first `@theme` tokens)                   |
| Routing         | React Router 7 (`createBrowserRouter`)                       |
| Icons           | `lucide-react`                                               |
| Typography      | Poppins, self-hosted via `@fontsource/poppins` (latin)       |
| Backend         | Supabase Auth + Postgres (`@supabase/supabase-js` 2.118.0)   |
| Tests           | Vitest 5 + Testing Library + jsdom                           |
| Package manager | Bun (`bun.lock`)                                             |

## Requirements

- Node.js 22+
- Bun 1.4+ for installs and scripts
- A Supabase project with its project URL and publishable key

## Run the app

```bash
bun install
bun run dev
```

The dev server binds to `0.0.0.0` on `PORT` when provided, otherwise `5173`.
HMR is intentionally disabled for Freebuff's preview proxy.

### Scripts

| Command                  | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `bun run dev`            | Start the Vite dev server on `0.0.0.0`                     |
| `bun run build`          | Typecheck (`tsc -b`) then build static output to `dist/`   |
| `bun run preview`        | Serve the production build locally                         |
| `bun run typecheck`      | TypeScript build check only (`tsc -b --noEmit`)            |
| `bun run test`           | Run the Vitest suite once                                  |
| `bun run test:db`        | Apply the migrations to in-process PostgreSQL and test RLS |
| `bun run test:alerts`    | Apply the migrations to in-process PostgreSQL and test saved-room alerts |
| `bun run test:offline-worker` | Run the built worker against `dist/` and check the shell and photograph caches (build first) |
| `bun run check:supabase` | Non-destructive config + auth-endpoint check (no secrets)  |

### Freebuff preview

- Install: `bun install`
- Dev / preview: `bun run dev` on port `5173`
- Build: `vite build` (static output in `dist/`)

## Configuration

Two public variables are read at build time:

- `VITE_SUPABASE_URL` — the Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's publishable key.

Both are managed through the workspace environment (or a local env file that is
never committed). **Never** use a service-role key in a `VITE_`-prefixed
variable: Vite inlines those values into the browser bundle.

If either variable is missing or malformed, `src/lib/supabase.ts` exports no
client. The UI then shows a clear configuration notice naming the missing
variables; there is no mock client, demo login, or hidden fallback.

`bun run check:supabase` validates the variables and calls the project's
non-destructive auth health endpoint. It prints status only — never the URL or
key.

## Authentication

- `/auth` handles both sign-in and sign-up (`/auth?mode=signup` opens sign-up).
- `/account` is protected by `RequireAuth`, which holds a loading state until
  Supabase's initial session check settles, then either renders the page or
  redirects to `/auth?returnTo=…`. `returnTo` only accepts internal paths.
- `AuthProvider` owns a single `onAuthStateChange` subscription (cleaned up on
  unmount) and remains the single source of truth for session state.
- Sign-up handles both project configurations: if Supabase returns a session
  (confirmation disabled) the user is signed in; if not, the page explains that
  email confirmation is required and no success is claimed.
- Sign-in errors are mapped to plain messages. A success screen only appears
  after Supabase returns a session.
- Session persistence and token refresh are handled by `supabase-js`
  (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`).

### Password reset and email-code sign-in

See `docs/auth-recovery.md` for the full flow and the Supabase dashboard
settings it depends on.

- `Forgot password?` on `/auth` requests a Supabase reset email. Supabase
  answers the same way for unknown addresses, so the UI only says a message was
  requested if that address has an account.
- The reset link returns to `/reset-password`, where a recovery session can set
  a new password. If the URL is not allow-listed, Supabase falls back to the
  Site URL and `RecoveryRedirect` still routes the recovery session there.
- `Sign in with a one-time code` sends an email code with
  `signInWithOtp({ shouldCreateUser: false })` and exchanges it with
  `verifyOtp({ type: "email" })`. Sign-in never creates accounts.
- Typed codes need `{{ .Token }}` in the Supabase "Reset Password" / "Magic
  Link" email templates; the link path works with the default templates.
- These are Supabase Auth endpoints only — no table, migration, or secret was
  added for them.

### Profile bootstrap

Profile rows are created client-side after the first authenticated session
(`src/auth/profile.ts`), not by a trigger on `auth.users`. That keeps the
behaviour correct with email confirmation enabled: an unconfirmed account has no
session and therefore no profile row. Concurrent creates resolve by re-reading
the row. No `SECURITY DEFINER` function is used.

## Database migrations

Supabase migration history and prepared migrations:

| Version | Name | Repository file |
| --- | --- | --- |
| `20261022145520` | `create_profiles` | `supabase/migrations/20261022145520_create_profiles.sql` |
| `20261022150450` | `revoke_profiles_trigger_function_api_execute` | `supabase/migrations/20261022150450_revoke_profiles_trigger_function_api_execute.sql` |
| `20261022150455` | `revoke_profiles_trigger_function_api_execute` | `supabase/migrations/20261022150455_revoke_profiles_trigger_function_api_execute.sql` |
| `20261022153000` | `create_provider_authorisation` | `supabase/migrations/20261022153000_create_provider_authorisation.sql` |
| `20261022153200` | `create_listing_foundation` | `supabase/migrations/20261022153200_create_listing_foundation.sql` |
| `20261022153400` | `create_listing_image_storage` | `supabase/migrations/20261022153400_create_listing_image_storage.sql` |

The listing migrations are applied to the Supabase project. Apply future
schema changes with the Supabase CLI (or database credentials) and explicit
owner approval; see the Phase 2B document for the `db push` and
type-generation commands.

The baseline file was renamed from `20261022120000_create_profiles.sql` to
match the applied version. Renaming a file does not change database history.
The three profile versions are already applied, so they must not be re-run, and
migration history must not be edited by hand. The `...455` file reproduces the
recorded statement of the duplicate live entry; it documents existing history
and is not a new database change.

`supabase/migrations/20261022145520_create_profiles.sql` creates
`public.profiles`, enables row-level security, and defines own-row select /
insert / update policies. It also:

- Revokes the default `anon`/`authenticated` table grants and grants only
  `select`, column-level `insert (id, display_name, avatar_url)`, and
  column-level `update (display_name, avatar_url)`.
- Keeps `id`, `created_at`, and `updated_at` immutable from the client.
- Leaves no delete policy or delete grant.
- Maintains `updated_at` with a `SECURITY INVOKER` trigger function using an
  empty `search_path`, with execution revoked from `PUBLIC`, `anon`, and
  `authenticated`.

The forward privilege migration
`20261022150450_revoke_profiles_trigger_function_api_execute.sql` records the
applied correction revoking `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
`postgres` retains execution.

**The profile and listing migrations have already been applied to the remote
project.** The files remain the source of truth for reproducibility: future
schema changes must ship as new migrations. Database types are still
hand-maintained: regeneration needs the Supabase CLI or a database/management
credential, neither of which is available in this workspace.

### Mock catalogue

`supabase/seed/mock-listings.sql` is content, not schema. It creates a demo
provider (approved through a real `provider_reviews` row) and six published
rooms in Akoka, Yaba, Ikeja, Surulere and Gbagada, so Explore and Home have
real Supabase-backed cards. It is applied to the current Supabase project; on
a fresh project, run it once in the Supabase SQL editor. The demo owner account
has no password and cannot sign in.

The seed is idempotent and never overwrites existing listing content. Every row
belongs to the demo provider `d0000000-0000-4000-8000-000000000002`, which the
future admin screen can use to delete the mock set in one action. The file
documents the exact deletion order (listings, provider reviews/provider, then
the demo auth user).

Each demo listing has a cover photo in the private `listing-images` bucket at
`<provider_id>/<listing_id>/cover.jpg`, plus a matching `listing_images` row.
The photos are stock interiors used only as placeholder content for the mock
catalogue. Storage objects cannot be created from SQL, so they are uploaded
through the Storage API; `loadPublicListings` resolves them to six-hour signed
URLs and falls back to the neutral placeholder when a listing has no photo.

### Catalogue paging

Explore reads the published catalogue one page at a time
(`PUBLIC_LISTING_PAGE_SIZE`, 24 rooms per page) in a total order of publication
time then id, so the newest rooms paint first and the rest follow as the reader
reaches the end of the list. `usePublicListings` appends each page, reports
`total`/`hasMore`, and keeps the rooms already on screen if a later page fails.
The results footer says how many of the published rooms are on screen and offers
an explicit **Load more rooms** button, which is also the only path when
`IntersectionObserver` is unavailable. Search, filters and sorting still run in
the browser over the rooms loaded so far, and the footer says so while more
rooms remain.


## Project structure

```text
supabase/migrations/      Version-controlled SQL migrations
scripts/check-supabase.mjs Non-destructive config/health check
scripts/verify-listings-rls.mjs Local PostgreSQL policy verification (test:db)
scripts/verify-saved-searches.mjs Saved-search migration/trigger verification (test:searches)
src/
  auth/                   Auth provider, profile bootstrap, protected route
  components/auth/        Password field, config notice, code sign-in, reset request
  components/feedback/    Loading, empty, error states
  components/layout/      App shell, header, footer, mobile tab bar
  components/ui/          Button, icon button, input, panel, badge, skeleton
  lib/                    Supabase client/config, types, validation, helpers
  pages/                  Landing, Explore, How it works, Auth, Reset password, Account, 404
  styles/index.css        Design tokens, base styles, utilities
  test/                   Test setup
docs/                     Stage scope records
```

## Design tokens

Tokens live in `src/styles/index.css` under Tailwind's `@theme` block:

- Surfaces: `bg-canvas`, `bg-canvas-soft`, `bg-panel`, `bg-panel-raised`
- Text: `text-foreground`, `text-muted`, `text-subtle`
- Borders: `border-line`, `border-line-strong`
- Accent: `bg-accent`, `text-accent-soft`, `text-accent-ink`
- Feedback: `text-positive`, `text-caution`, `text-danger`
- Radii: `rounded-tile`, `rounded-card`, `rounded-sheet`, `rounded-pill`

## Testing

`bun run test` runs 468 focused tests covering configuration parsing and missing
keys, auth error mapping and validation, return-path sanitization, protected
route states and return-path preservation, single-subscription auth handling,
session restoration, sign-in/sign-out failure reporting, the email-confirmation
sign-up path, the forgot-password and one-time-code panels, the reset-password
page (expired link, validation, success, and Supabase failure), profile
bootstrap and duplicate handling, profile-update error handling, roommate
safety report/block validation and rejection-reason mapping, and the Explore
and PropertyCard interactions. Catalogue paging is covered at both ends: the
page query (offset, page size, total, `hasMore`, failure) and the hook that
appends pages, keeps loaded rooms when a later page fails, and restarts on
reload. Live sign-up/sign-in, real recovery
emails, and cross-account database isolation are not exercised by these tests.

`bun run test:db` applies the real migration SQL to an in-process PostgreSQL
(PGlite) with Supabase role/auth/storage stand-ins and runs 55 policy checks as
public, student, approved, pending, rejected and suspended providers, and
administrators. The checks include the administrative-hold lock ordering,
archived-listing republish denial, content-audit preservation and repeated
restoration rejection. It validates the migration design locally; it does not touch the
live project. The harness reads inserted rows back with `SELECT` because PGlite
mis-evaluates `INSERT … RETURNING` with these RLS policies; the live PostgREST
representation path still needs verification after the migrations are applied.

`bun run test:alerts` is a smaller focused harness for the saved-room alert
triggers. It applies every migration except the web-push one (PGlite does not
ship the `pg_net` extension) and checks that rent, billing-period and
availability changes notify only the accounts that saved the room, that the
`profiles.saved_room_alerts` switch suppresses them, that a room which is not
public produces nothing, and that clients still cannot insert notification rows.
`bun run test:safety` applies the same migrations and exercises the safety
notifications: a block notifies the blocker only, a queued report stays quiet
while a resolved or dismissed one notifies the reporter, and an approved or
declined re-review notifies the student. Neither harness exercises real push
delivery from a browser.

## Accessibility foundations

- Skip link, single `<main>` landmark, visible focus rings throughout.
- Labelled inputs, `aria-invalid` + announced field errors, `aria-pressed` mode
  and filter controls, `aria-current` navigation.
- Icon-only controls require an accessible name; important actions keep visible
  text labels.
- Loading (`role="status"`) and error (`role="alert"`) announcements.
- Reduced-motion preferences respected globally.
