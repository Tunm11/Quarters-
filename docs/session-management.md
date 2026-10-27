# Devices and sessions

Settings → **Devices & sessions** manages the sessions a signed-in account has
open. Everything here reads and writes real Supabase Auth state; nothing is
mocked.

Migration: `supabase/migrations/20261025420000_add_session_management.sql`.

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025420000_add_session_management.sql
```

If the direct host is unreachable (it resolves to IPv6 only, which some
environments do not have), go through the pooler for the project's region:

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025420000_add_session_management.sql
```

Applied to the live project on 2026-10-26. Until it is applied, the section shows "Session management is not enabled on
this database yet. The session migration has not been applied." — it never
invents a device list. The two sign-out scopes that Supabase Auth implements
natively (`local`, `global`, `others`) work without the migration.

## Where the data comes from

Supabase Auth keeps one row per sign-in in `auth.sessions`, and every access
token carries a `session_id` claim matching that row's id. A client session
cannot read that schema, so the migration adds two SECURITY DEFINER functions:

| Function | Returns |
| -------- | ------- |
| `list_own_sessions()` | the caller's sessions: id, first sign-in, last refresh, user agent, IP, and whether it is the calling session |
| `revoke_own_session(p_session_id)` | nothing; deletes one row from `auth.sessions` |

Both are bound to `auth.uid()` in their `WHERE` clause and granted to
`authenticated` only, so one account can neither read nor end another account's
sessions. `anon` keeps no `EXECUTE` grant.

`scripts/verify-session-management.mjs` applies the migration to an in-process
Postgres (PGlite) with Supabase stand-ins and exercises those rules from four
callers: signed in on two devices, signed in without a session claim, signed in
on another account, and unauthenticated.

```sh
bun run test:sessions
```

## What each control does

- **Device list** — newest activity first. The browser and platform come from
  the stored user agent, summarised into "Chrome on Android", "Safari on iPhone",
  "Edge on Windows", and "Unrecognised device" when the string identifies
  nothing. The current session is badged **This device** and has no sign-out
  button.
- **Sign out (one device)** — calls `revoke_own_session`. The row leaves the
  list immediately and that device's refresh token stops working, so its next
  refresh fails and it must sign in again.
- **Sign out of other devices** — Supabase Auth `signOut({ scope: 'others' })`,
  confirmed first; the list is re-read afterwards.
- **Sign out of all devices** — Supabase Auth `signOut({ scope: 'global' })`,
  confirmed first; this browser is signed out too and the app returns to the
  public home screen.
- **Sign out of this device** stays under Security: `signOut({ scope: 'local' })`.

## Limits, stated plainly

- Revoking a session deletes its refresh token, not an access token already
  issued to that device. That token keeps working until it expires — at most the
  project's JWT expiry (one hour by default). Shortening the access-token
  lifetime in the Supabase Auth settings shortens that window.
- "Last active" comes from `auth.sessions.refreshed_at`, which only moves when a
  token is refreshed, so it is accurate to roughly the access-token lifetime and
  not to the last click. A session that never refreshed falls back to its
  sign-in/`updated_at` time.
- The device label is a best-effort reading of the user agent. It is a
  convenience, not proof of which physical device a session belongs to; the IP
  address is shown for the same reason.
- There is no push or email notice when a session is ended, and no admin view of
  another student's sessions. Those need a later, server-side phase.
