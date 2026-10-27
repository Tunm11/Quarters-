/**
 * Local verification for saved-room alerts.
 *
 * Applies the real migration files to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, saves a room for a student, then changes the
 * listing's rent and availability and asserts what landed in `notifications`.
 *
 * The web-push migration is skipped: it creates the `pg_net` extension, which
 * PGlite does not ship. That migration only adds the trigger that forwards a
 * notification to the Edge Function, and these checks are about which
 * notification rows are written in the first place. It is NOT a live Supabase
 * test.
 *
 * Usage: bun run test:alerts
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SKIP_MIGRATIONS = new Set(["20261025330000_add_web_push.sql"]);

const U_SAVER = "00000000-0000-4000-8000-000000000011";
const U_OTHER = "00000000-0000-4000-8000-000000000012";
const U_PROVIDER = "00000000-0000-4000-8000-000000000013";
const U_ADMIN = "00000000-0000-4000-8000-000000000014";

const P_PROVIDER = "11111111-1111-4111-8111-000000000011";
const L_PUBLIC = "aaaaaaaa-aaaa-4aaa-8aaa-000000000011";
const L_DRAFT = "aaaaaaaa-aaaa-4aaa-8aaa-000000000012";

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
    ('${U_SAVER}', 'saver@example.test'),
    ('${U_OTHER}', 'other@example.test'),
    ('${U_PROVIDER}', 'provider@example.test'),
    ('${U_ADMIN}', 'admin@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_SAVER}', 'Saver Student'),
    ('${U_OTHER}', 'Other Student');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Saved-room alert verification');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_PROVIDER}', '${U_PROVIDER}', 'landlord', 'Alert Court');

  insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by) values
    ('${P_PROVIDER}', 'approved', 'Approved for alert verification.', '${U_ADMIN}');

  insert into public.listings
    (id, provider_id, title, description, accommodation_type, city, rent_amount,
     rent_period, availability_status, publication_status)
  values
    ('${L_PUBLIC}', '${P_PROVIDER}', 'Sunlit room in Akoka',
     'A bright room a few minutes from the campus gate.',     'private_room', 'Lagos',
     750000.00, 'year', 'available', 'published'),
    ('${L_DRAFT}', '${P_PROVIDER}', 'Draft room in Yaba',
     'A draft listing that nobody can see or open yet.', 'private_room', 'Lagos',
     450000.00, 'year', 'available', 'draft');
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
        ? [error.message, error.code && `SQLSTATE ${error.code}`, error.detail].filter(Boolean).join(" | ")
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

async function alerts(tx = db) {
  const { rows } = await tx.query(
    `select user_id, kind::text as kind, title, body, href, read_at
     from public.notifications
     order by created_at, kind`,
  );
  return rows;
}

async function clearAlerts(tx = db) {
  await tx.exec("delete from public.notifications");
}

async function updateListing(id, sql, params = []) {
  await db.query(`update public.listings set ${sql} where id = $1`, [id, ...params]);
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

  await asRole("authenticated", U_SAVER, async (tx) => {
    await tx.query("insert into public.saved_listings (user_id, listing_id) values ($1, $2)", [
      U_SAVER,
      L_PUBLIC,
    ]);
  });
}

await boot();

// ---------------------------------------------------------------------------
// Rent changes
// ---------------------------------------------------------------------------

await test("a saver hears about a rent change, and nobody else does", async () => {
  await clearAlerts();
  await updateListing(L_PUBLIC, "rent_amount = 900000", []);

  const rows = await alerts();
  assertEqual(rows.length, 1, "one alert for the one saver");
  assertEqual(rows[0].user_id, U_SAVER);
  assertEqual(rows[0].kind, "saved_room_price_changed");
  assertEqual(rows[0].title, "Rent changed on a saved room");
  assertEqual(rows[0].href, `/property/${L_PUBLIC}`);
  assertEqual(rows[0].read_at, null);
  assert(rows[0].body.includes("900,000 a year"), `body should name the new rent: ${rows[0].body}`);
  assert(rows[0].body.includes("750,000 a year"), `body should name the old rent: ${rows[0].body}`);
});

await test("changing only the billing period still alerts the saver", async () => {
  await clearAlerts();
  await updateListing(L_PUBLIC, "rent_period = 'term'", []);

  const rows = await alerts();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "saved_room_price_changed");
  assert(rows[0].body.includes("a term"), `body should name the new period: ${rows[0].body}`);
});

await test("an update that leaves rent unchanged writes nothing", async () => {
  await clearAlerts();
  await updateListing(L_PUBLIC, "title = 'Sunlit room near Akoka'", []);

  const rows = await alerts();
  assertEqual(rows.length, 0);
});

// ---------------------------------------------------------------------------
// Availability changes
// ---------------------------------------------------------------------------

await test("availability changes alert the saver with the matching kind", async () => {
  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'unavailable'", []);
  let rows = await alerts();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "saved_room_availability_changed");
  assertEqual(rows[0].title, "A saved room is now unavailable");
  assert(rows[0].body.includes("was available"), `body should name the old state: ${rows[0].body}`);

  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'available'", []);
  rows = await alerts();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "saved_room_available");
  assertEqual(rows[0].title, "A saved room is available again");

  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'limited'", []);
  rows = await alerts();
  assertEqual(rows.length, 1);
  assertEqual(rows[0].kind, "saved_room_availability_changed");
  assertEqual(rows[0].title, "Limited rooms left at a saved property");
});

// ---------------------------------------------------------------------------
// Preference
// ---------------------------------------------------------------------------

await test("the saved-room switch is honoured and is owner-writable only", async () => {
  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'available'", []);

  const off = await asRole("authenticated", U_SAVER, async (tx) => {
    await tx.query("update public.profiles set saved_room_alerts = false where id = $1", [U_SAVER]);
    const { rows } = await tx.query("select saved_room_alerts from public.profiles where id = $1", [
      U_SAVER,
    ]);
    return rows[0].saved_room_alerts;
  });
  assertEqual(off, false, "the saver can turn the switch off");

  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'limited'", []);
  assertEqual((await alerts()).length, 0, "no alert while the switch is off");

  await updateListing(L_PUBLIC, "rent_amount = 990000", []);
  assertEqual((await alerts()).length, 0, "rent changes are quiet too while the switch is off");

  await asRole("authenticated", U_SAVER, async (tx) => {
    await tx.query("update public.profiles set saved_room_alerts = true where id = $1", [U_SAVER]);
  });

  await clearAlerts();
  await updateListing(L_PUBLIC, "availability_status = 'available'", []);
  assertEqual((await alerts()).length, 1, "alerts resume once the switch is back on");

  const touchingOther = await asRole("authenticated", U_OTHER, async (tx) => {
    const { rows } = await tx.query(
      "update public.profiles set saved_room_alerts = false where id = $1 returning id",
      [U_SAVER],
    );
    return rows.length;
  });
  assertEqual(touchingOther, 0, "another account cannot change this switch");
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

await test("a room that is not public produces no alerts", async () => {
  await clearAlerts();
  await updateListing(L_DRAFT, "rent_amount = 50000, availability_status = 'unavailable'", []);
  assertEqual((await alerts()).length, 0, "a draft room has nobody to alert");
});

await test("clients cannot write notification rows directly", async () => {
  let denied = false;
  try {
    await asRole("authenticated", U_SAVER, async (tx) => {
      await tx.query(
        "insert into public.notifications (user_id, kind, title) values ($1, 'saved_room_available', 'Forged')",
        [U_SAVER],
      );
    });
  } catch (error) {
    denied = error?.code === "42501";
  }
  assert(denied, "direct notification inserts must be denied");
});

await db.close();

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
