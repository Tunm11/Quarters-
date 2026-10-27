/**
 * Local verification for the safety notifications.
 *
 * Applies the real migration files to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, then walks the three flows that used to be silent:
 * saving a block, a moderator deciding a report, and a moderator deciding a
 * verification re-review. It asserts exactly which activity rows land in
 * `notifications`.
 *
 * As with `test:alerts`, the web-push migration is skipped because it creates
 * the `pg_net` extension, which PGlite does not ship. The trigger that forwards
 * a row to the Edge Function is unchanged; these checks are about the rows being
 * written in the first place. This is NOT a live Supabase test, and it does not
 * exercise actual push delivery.
 *
 * Usage: bun run test:safety
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SKIP_MIGRATIONS = new Set(["20261025330000_add_web_push.sql"]);

const U_BLOCKER = "00000000-0000-4000-8000-000000000021";
const U_BLOCKED = "00000000-0000-4000-8000-000000000022";
const U_REPORTER = "00000000-0000-4000-8000-000000000023";
const U_REPORTED = "00000000-0000-4000-8000-000000000024";
const U_APPEAL = "00000000-0000-4000-8000-000000000025";
const U_ADMIN = "00000000-0000-4000-8000-000000000026";

const P_BLOCKED = "11111111-1111-4111-8111-000000000021";
const P_REPORTED = "11111111-1111-4111-8111-000000000022";

const V_APPEAL = "22222222-2222-4222-8222-000000000021";

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;

  create table auth.users (
    instance_id uuid,
    id uuid primary key,
    aud text,
    role text,
    email text unique not null,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    confirmation_token text,
    recovery_token text,
    email_change_token_new text,
    email_change text
  );

  -- Read by the session-management migration, which this harness also applies.
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

  create schema storage;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );

  alter table storage.objects enable row level security;

  create function storage.foldername(name text)
  returns text[]
  language sql
  immutable
  as $fn$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $fn$;

  grant usage on schema auth to anon, authenticated;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
`;

const SEED = `
  insert into auth.users (id, email) values
    ('${U_BLOCKER}', 'blocker@example.test'),
    ('${U_BLOCKED}', 'blocked@example.test'),
    ('${U_REPORTER}', 'reporter@example.test'),
    ('${U_REPORTED}', 'reported@example.test'),
    ('${U_APPEAL}', 'appeal@example.test'),
    ('${U_ADMIN}', 'admin@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_BLOCKER}', 'Blocking Student'),
    ('${U_BLOCKED}', 'Ada Blocked'),
    ('${U_REPORTER}', 'Reporting Student'),
    ('${U_REPORTED}', 'Reported Student'),
    ('${U_APPEAL}', 'Appealing Student');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Safety notification verification');

  insert into public.roommate_profiles (id, user_id, display_name, city) values
    ('${P_BLOCKED}', '${U_BLOCKED}', 'Ada Blocked', 'Lagos'),
    ('${P_REPORTED}', '${U_REPORTED}', 'Reported Student', 'Lagos');

  insert into public.roommate_verifications
    (id, user_id, full_name, phone, institution, study_level, city,
     tidy_score, sleep_score, social_score, guest_score, routine_score,
     status, suspension_reason)
  values
    ('${V_APPEAL}', '${U_APPEAL}', 'Appealing Student', '+2348011111111',
     'University of Lagos', '300', 'Lagos', 4.00, 4.00, 3.00, 3.00, 4.00,
     'suspended', 'Phone number could not be confirmed.');
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

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message ?? "values differ"}: expected ${e}, received ${a}`);
  }
}

async function asRole(role, subject, fn) {
  let result;
  await db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: subject, role }),
    ]);
    result = await fn(tx);
  });
  return result;
}

async function activity(tx = db) {
  const { rows } = await tx.query(
    `select user_id, kind::text as kind, title, body, href, read_at
     from public.notifications
     order by created_at, kind`,
  );
  return rows;
}

// Each check starts from an empty feed, queue and appeal list so a row left over
// from the previous check cannot trip the one-open-report / one-pending-appeal
// unique indexes.
async function reset() {
  await db.exec(
    `delete from public.notifications;
     delete from public.roommate_reports;
     delete from public.roommate_verification_appeals;`,
  );
}

async function boot() {
  await db.exec(BOOTSTRAP);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && !SKIP_MIGRATIONS.has(file))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${error.message}`);
    }
  }

  await db.exec(SEED);
}

async function newReport() {
  const { rows } = await db.query(
    `insert into public.roommate_reports
       (reporter_id, reported_profile_id, reason, details)
     values ($1, $2, 'harassment', 'Repeated unwanted messages after I asked them to stop.')
     returning id`,
    [U_REPORTER, P_REPORTED],
  );
  return rows[0].id;
}

async function newAppeal() {
  const { rows } = await db.query(
    `insert into public.roommate_verification_appeals
       (user_id, verification_id, reason, message)
     values ($1, $2, 'corrected', 'I updated my phone number and can confirm it on a call today.')
     returning id`,
    [U_APPEAL, V_APPEAL],
  );
  return rows[0].id;
}

await boot();

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

await test("blocking a roommate confirms it to the blocker and nobody else", async () => {
  await reset();

  await db.query(
    `insert into public.roommate_blocks
       (blocker_id, blocked_profile_id, blocked_display_name)
     values ($1, $2, 'Ada Blocked')`,
    [U_BLOCKER, P_BLOCKED],
  );

  const rows = await activity();
  assertEqual(rows.length, 1, "one row, for the blocker only");
  assertEqual(rows[0].user_id, U_BLOCKER);
  assertEqual(rows[0].kind, "roommate_blocked");
  assertEqual(rows[0].title, "You blocked a roommate");
  assertEqual(rows[0].href, "/settings");
  assertEqual(rows[0].read_at, null);
  assert(
    rows[0].body.includes("Ada Blocked"),
    `body should name the blocked profile: ${rows[0].body}`,
  );
  assert(
    rows[0].body.includes("Undo this in Settings"),
    `body should say how to undo it: ${rows[0].body}`,
  );
  assert(
    !rows.some((row) => row.user_id === U_BLOCKED),
    "the blocked account must not be told about the block",
  );
});

// ---------------------------------------------------------------------------
// Report decisions
// ---------------------------------------------------------------------------

await test("a report stays quiet while it is queued", async () => {
  await reset();
  const reportId = await newReport();
  assertEqual((await activity()).length, 0, "a new report notifies nobody");

  await db.query("update public.roommate_reports set status = 'reviewing' where id = $1", [
    reportId,
  ]);
  assertEqual((await activity()).length, 0, "moving to reviewing notifies nobody");
});

await test("resolving a report notifies the reporter with the moderator's note", async () => {
  await reset();
  const reportId = await newReport();

  await db.query(
    `update public.roommate_reports
        set status = 'resolved',
            resolution_note = 'We removed the profile.',
            resolved_at = now()
      where id = $1`,
    [reportId],
  );

  const rows = await activity();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].user_id, U_REPORTER);
  assertEqual(rows[0].kind, "report_decision");
  assertEqual(rows[0].title, "Your report was reviewed");
  assertEqual(rows[0].href, "/notifications");
  assertEqual(rows[0].read_at, null);
  assert(
    rows[0].body.includes("We removed the profile."),
    `body should quote the note: ${rows[0].body}`,
  );
  assert(
    !rows.some((row) => row.user_id === U_REPORTED),
    "the reported account must not be told",
  );
});

await test("dismissing a report notifies the reporter with the other wording", async () => {
  await reset();
  const reportId = await newReport();

  await db.query(
    `update public.roommate_reports
        set status = 'dismissed', resolved_at = now()
      where id = $1`,
    [reportId],
  );

  const rows = await activity();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "report_decision");
  assert(
    rows[0].body.includes("found no action was needed"),
    `dismissal has its own wording: ${rows[0].body}`,
  );
});

// ---------------------------------------------------------------------------
// Verification re-review decisions
// ---------------------------------------------------------------------------

await test("requesting a re-review notifies nobody", async () => {
  await reset();
  await newAppeal();
  assertEqual((await activity()).length, 0, "the request itself is silent");
});

await test("an approved re-review notifies the student", async () => {
  await reset();
  const appealId = await newAppeal();

  await db.query(
    `update public.roommate_verification_appeals
        set status = 'approved', decision_note = 'Called and confirmed.', decided_at = now()
      where id = $1`,
    [appealId],
  );

  const rows = await activity();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].user_id, U_APPEAL);
  assertEqual(rows[0].kind, "appeal_decision");
  assertEqual(rows[0].title, "Your re-review was approved");
  assertEqual(rows[0].href, "/roommates/verify");
  assert(
    rows[0].body.includes("Called and confirmed."),
    `body should quote the decision note: ${rows[0].body}`,
  );
});

await test("a declined re-review notifies the student with its own title", async () => {
  await reset();
  const appealId = await newAppeal();

  await db.query(
    `update public.roommate_verification_appeals
        set status = 'declined', decided_at = now()
      where id = $1`,
    [appealId],
  );

  const rows = await activity();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "appeal_decision");
  assertEqual(rows[0].title, "Your re-review was declined");
  assert(
    rows[0].body.includes("kept the current decision"),
    `decline has its own wording: ${rows[0].body}`,
  );
});

// ---------------------------------------------------------------------------
// Still trigger-only
// ---------------------------------------------------------------------------

await test("clients cannot write activity rows or call notify_user", async () => {
  let insertDenied = false;
  try {
    await asRole("authenticated", U_BLOCKER, async (tx) => {
      await tx.query(
        "insert into public.notifications (user_id, kind, title) values ($1, 'report_decision', 'Forged')",
        [U_BLOCKER],
      );
    });
  } catch (error) {
    insertDenied = error?.code === "42501";
  }
  assert(insertDenied, "direct notification inserts must be denied");

  let callDenied = false;
  try {
    await asRole("authenticated", U_BLOCKER, async (tx) => {
      await tx.query(
        "select public.notify_user($1, 'report_decision', 'Forged')",
        [U_BLOCKER],
      );
    });
  } catch (error) {
    callDenied = error?.code === "42501";
  }
  assert(callDenied, "notify_user must stay trigger-only");
});

await db.close();

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
