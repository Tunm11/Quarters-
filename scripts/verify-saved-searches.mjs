/**
 * Local verification for saved searches and their new-room alerts.
 *
 * Applies the real migration files to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, saves searches for a student, publishes rooms and
 * asserts which activity rows the trigger wrote — and, just as importantly,
 * which ones it did not.
 *
 * The web-push migration is skipped: it creates the `pg_net` extension, which
 * PGlite does not ship. It only forwards a written notification to the Edge
 * Function, and these checks are about which rows are written in the first
 * place. It is NOT a live Supabase test.
 *
 * Usage: bun run test:searches
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SKIP_MIGRATIONS = new Set(["20261025330000_add_web_push.sql"]);

const U_STUDENT = "00000000-0000-4000-8000-000000000021";
const U_OTHER = "00000000-0000-4000-8000-000000000022";
const U_PROVIDER = "00000000-0000-4000-8000-000000000023";
const U_ADMIN = "00000000-0000-4000-8000-000000000024";

const P_PROVIDER = "11111111-1111-4111-8111-000000000021";

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
    ('${U_STUDENT}', 'student@example.test'),
    ('${U_OTHER}', 'other@example.test'),
    ('${U_PROVIDER}', 'provider@example.test'),
    ('${U_ADMIN}', 'admin@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_STUDENT}', 'Searching Student'),
    ('${U_OTHER}', 'Other Student');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Saved-search verification');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_PROVIDER}', '${U_PROVIDER}', 'landlord', 'Search Court');

  insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by) values
    ('${P_PROVIDER}', 'approved', 'Approved for saved-search verification.', '${U_ADMIN}');
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

/** Everything the caller is allowed to see in the activity feed. */
/** A PostgreSQL array literal, so array columns can be passed as parameters. */
function pgArray(values) {
  const items = values.map((value) => `"${String(value).replace(/(["\\])/g, "\\$1")}"`);
  return `{${items.join(",")}}`;
}

async function alerts(tx = db) {
  const { rows } = await tx.query(
    `select user_id, kind::text as kind, title, body, href
     from public.notifications
     order by created_at, title`,
  );
  return rows;
}

async function clearAlerts() {
  await db.exec("delete from public.notifications");
}

/** Drops the saved searches a test set up, so the next one starts clean. */
async function clearSearches() {
  await db.exec("delete from public.saved_searches");
}

/** Publishes a room directly, the way a provider save does. */
async function publishRoom({
  id,
  title,
  type = "private_room",
  city = "Lagos",
  neighbourhood = "Akoka",
  rent = 750000,
  period = "year",
  bedrooms = 1,
  facilities = ["Wi-Fi"],
}) {
  await db.query(
    `insert into public.listings
       (id, provider_id, title, description, accommodation_type, city,
        neighbourhood, rent_amount, rent_period, availability_status,
        bedrooms, facilities, publication_status)
     values ($1, $2, $3, 'A room published during verification of saved searches.',
             $4, $5, $6, $7, $8, 'available', $9, $10::text[], 'published')`,
    [
      id,
      P_PROVIDER,
      title,
      type,
      city,
      neighbourhood,
      rent,
      period,
      bedrooms,
      pgArray(facilities),
    ],
  );
}

async function saveSearch(criteria, { userId = U_STUDENT, notify = true } = {}) {
  return asRole("authenticated", userId, async (tx) => {
    const { rows } = await tx.query(
      `insert into public.saved_searches
         (user_id, name, query, category, budget_min, budget_max, types,
          bedrooms, facilities, notify)
       values ($1, $2, $3, $4, $5, $6, $7::public.accommodation_type[],
               $8::smallint[], $9::text[], $10)
       returning id`,
      [
        userId,
        criteria.name ?? "Test search",
        criteria.query ?? "",
        criteria.category ?? "all",
        criteria.budgetMin ?? null,
        criteria.budgetMax ?? null,
        pgArray(criteria.types ?? []),
        pgArray(criteria.bedrooms ?? []),
        pgArray(criteria.facilities ?? []),
        notify,
      ],
    );
    return rows[0].id;
  });
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
// The match trigger
// ---------------------------------------------------------------------------

await test("a new room that fits the search alerts the account that saved it", async () => {
  await clearAlerts();
  await saveSearch({
    name: "Akoka under ₦800k",
    query: "akoka",
    category: "private",
    budgetMin: 0,
    budgetMax: 800000,
    types: ["private_room"],
    bedrooms: [1],
    facilities: ["Wi-Fi"],
  });

  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000031",
    title: "Sunlit room in Akoka",
  });

  const rows = await alerts();
  assertEqual(rows.length, 1, "one alert for the one matching search");
  assertEqual(rows[0].user_id, U_STUDENT);
  assertEqual(rows[0].kind, "saved_search_match");
  assertEqual(rows[0].title, "New room matches “Akoka under ₦800k”");
  assertEqual(rows[0].href, "/property/aaaaaaaa-aaaa-4aaa-8aaa-000000000031");
  assert(rows[0].body.includes("Sunlit room in Akoka"), `body names the room: ${rows[0].body}`);
  assert(rows[0].body.includes("Akoka, Lagos"), `body names the area: ${rows[0].body}`);
  assert(rows[0].body.includes("750,000 a year"), `body names the rent: ${rows[0].body}`);
});

await test("each saved search raises its own alert for the same room", async () => {
  await clearAlerts();
  await saveSearch({ name: "Anything in Lagos", query: "lagos" });

  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000032",
    title: "Bright room near Akoka",
  });

  const rows = await alerts();
  assertEqual(rows.length, 2, "one alert per matching search");
});

await test("a room that does not fit the search writes nothing", async () => {
  await clearAlerts();
  // Only the Akoka search is under test here; the catch-all from the check above
  // would match every room below by design.
  await db.query("delete from public.saved_searches where name = 'Anything in Lagos'");

  // Right area and facilities, wrong room type.
  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000033",
    title: "Shared room in Akoka",
    type: "shared_room",
  });
  // Right type, over the budget.
  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000034",
    title: "Costly room in Akoka",
    rent: 900000,
  });
  // Right type and rent, missing a required facility.
  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000035",
    title: "Bare room in Akoka",
    facilities: ["Water"],
  });
  // Right type and rent, wrong bedroom count.
  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000036",
    title: "Two-bedroom in Akoka",
    bedrooms: 2,
  });
  // Right everything, but the search's keyword is elsewhere.
  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000037",
    title: "Sunlit room in Yaba",
    neighbourhood: "Yaba",
  });

  assertEqual((await alerts()).length, 0, "nothing matched, so nothing was written");
});

await test("a room published later, not on insert, still alerts", async () => {
  await clearAlerts();

  await db.query(
    `insert into public.listings
       (id, provider_id, title, description, accommodation_type, city,
        neighbourhood, rent_amount, rent_period, availability_status, bedrooms,
        facilities, publication_status)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000038', $1, 'Draft in Akoka',
             'A draft that is published a moment later.', 'private_room',
             'Lagos', 'Akoka', 700000, 'year', 'available', 1,
             array['Wi-Fi'], 'draft')`,
    [P_PROVIDER],
  );
  assertEqual((await alerts()).length, 0, "the draft is not visible yet");

  await db.query(
    "update public.listings set publication_status = 'published' where id = $1",
    ["aaaaaaaa-aaaa-4aaa-8aaa-000000000038"],
  );
  const rows = await alerts();
  assertEqual(rows.length, 1, "publishing alerts the search watching for it");
  assertEqual(rows[0].kind, "saved_search_match");
});

await test("an edit that leaves the room published writes nothing again", async () => {
  await clearAlerts();
  await db.query("update public.listings set title = 'Sunlit room, Akoka' where id = $1", [
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000038",
  ]);
  await db.query(
    "update public.listings set publication_status = 'published' where id = $1",
    ["aaaaaaaa-aaaa-4aaa-8aaa-000000000038"],
  );
  assertEqual((await alerts()).length, 0, "no repeat alert for a room already seen");
});

await test("alerts off means no alert, and the switch is honoured at publish time", async () => {
  await clearAlerts();

  await asRole("authenticated", U_STUDENT, async (tx) => {
    await tx.query("update public.saved_searches set notify = false");
  });

  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000039",
    title: "Another Akoka room",
  });
  assertEqual((await alerts()).length, 0, "a search with alerts off stays quiet");

  await asRole("authenticated", U_STUDENT, async (tx) => {
    await tx.query("update public.saved_searches set notify = true");
  });

  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-00000000003a",
    title: "One more Akoka room",
  });
  assertEqual((await alerts()).length, 1, "alerts resume once the switch is back on");
});

await test("the provider who published the room is never alerted for it", async () => {
  await clearAlerts();
  await saveSearch({ name: "Everything" }, { userId: U_PROVIDER });

  await publishRoom({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-00000000003b",
    title: "The provider's own room",
  });

  const rows = await alerts();
  assert(
    rows.every((row) => row.user_id !== U_PROVIDER),
    "the publisher hears nothing about their own publish",
  );
  assert(rows.length > 0, "the students watching still hear about it");
});

await test("a room that is not public produces no alerts", async () => {
  await clearAlerts();
  await db.query(
    `insert into public.listings
       (id, provider_id, title, description, accommodation_type, city,
        neighbourhood, rent_amount, rent_period, availability_status,
        publication_status)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-00000000003c', $1, 'Room in Akoka',
             'A verification room that stays a draft.', 'private_room', 'Lagos',
             'Akoka', 400000, 'year', 'available', 'draft')`,
    [P_PROVIDER],
  );
  assertEqual((await alerts()).length, 0, "a draft has nobody to alert");
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

await test("a saved search is private to its account", async () => {
  const seen = await asRole("authenticated", U_OTHER, async (tx) => {
    const { rows } = await tx.query("select id from public.saved_searches");
    return rows.length;
  });
  assertEqual(seen, 0, "another account cannot read these searches");

  const updated = await asRole("authenticated", U_OTHER, async (tx) => {
    const { rows } = await tx.query(
      "update public.saved_searches set name = 'Stolen' returning id",
    );
    return rows.length;
  });
  assertEqual(updated, 0, "another account cannot rename these searches");

  const removed = await asRole("authenticated", U_OTHER, async (tx) => {
    const { rows } = await tx.query("delete from public.saved_searches returning id");
    return rows.length;
  });
  assertEqual(removed, 0, "another account cannot delete these searches");
});

await test("a search cannot be created for another account", async () => {
  let denied = false;
  try {
    await asRole("authenticated", U_OTHER, async (tx) => {
      await tx.query(
        "insert into public.saved_searches (user_id, name) values ($1, 'Not mine')",
        [U_STUDENT],
      );
    });
  } catch (error) {
    denied = error?.code === "42501";
  }
  assert(denied, "inserting a row for someone else must be denied");
});

await test("the owner can read their own search", async () => {
  const rows = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query(
      `select name, query, category, budget_min, budget_max,
              array_to_string(types, ',') as types,
              array_to_string(bedrooms, ',') as bedrooms,
              array_to_string(facilities, ',') as facilities,
              notify
       from public.saved_searches
       order by created_at`,
    );
    return rows;
  });
  assertEqual(rows.length, 1, "the owner sees their own search");
  assertEqual(rows[0].name, "Akoka under ₦800k");
  assertEqual(rows[0].query, "akoka");
  assertEqual(rows[0].budget_max, 800000);
  assertEqual(rows[0].types, "private_room");
  assertEqual(rows[0].bedrooms, "1");
  assertEqual(rows[0].facilities, "Wi-Fi");
  assertEqual(rows[0].notify, true);
});

await test("name and query length rules are enforced by the table", async () => {
  const tooLongName = "x".repeat(41);
  let nameDenied = false;
  try {
    await saveSearch({ name: tooLongName });
  } catch (error) {
    nameDenied = error?.code === "23514";
  }
  assert(nameDenied, "a 41-character name must be rejected");

  let blankNameDenied = false;
  try {
    await saveSearch({ name: "   " });
  } catch (error) {
    blankNameDenied = error?.code === "23514";
  }
  assert(blankNameDenied, "a blank name must be rejected");

  let categoryDenied = false;
  try {
    await saveSearch({ name: "Odd category", category: "castle" });
  } catch (error) {
    categoryDenied = error?.code === "23514";
  }
  assert(categoryDenied, "an unknown room-type shortcut must be rejected");
});

await test("clients cannot forge a saved-search alert", async () => {
  let denied = false;
  try {
    await asRole("authenticated", U_STUDENT, async (tx) => {
      await tx.query(
        "insert into public.notifications (user_id, kind, title) values ($1, 'saved_search_match', 'Forged')",
        [U_STUDENT],
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
