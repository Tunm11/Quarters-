/**
 * Local verification for reporting and blocking.
 *
 * Applies every real migration to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, then exercises the two pieces this stage added:
 * the group member list that names the roommate profile a member can be
 * reported through, and my_reports(), which shows a student what they filed and
 * where it stands.
 *
 * PGlite is not Supabase: this proves the SQL, the policies and the grants, not
 * the hosted project. Usage: bun run test:safety
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SKIP_MIGRATIONS = new Set(["20261025330000_add_web_push.sql"]);

const U_STUDENT = "00000000-0000-4000-8000-000000000041";
const U_MEMBER = "00000000-0000-4000-8000-000000000042";
const U_AGENT = "00000000-0000-4000-8000-000000000043";
const U_OUTSIDER = "00000000-0000-4000-8000-000000000044";
const U_ADMIN = "00000000-0000-4000-8000-000000000045";

const P_STUDENT = "11111111-1111-4111-8111-000000000041";
const P_MEMBER = "11111111-1111-4111-8111-000000000042";

const P_AGENT = "33333333-3333-4333-8333-000000000041";

const L_ROOM = "44444444-4444-4444-8444-000000000041";
const L_GONE = "44444444-4444-4444-8444-000000000042";

const G_VIEWING = "55555555-5555-4555-8555-000000000041";

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
    ('${U_STUDENT}', 'student@example.test'),
    ('${U_MEMBER}', 'member@example.test'),
    ('${U_AGENT}', 'agent@example.test'),
    ('${U_OUTSIDER}', 'outsider@example.test'),
    ('${U_ADMIN}', 'moderator@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_STUDENT}', 'Safety Student'),
    ('${U_MEMBER}', 'Ada Member'),
    ('${U_AGENT}', 'Bode Estates'),
    ('${U_OUTSIDER}', 'Outside Student');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Reporting verification');

  insert into public.roommate_profiles (id, user_id, display_name, city, headline) values
    ('${P_STUDENT}', '${U_STUDENT}', 'Safety Student', 'Lagos', '300 level Law'),
    ('${P_MEMBER}', '${U_MEMBER}', 'Ada Member', 'Lagos', '200 level Medicine');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_AGENT}', '${U_AGENT}', 'agent', 'Bode Estates');

  insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by) values
    ('${P_AGENT}', 'approved', 'Approved for the reporting verification.', '${U_ADMIN}');

  insert into public.listings
    (id, provider_id, title, description, accommodation_type, city, neighbourhood,
     rent_amount, rent_period, availability_status, facilities, publication_status)
  values
    ('${L_ROOM}', '${P_AGENT}', 'Bode Court self contained',
     'A published room used to verify reporting from a conversation.',
     'self_contained', 'Lagos', 'Yaba', 800000, 'year', 'available',
     '{"Wi-Fi"}', 'published'),
    ('${L_GONE}', '${P_AGENT}', 'Bode Court back room',
     'A room that gets unpublished after it is reported.',
     'private_room', 'Lagos', 'Yaba', 400000, 'year', 'available',
     '{"Wi-Fi"}', 'published');

  -- One group with the three people a group chat really mixes: two students who
  -- have roommate profiles, and an agent who does not.
  insert into public.chat_groups (id, name, created_by) values
    ('${G_VIEWING}', 'Saturday viewing', '${U_STUDENT}');

  insert into public.chat_group_members (group_id, user_id) values
    ('${G_VIEWING}', '${U_STUDENT}'),
    ('${G_VIEWING}', '${U_MEMBER}'),
    ('${G_VIEWING}', '${U_AGENT}');
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
  if (a !== e) throw new Error(`${message ?? "values differ"}: expected ${e}, received ${a}`);
}

/** Runs a callback as a role with a JWT subject, inside a rolled-back-safe tx. */
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

/** Asserts that a statement is refused, and reports the SQLSTATE it used. */
async function refused(name, fn, expectedCode) {
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `${name} was allowed but should have been refused`);
  if (expectedCode) {
    assertEqual(error.code, expectedCode, `${name} used the wrong SQLSTATE`);
  }
}

/** The group's member list as the caller sees it. */
async function membersFor(subject) {
  const { rows } = await asRole("authenticated", subject, (tx) =>
    tx.query(
      `select user_id, display_name, is_creator, roommate_profile_id
       from public.chat_group_members_for_me($1)
       order by user_id`,
      [G_VIEWING],
    ),
  );
  return rows;
}

/** The caller's own reports, as my_reports returns them. */
async function myReports(subject) {
  const { rows } = await asRole("authenticated", subject, (tx) =>
    tx.query(
      `select kind, report_id, subject, reason, status, created_at
       from public.my_reports()`,
    ),
  );
  return rows;
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

await boot();

// ---------------------------------------------------------------------------
// The group member list carries the roommate profile
// ---------------------------------------------------------------------------

await test("the group list names the profile each member can be reported through", async () => {
  const rows = await membersFor(U_STUDENT);

  assertEqual(rows.length, 3, "the roster lost a member");
  const byUser = new Map(rows.map((row) => [row.user_id, row]));
  assertEqual(
    byUser.get(U_MEMBER).roommate_profile_id,
    P_MEMBER,
    "the roommate member had no profile to report through",
  );
  assertEqual(
    byUser.get(U_STUDENT).roommate_profile_id,
    P_STUDENT,
    "the viewer's own profile was missing from the roster",
  );
  assertEqual(
    byUser.get(U_AGENT).roommate_profile_id,
    null,
    "an agent with no roommate profile was given one",
  );
  assertEqual(byUser.get(U_STUDENT).is_creator, true, "the creator was not marked");
});

await test("someone outside the group learns nothing about its members", async () => {
  const rows = await membersFor(U_OUTSIDER);
  assertEqual(rows.length, 0, "an outsider read the group roster");
});

await test("an anonymous caller cannot reach the group roster", async () => {
  await refused(
    "anon roster",
    () =>
      asRole("anon", null, (tx) =>
        tx.query("select * from public.chat_group_members_for_me($1)", [G_VIEWING]),
      ),
    "42501",
  );
});

// ---------------------------------------------------------------------------
// Reporting and blocking a person from the group
// ---------------------------------------------------------------------------

await test("a member can report another member they only know from the group", async () => {
  await asRole("authenticated", U_MEMBER, (tx) =>
    tx.query(
      `insert into public.roommate_reports (reporter_id, reported_profile_id, reason, details)
       values ($1, $2, 'harassment', 'Repeated unwanted messages in our viewing group chat.')`,
      [U_MEMBER, P_STUDENT],
    ),
  );

  const mine = await asRole("authenticated", U_MEMBER, (tx) =>
    tx.query("select count(*)::int as n from public.roommate_reports"),
  );
  assertEqual(mine.rows[0].n, 1, "the reporter could not read back their own report");
});

await test("a second open report about the same member is refused", async () => {
  await refused(
    "duplicate report",
    () =>
      asRole("authenticated", U_MEMBER, (tx) =>
        tx.query(
          `insert into public.roommate_reports (reporter_id, reported_profile_id, reason)
           values ($1, $2, 'safety')`,
          [U_MEMBER, P_STUDENT],
        ),
      ),
    "23505",
  );
});

await test("the member who was reported cannot read that report", async () => {
  const rows = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.roommate_reports"),
  );
  assertEqual(rows.rows[0].n, 0, "the reported member read the report about them");
});

await test("a member can block another member without leaving the group", async () => {
  await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query(
      `insert into public.roommate_blocks (blocker_id, blocked_profile_id, blocked_display_name)
       values ($1, $2, 'Ada Member')`,
      [U_STUDENT, P_MEMBER],
    ),
  );

  // The roster still lists them: a group is not dissolved by a block.
  const rows = await membersFor(U_STUDENT);
  assertEqual(rows.length, 3, "blocking a member removed them from the group");
  assertEqual(
    rows.find((row) => row.user_id === U_MEMBER).roommate_profile_id,
    P_MEMBER,
    "the blocked member's profile id disappeared, so the sheet cannot mark them blocked",
  );

  // Discovery is severed, which is what the client pairs with the block.
  const discovery = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.roommate_profiles where id = $1", [
      P_MEMBER,
    ]),
  );
  assertEqual(discovery.rows[0].n, 0, "a blocked member stayed discoverable");
});

await test("a blocked member cannot send interest or messages", async () => {
  await refused(
    "interest after a block",
    () =>
      asRole("authenticated", U_MEMBER, (tx) =>
        tx.query(
          `insert into public.roommate_interests (sender_id, profile_id, status)
           values ($1, $2, 'pending')`,
          [U_MEMBER, P_STUDENT],
        ),
      ),
    "42501",
  );
});

// ---------------------------------------------------------------------------
// Reporting a room from the lister conversation
// ---------------------------------------------------------------------------

await test("a student can report the room they are talking to a lister about", async () => {
  await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query(
      `insert into public.listing_reports (listing_id, reporter_id, reason, details)
       values ($1, $2, 'scam', 'Asked for a deposit before any viewing.')`,
      [L_ROOM, U_STUDENT],
    ),
  );

  const mine = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.listing_reports"),
  );
  assertEqual(mine.rows[0].n, 1, "the report from the conversation was not stored");
});

await test("a listing report about a room that gets unpublished still names it", async () => {
  await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query(
      `insert into public.listing_reports (listing_id, reporter_id, reason)
       values ($1, $2, 'already_taken')`,
      [L_GONE, U_STUDENT],
    ),
  );

  // The provider takes the room down: the student can no longer read the row.
  await db.query(
    "update public.listings set publication_status = 'draft' where id = $1",
    [L_GONE],
  );

  const visible = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.listings where id = $1", [L_GONE]),
  );
  assertEqual(visible.rows[0].n, 0, "a draft room was still readable");

  const reports = await myReports(U_STUDENT);
  const gone = reports.find((row) => row.subject === "Bode Court back room");
  assert(gone, "the unpublished room was not named in the reports list");
});

// ---------------------------------------------------------------------------
// The reports a student filed
// ---------------------------------------------------------------------------

await test("my_reports returns both kinds, newest first, with readable subjects", async () => {
  const reports = await myReports(U_STUDENT);

  assertEqual(reports.length, 2, "the wrong number of reports came back");
  assertEqual(
    reports.map((row) => row.kind),
    ["listing", "listing"],
    "the room reports were not the newest",
  );

  const room = reports.find((row) => row.subject === "Bode Court self contained");
  assert(room, "the reported room was not named");
  assertEqual(room.reason, "scam", "the stored reason was rewritten");
  assertEqual(room.status, "open", "a queued report claimed a decision");
});

await test("a person report still names the student after they are blocked", async () => {
  // The student blocked Ada while reporting in the group, so her profile is
  // hidden from them; the report must still say who it was about.
  const visibility = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.roommate_profiles where id = $1", [
      P_MEMBER,
    ]),
  );
  assertEqual(visibility.rows[0].n, 0, "the blocked profile was readable");

  await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query(
      `insert into public.roommate_reports (reporter_id, reported_profile_id, reason, details)
       values ($1, $2, 'scam', 'Asked me to send a deposit for a room that was taken.')`,
      [U_STUDENT, P_MEMBER],
    ),
  );

  const reports = await myReports(U_STUDENT);
  const person = reports.find((row) => row.kind === "person");
  assert(person, "the person report was missing");
  assertEqual(person.subject, "Ada Member", "the reported student was not named");
  assertEqual(person.reason, "scam", "the stored reason was rewritten");
});

await test("the status comes back as moderation left it", async () => {
  await asRole("authenticated", U_ADMIN, (tx) =>
    tx.query(
      `update public.listing_reports set status = 'reviewed'
       where listing_id = $1`,
      [L_ROOM],
    ),
  );

  const reports = await myReports(U_STUDENT);
  const room = reports.find((row) => row.subject === "Bode Court self contained");
  assertEqual(room.status, "reviewed", "the decision did not reach the reporter");
});

await test("my_reports only ever returns the caller's own reports", async () => {
  const student = await myReports(U_STUDENT);
  const member = await myReports(U_MEMBER);
  const agent = await myReports(U_AGENT);
  const outsider = await myReports(U_OUTSIDER);

  assertEqual(student.length, 3, "the reporter lost one of their reports");
  assertEqual(member.length, 1, "the other student got the wrong queue");
  assertEqual(member[0].kind, "person", "the other student saw a room report");
  assertEqual(agent.length, 0, "the reported provider saw a report about them");
  assertEqual(outsider.length, 0, "a stranger saw someone else's reports");
});

await test("an anonymous caller cannot read any reports", async () => {
  await refused(
    "anon reports",
    () => asRole("anon", null, (tx) => tx.query("select * from public.my_reports()")),
    "42501",
  );
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}
