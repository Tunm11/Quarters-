/**
 * Verification for session and device management.
 *
 * Applies the real session migration to an in-process PostgreSQL (PGlite) with
 * minimal Supabase Auth stand-ins (`auth.sessions`, `auth.uid()`, `auth.jwt()`),
 * then exercises the two RPCs exactly as callers would: signed in on two
 * devices, signed in with no session claim, signed in on another account, and
 * unauthenticated. Nothing here touches the live project, so revoking sessions
 * can be tested at all.
 *
 * Usage: bun run test:sessions
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261025420000_add_session_management.sql",
);

const U_STUDENT = "00000000-0000-4000-8000-000000000031";
const U_OTHER = "00000000-0000-4000-8000-000000000032";

const S_PHONE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000031";
const S_LAPTOP = "aaaaaaaa-aaaa-4aaa-8aaa-000000000032";
const S_THEIR = "aaaaaaaa-aaaa-4aaa-8aaa-000000000033";

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;

  -- The columns the functions read, mirroring Supabase's auth.sessions.
  create table auth.sessions (
    id uuid primary key,
    user_id uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    factor_id uuid,
    aal text,
    not_after timestamptz,
    refreshed_at timestamp,
    user_agent text,
    ip inet,
    tag text
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $fn$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $fn$;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  as $fn$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $fn$;

  grant usage on schema auth to anon, authenticated;
`;

const SEED = `
  insert into auth.sessions
    (id, user_id, created_at, updated_at, refreshed_at, user_agent, ip)
  values
    ('${S_PHONE}', '${U_STUDENT}', '2026-10-20T08:00:00Z', '2026-10-26T09:00:00Z',
     '2026-10-26 08:00:00', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
     '102.89.10.4'),
    ('${S_LAPTOP}', '${U_STUDENT}', '2026-10-24T18:00:00Z', '2026-10-25T20:00:00Z',
     null, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
     '102.89.10.9'),
    ('${S_THEIR}', '${U_OTHER}', '2026-10-25T18:00:00Z', '2026-10-25T20:00:00Z',
     '2026-10-25 19:00:00', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)',
     '197.210.0.7');
`;

const db = new PGlite();

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    const detail =
      error && typeof error === "object"
        ? [error.message, error.code && `SQLSTATE ${error.code}`, error.detail]
            .filter(Boolean)
            .join(" | ")
        : String(error);
    failures.push(`${name}: ${detail}`);
    console.log(`FAIL ${name}: ${detail}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Runs fn with a Postgres role and JWT claims, in its own transaction. */
async function asRole(role, claims, fn) {
  let result;
  await db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    result = await fn(tx);
  });
  return result;
}

const asStudent = (session, fn) =>
  asRole("authenticated", { sub: U_STUDENT, role: "authenticated", session_id: session }, fn);

async function expectError(run, expectedCode, label) {
  try {
    await run();
  } catch (error) {
    if (error?.code === expectedCode) return;
    throw new Error(
      `${label}: expected SQLSTATE ${expectedCode}, received ${error?.code ?? "none"} (${error?.message})`,
    );
  }
  throw new Error(`${label}: expected SQLSTATE ${expectedCode}, but the call succeeded`);
}

async function sessionIds() {
  const { rows } = await db.query("select id from auth.sessions order by id");
  return rows.map((row) => row.id);
}

await db.exec(BOOTSTRAP);
await db.exec(readFileSync(MIGRATION, "utf8"));
await db.exec(SEED);

await test("lists only the caller's own sessions", async () => {
  const { rows } = await asStudent(S_PHONE, (tx) =>
    tx.query("select id from public.list_own_sessions() order by id"),
  );
  assert(
    rows.map((row) => row.id).join(",") === `${S_PHONE},${S_LAPTOP}`,
    `unexpected session set: ${rows.map((row) => row.id).join(",")}`,
  );
});

await test("newest activity comes first", async () => {
  const { rows } = await asStudent(S_PHONE, (tx) =>
    tx.query("select id, is_current from public.list_own_sessions()"),
  );
  assert(rows[0].id === S_PHONE, "the most recently refreshed session should lead the list");
  assert(rows[1].id === S_LAPTOP, "the older session should follow");
});

await test("flags the calling session and only the calling session", async () => {
  const { rows } = await asStudent(S_LAPTOP, (tx) =>
    tx.query("select id, is_current from public.list_own_sessions() order by id"),
  );
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.is_current]));
  assert(byId[S_LAPTOP] === true, "the calling session must be marked current");
  assert(byId[S_PHONE] === false, "the other session must not be marked current");
});

await test("marks nothing current when the token carries no session claim", async () => {
  const { rows } = await asRole(
    "authenticated",
    { sub: U_STUDENT, role: "authenticated" },
    (tx) => tx.query("select is_current from public.list_own_sessions()"),
  );
  assert(rows.length === 2, "both sessions should still be listed");
  assert(
    rows.every((row) => row.is_current === false),
    "without a session claim no row can be the current one",
  );
});

await test("falls back to updated_at when a session never refreshed", async () => {
  const { rows } = await asStudent(S_PHONE, (tx) =>
    tx.query(
      "select last_active_at from public.list_own_sessions() where id = $1",
      [S_LAPTOP],
    ),
  );
  assert(
    new Date(rows[0].last_active_at).toISOString() === "2026-10-25T20:00:00.000Z",
    `unexpected last_active_at: ${rows[0].last_active_at}`,
  );
});

await test("returns device details without the network mask", async () => {
  const { rows } = await asStudent(S_PHONE, (tx) =>
    tx.query("select user_agent, ip from public.list_own_sessions() where id = $1", [
      S_PHONE,
    ]),
  );
  assert(rows[0].ip === "102.89.10.4", `unexpected ip: ${rows[0].ip}`);
  assert(/Android/.test(rows[0].user_agent), "the stored user agent should reach the caller");
});

await test("revokes one of the caller's sessions", async () => {
  await asStudent(S_PHONE, (tx) =>
    tx.query("select public.revoke_own_session($1)", [S_LAPTOP]),
  );

  const ids = await sessionIds();
  assert(!ids.includes(S_LAPTOP), "the revoked session should be gone");
  assert(ids.includes(S_PHONE), "the calling session must survive");
  assert(ids.includes(S_THEIR), "another account's session must survive");
});

await test("refuses to revoke another account's session", async () => {
  await expectError(
    () => asStudent(S_PHONE, (tx) => tx.query("select public.revoke_own_session($1)", [S_THEIR])),
    "P0001",
    "foreign session",
  );

  const ids = await sessionIds();
  assert(ids.includes(S_THEIR), "the foreign session must still exist");
});

await test("says a session is already gone instead of pretending", async () => {
  await expectError(
    () => asStudent(S_PHONE, (tx) => tx.query("select public.revoke_own_session($1)", [S_LAPTOP])),
    "P0001",
    "already revoked session",
  );
});

await test("requires a signed-in caller", async () => {
  await expectError(
    () => asRole("authenticated", { role: "authenticated" }, (tx) =>
      tx.query("select public.revoke_own_session($1)", [S_PHONE]),
    ),
    "42501",
    "no subject",
  );

  const ids = await sessionIds();
  assert(ids.includes(S_PHONE), "an anonymous call must not end a session");
});

await test("gives anon no access to the session list", async () => {
  await expectError(
    () => asRole("anon", {}, (tx) => tx.query("select * from public.list_own_sessions()")),
    "42501",
    "anon list",
  );
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
