# Stage 1 — Authentication and profile foundation

## Starting point (inspected before changes)

- Branch `main`, clean tree at `f0e2420 Build QUARTERS Stage 0 foundation`.
- React 19 + Vite 8 + TypeScript + React Router 7 + Tailwind CSS 4, Bun lockfile.
- No Supabase dependency, client, auth code, or test runner existed.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` were already present in
  the workspace environment (checked by name only; values were never read or
  printed).
- The remote project's public schema has no application tables, consistent with
  the project brief.

## Decisions

1. **One typed browser client.** `src/lib/supabase.ts` parses configuration with
   a pure function (`src/lib/supabase-config.ts`) and creates a single
   `SupabaseClient<Database>`. Missing configuration yields `null`, never a mock.
2. **Client-side profile bootstrap, no trigger.** A row is created on the first
   authenticated session. With email confirmation enabled, unconfirmed accounts
   never hold a session, so they never get a profile row. This avoids adding an
   `auth.users` trigger and any `SECURITY DEFINER` function.
3. **Own-row-only policies.** There is no public profile reading in this stage.
   Profiles are not needed for listings yet, so broadening visibility now would
   be an unjustified exposure.
4. **Column-level grants.** Only `display_name` and `avatar_url` are writable.
   `id`, `created_at`, and `updated_at` cannot be written by clients, so a user
   cannot move a row to another account or forge timestamps.
5. **No roles or verification flags.** Nothing in the schema models permission
   levels, ownership verification, or listing rights. Those are product
   decisions for later stages.
6. **Implicit-flow confirmation links.** `detectSessionInUrl` is enabled so the
   default Supabase email-confirmation redirect establishes a session. Sign-up
   passes `emailRedirectTo` as `<origin>/auth`. The project's Site URL and
   allowed redirect URLs still need to include the deployed origin (and the
   preview origin while testing).

## Migration (not applied)

File: `supabase/migrations/20261022120000_create_profiles.sql`

| Item | Decision |
| --- | --- |
| Table | `public.profiles` |
| Primary key | `id uuid references auth.users (id) on delete cascade` |
| Fields | `id`, `display_name` (nullable, 2-60 chars), `avatar_url` (nullable, ≤2048 chars), `created_at`, `updated_at` |
| RLS | Enabled; no anonymous policy |
| SELECT policy | `using ((select auth.uid()) = id)` for `authenticated` |
| INSERT policy | `with check ((select auth.uid()) = id)` for `authenticated` |
| UPDATE policy | `using` + `with check` both require `id = auth.uid()` |
| DELETE | No policy and no grant |
| Grants | `select`; `insert (id, display_name, avatar_url)`; `update (display_name, avatar_url)` to `authenticated`; `revoke all` from `anon` |
| Timestamps | `updated_at` maintained by a `SECURITY INVOKER` trigger with `search_path = ''`; execute revoked from `PUBLIC`, `anon`, and `authenticated` |

The migration has **not** been pushed or applied. No Supabase database operation
was performed in this stage.

## Authentication behaviour

- `AuthProvider` registers exactly one `onAuthStateChange` subscription and
  unsubscribes on unmount. React StrictMode's double effect leaves one active
  listener (covered by a test).
- `getSession()` seeds the state, but a guard discards its result if a newer auth
  event already arrived, preventing stale-session races.
- Protected routes render a loading state while the initial check is pending;
  they never redirect a returning user to sign-in before the check completes.
- Sign-in only reports success after `signInWithPassword` returns a session.
- Sign-up treats a missing session as "email confirmation required" and shows a
  confirmation panel. It never claims the user is signed in.
- `returnTo` is sanitized: only internal absolute paths, no protocol-relative or
  backslash tricks, and never back to `/auth`.
- Sign-out calls `supabase.auth.signOut()` and only navigates away after
  Supabase reports no error.

## Configuration behaviour

- Both variables are typed in `src/vite-env.d.ts`.
- `parseSupabaseConfig` trims values, requires an http(s) URL, and lists missing
  and invalid keys separately.
- The configuration notice and errors name variables but never echo values.
- `bun run check:supabase` prints whether variables are set, the key *type*
  (publishable / legacy anon / unrecognised), and the auth health status. It
  never prints the URL, key, or any token.

## Files created or modified

Created:

- `supabase/migrations/20261022120000_create_profiles.sql`
- `scripts/check-supabase.mjs`
- `src/vite-env.d.ts`
- `src/lib/supabase.ts`, `src/lib/supabase-config.ts`,
  `src/lib/supabase-config.test.ts`
- `src/lib/database.types.ts`
- `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`
- `src/lib/return-to.ts`, `src/lib/return-to.test.ts`
- `src/auth/auth-provider.tsx`, `src/auth/auth-provider.test.tsx`,
  `src/auth/auth-provider-unconfigured.test.tsx`
- `src/auth/profile.ts`
- `src/auth/require-auth.tsx`, `src/auth/require-auth.test.tsx`
- `src/auth/use-auth.ts`
- `src/components/auth/password-field.tsx`
- `src/components/auth/supabase-config-notice.tsx`
- `src/pages/auth.tsx`, `src/pages/auth.test.tsx`
- `src/pages/account.tsx`
- `src/test/setup.ts`
- `vitest.config.ts`
- `docs/stage-1.md`

Modified:

- `package.json` (Supabase dependency, test/check scripts)
- `bun.lock`
- `src/App.tsx` (provider, `/auth`, protected `/account`)
- `src/components/ui/input.tsx` (field errors, trailing control)
- `src/components/layout/site-header.tsx` (auth-aware controls)
- `src/components/layout/site-footer.tsx` (Stage 1 status)
- `src/lib/navigation.ts` (Account destination)
- `src/pages/landing.tsx`, `src/pages/how-it-works.tsx` (Stage 1 copy)
- `README.md`

## Verification performed

| Command | Result |
| --- | --- |
| `bun tsc -b --noEmit` | Exit 0 |
| `bun run test` | 7 files, 29 tests passed |
| `bun run build` | Exit 0; static output in `dist/` |
| `bun run check:supabase` | Both variables set (publishable key); auth health HTTP 200 |
| HTTP `GET /`, `/auth`, `/auth?mode=signup`, `/account`, `/explore`, and the auth/account/client modules on the dev server | All 200 |
| `freebuff-preview restart` | Preview ready and listening on 5173 |

## Live Supabase operations actually performed

- `GET {project}/auth/v1/health` with the publishable key: **HTTP 200**.
- Nothing else. No sign-up, sign-in, profile query, table creation, migration, or
  other database write/read was performed against the real project.

## Remaining limitations and next steps

1. **Apply the migration after review.** Until then `/account` shows a clear
   "profile table is not available" error. No profile data is written.
2. **Configure redirect URLs** in Supabase Auth (Site URL plus the app origin and
   preview origin) so confirmation links return to the app.
3. **Regenerate database types** after applying the migration and replace the
   hand-maintained `src/lib/database.types.ts`.
4. **Live auth verification** with a real email address is still pending; that
   requires a test account and, if enabled, an inbox for the confirmation link.
5. **Not built in this stage:** password reset, email change, avatar uploads,
   onboarding fields (campus, budget, preferences), account deletion, and any
   listing/roommate schema. Those need product decisions, not scaffolding.
6. **No deploy, no commit, no migration application** was performed as part of
   this stage.
