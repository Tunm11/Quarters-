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
- A protected `/account` route that waits for the initial session check.
- A typed Supabase client with explicit missing-configuration handling.
- An applied `public.profiles` table with RLS and least-privilege grants.
- Landing, Explore shell, How-it-works page, 404, design tokens, and UI
  primitives from Stage 0.

**Not available yet:** live listings, roommate matching, viewing requests,
messaging, payments, avatars/uploads, email changes, and account deletion.
No mock API, mock auth, or fallback backend exists.

The profiles migration has been applied to the Supabase project. `/account`
reads and writes only the signed-in user's row; if the table or an RLS policy is
missing, it shows an explicit profile error instead of pretending the profile
loaded.

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

### Profile bootstrap

Profile rows are created client-side after the first authenticated session
(`src/auth/profile.ts`), not by a trigger on `auth.users`. That keeps the
behaviour correct with email confirmation enabled: an unconfirmed account has no
session and therefore no profile row. Concurrent creates resolve by re-reading
the row. No `SECURITY DEFINER` function is used.

## Database migration

`supabase/migrations/20261022120000_create_profiles.sql` creates
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

**This migration has been applied to the remote project.** The file remains the
source of truth: future schema changes must ship as new migrations. Database
types are still hand-maintained until they are regenerated from the remote
schema.

## Project structure

```text
supabase/migrations/      Version-controlled SQL migrations
scripts/check-supabase.mjs Non-destructive config/health check
src/
  auth/                   Auth provider, profile bootstrap, protected route
  components/auth/        Password field, config notice
  components/feedback/    Loading, empty, error states
  components/layout/      App shell, header, footer, mobile tab bar
  components/ui/          Button, icon button, input, panel, badge, skeleton
  lib/                    Supabase client/config, types, validation, helpers
  pages/                  Landing, Explore, How it works, Auth, Account, 404
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

`bun run test` runs 29 focused tests covering configuration parsing and missing
keys, auth error mapping and validation, return-path sanitization, protected
route states, single-subscription auth handling, sign-in failure reporting, and
the email-confirmation sign-up path. Live sign-up/sign-in against the real
Supabase project is not exercised by these tests.

## Accessibility foundations

- Skip link, single `<main>` landmark, visible focus rings throughout.
- Labelled inputs, `aria-invalid` + announced field errors, `aria-pressed` mode
  and filter controls, `aria-current` navigation.
- Icon-only controls require an accessible name; important actions keep visible
  text labels.
- Loading (`role="status"`) and error (`role="alert"`) announcements.
- Reduced-motion preferences respected globally.
