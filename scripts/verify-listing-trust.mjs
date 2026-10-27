/**
 * Local verification for the listing trust features: reviews, reports,
 * move-in costs and dated availability holds.
 *
 * Applies every real migration to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, then exercises the rules as the roles that would
 * call them: a student with evidence, a student without, another student, a
 * provider who owns the listing, a provider who does not, an administrator and
 * an anonymous visitor.
 *
 * PGlite is not Supabase: this proves the SQL, the policies and the grants, not
 * the hosted project. Usage: bun run test:trust
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SKIP_MIGRATIONS = new Set(["20261025330000_add_web_push.sql"]);

const U_STUDENT = "00000000-0000-4000-8000-000000000031";
const U_VISITOR = "00000000-0000-4000-8000-000000000032";
const U_STRANGER = "00000000-0000-4000-8000-000000000033";
const U_OWNER = "00000000-0000-4000-8000-000000000034";
const U_RIVAL = "00000000-0000-4000-8000-000000000035";
const U_ADMIN = "00000000-0000-4000-8000-000000000036";

const P_OWNER = "11111111-1111-4111-8111-000000000031";
const P_RIVAL = "11111111-1111-4111-8111-000000000032";

const L_PUBLIC = "22222222-2222-4222-8222-000000000031";
const L_DRAFT = "22222222-2222-4222-8222-000000000032";

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
    ('${U_VISITOR}', 'visitor@example.test'),
    ('${U_STRANGER}', 'stranger@example.test'),
    ('${U_OWNER}', 'owner@example.test'),
    ('${U_RIVAL}', 'rival@example.test'),
    ('${U_ADMIN}', 'admin@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_STUDENT}', 'Booking Student'),
    ('${U_VISITOR}', 'Visiting Student'),
    ('${U_STRANGER}', 'New Student'),
    ('${U_OWNER}', 'Owner Account'),
    ('${U_RIVAL}', 'Rival Account');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Listing trust verification');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_OWNER}', '${U_OWNER}', 'landlord', 'Trust Court'),
    ('${P_RIVAL}', '${U_RIVAL}', 'agent', 'Rival Rooms');

  insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by) values
    ('${P_OWNER}', 'approved', 'Approved for listing trust verification.', '${U_ADMIN}'),
    ('${P_RIVAL}', 'approved', 'Approved for listing trust verification.', '${U_ADMIN}');

  insert into public.listings
    (id, provider_id, title, description, accommodation_type, city, neighbourhood,
     rent_amount, rent_period, availability_status, total_rooms, facilities,
     publication_status)
  values
    ('${L_PUBLIC}', '${P_OWNER}', 'Trust Court self contained',
     'A published room used to verify reviews, reports and availability holds.',
     'self_contained', 'Lagos', 'Akoka', 900000, 'year', 'available', 4,
     '{"Wi-Fi"}', 'published'),
    ('${L_DRAFT}', '${P_OWNER}', 'Trust Court draft room',
     'A draft room: nothing about it may reach anonymous readers.',
     'private_room', 'Lagos', 'Akoka', 500000, 'year', 'available', NULL,
     '{"Wi-Fi"}', 'draft');

  -- The booking student holds room 1 and completed a visit.
  insert into public.listing_room_bookings (listing_id, room_number, booked_by)
  values ('${L_PUBLIC}', 1, '${U_STUDENT}');

  insert into public.listing_viewing_requests
    (listing_id, requester_id, scheduled_for, status)
  values
    ('${L_PUBLIC}', '${U_STUDENT}', now() - interval '10 days', 'completed'),
    ('${L_PUBLIC}', '${U_VISITOR}', now() - interval '4 days', 'completed'),
    ('${L_PUBLIC}', '${U_STRANGER}', now() + interval '2 days', 'pending');
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

async function resetTrustRows() {
  await db.exec(`
    delete from public.listing_reviews;
    delete from public.listing_reports;
    delete from public.listing_availability_holds;
    update public.listings
      set agency_fee_amount = null,
          caution_deposit_amount = null,
          utilities_amount = null,
          utilities_period = null,
          utilities_note = null,
          available_from = null;
  `);
}

async function review(tx, { rating = 5, body = "The room matched the listing, and the costs were exactly as stated." , basis = "visit" } = {}) {
  const { rows } = await tx.query(
    "select public.save_listing_review($1, $2::smallint, $3, $4) as id",
    [L_PUBLIC, rating, body, basis],
  );
  return rows[0].id;
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
await resetTrustRows();

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

await test("a student who holds a room reviews with a reservation basis", async () => {
  const id = await asRole("authenticated", U_STUDENT, (tx) => review(tx, { basis: "reservation" }));
  assert(typeof id === "string" && id.length === 36, "the RPC did not return a review id");

  const { rows } = await db.query(
    "select rating, basis::text as basis, body from public.listing_reviews where id = $1",
    [id],
  );
  assertEqual(rows[0].rating, 5, "the rating was not stored");
  assertEqual(rows[0].basis, "reservation", "the basis was not stored");
});

await test("a student who completed a visit reviews with a visit basis", async () => {
  await asRole("authenticated", U_VISITOR, (tx) => review(tx, { rating: 4, basis: "visit" }));
  const { rows } = await db.query(
    "select count(*)::int as n from public.listing_reviews where listing_id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].n, 2, "the visit review was not stored");
});

await test("a student with no visit or reservation is refused", async () => {
  await refused(
    "review without evidence",
    () => asRole("authenticated", U_STRANGER, (tx) => review(tx)),
    "42501",
  );
});

await test("claiming stronger evidence than you have is refused", async () => {
  await refused(
    "visit claimed as a reservation",
    () => asRole("authenticated", U_VISITOR, (tx) => review(tx, { basis: "reservation" })),
    "42501",
  );
});

await test("a student with only a pending visit has no review basis", async () => {
  const { rows } = await asRole("authenticated", U_STRANGER, (tx) =>
    tx.query("select public.listing_review_basis($1) as basis", [L_PUBLIC]),
  );
  assertEqual(rows[0].basis, null, "a pending visit was treated as evidence");
});

await test("an anonymous caller cannot reach the review-basis helper", async () => {
  await refused(
    "anon review basis",
    () =>
      asRole("anon", null, (tx) =>
        tx.query("select public.listing_review_basis($1)", [L_PUBLIC]),
      ),
    "42501",
  );
});

await test("the rating must be 1..5", async () => {
  await refused(
    "six stars",
    () => asRole("authenticated", U_STUDENT, (tx) => review(tx, { rating: 6, basis: "reservation" })),
    "23514",
  );
  await refused(
    "zero stars",
    () => asRole("authenticated", U_STUDENT, (tx) => review(tx, { rating: 0, basis: "reservation" })),
    "23514",
  );
});

await test("a review body shorter than 20 characters is refused", async () => {
  await refused(
    "one-word review",
    () => asRole("authenticated", U_STUDENT, (tx) => review(tx, { body: "Nice", basis: "reservation" })),
    "23514",
  );
});

await test("writing again corrects the review instead of adding a second", async () => {
  await asRole("authenticated", U_STUDENT, (tx) =>
    review(tx, { rating: 3, body: "Second thoughts: the room was smaller than the photos.", basis: "reservation" }),
  );

  const { rows } = await db.query(
    "select count(*)::int as n, max(rating)::int as rating from public.listing_reviews where listing_id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].n, 2, "a duplicate review was created");
  const mine = await db.query(
    "select rating from public.listing_reviews where listing_id = $1 and author_id = $2",
    [L_PUBLIC, U_STUDENT],
  );
  assertEqual(mine.rows[0].rating, 3, "the corrected rating was not stored");
});

await test("the summary counts every review and averages the stars", async () => {
  const { rows } = await asRole("anon", null, (tx) =>
    tx.query(
      `select total, average, five, four, three, two, one
       from public.listing_review_summary($1)`,
      [L_PUBLIC],
    ),
  );
  assertEqual(rows[0].total, 2, "the summary missed a review");
  assertEqual(Number(rows[0].average), 3.5, "the average is wrong");
  assertEqual(rows[0].four, 1, "the distribution missed the four-star review");
  assertEqual(rows[0].three, 1, "the distribution missed the three-star review");
});

await test("a draft listing exposes no reviews or summary", async () => {
  await db.query(
    `insert into public.listing_reviews (listing_id, author_id, rating, body, basis)
     values ($1, $2, 5, 'A review that must stay hidden while the room is a draft.', 'reservation')`,
    [L_DRAFT, U_OWNER],
  );

  const list = await asRole("anon", null, (tx) =>
    tx.query("select count(*)::int as n from public.listing_reviews where listing_id = $1", [L_DRAFT]),
  );
  assertEqual(list.rows[0].n, 0, "a draft listing's reviews were readable");

  const summary = await asRole("anon", null, (tx) =>
    tx.query("select total from public.listing_review_summary($1)", [L_DRAFT]),
  );
  assertEqual(summary.rows[0].total, 0, "the summary leaked a draft listing");
});

await test("only the author can read their own review through the RPC", async () => {
  const mine = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.my_listing_review($1)", [L_PUBLIC]),
  );
  assertEqual(mine.rows[0].n, 1, "the author could not read their own review");

  const other = await asRole("authenticated", U_STRANGER, (tx) =>
    tx.query("select count(*)::int as n from public.my_listing_review($1)", [L_PUBLIC]),
  );
  assertEqual(other.rows[0].n, 0, "another student read someone else's review");
});

await test("an author can correct their own review through the table API", async () => {
  const updated = await asRole("authenticated", U_VISITOR, async (tx) => {
    const { rows } = await tx.query(
      `update public.listing_reviews set body = 'Corrected: the visit went well and the rent was as quoted.'
       where listing_id = $1
       returning body`,
      [L_PUBLIC],
    );
    return rows.length;
  });
  assertEqual(updated, 1, "the author's own update was refused");

  const forbidden = await asRole("authenticated", U_STRANGER, async (tx) => {
    const { rows } = await tx.query(
      "update public.listing_reviews set body = 'Not mine to change at all.' where listing_id = $1 returning id",
      [L_PUBLIC],
    );
    return rows.length;
  });
  assertEqual(forbidden, 0, "a stranger changed another student's review");
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

await test("any signed-in student can report a published listing", async () => {
  await asRole("authenticated", U_STRANGER, async (tx) => {
    await tx.query(
      `insert into public.listing_reports (listing_id, reporter_id, reason, details)
       values ($1, $2, 'scam', 'Asked for a deposit before any viewing was offered.')`,
      [L_PUBLIC, U_STRANGER],
    );
  });

  const { rows } = await db.query(
    "select status::text as status from public.listing_reports where listing_id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].status, "open", "the report did not start open");
});

await test("the same student cannot report the same listing twice", async () => {
  await refused(
    "duplicate report",
    () =>
      asRole("authenticated", U_STRANGER, (tx) =>
        tx.query(
          `insert into public.listing_reports (listing_id, reporter_id, reason)
           values ($1, $2, 'already_taken')`,
          [L_PUBLIC, U_STRANGER],
        ),
      ),
    "23505",
  );
});

await test("a report cannot be filed in someone else's name", async () => {
  await refused(
    "impersonated report",
    () =>
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.query(
          `insert into public.listing_reports (listing_id, reporter_id, reason)
           values ($1, $2, 'scam')`,
          [L_PUBLIC, U_STRANGER],
        ),
      ),
    "42501",
  );
});

await test("a report needs a reason and 'other' needs words", async () => {
  await refused(
    "other with no details",
    () =>
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.query(
          `insert into public.listing_reports (listing_id, reporter_id, reason)
           values ($1, $2, 'other')`,
          [L_PUBLIC, U_STUDENT],
        ),
      ),
    "23514",
  );
  await refused(
    "details that are too short",
    () =>
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.query(
          `insert into public.listing_reports (listing_id, reporter_id, reason, details)
           values ($1, $2, 'other', 'bad')`,
          [L_PUBLIC, U_STUDENT],
        ),
      ),
    "23514",
  );
});

await test("students only read their own reports", async () => {
  const own = await asRole("authenticated", U_STRANGER, (tx) =>
    tx.query("select count(*)::int as n from public.listing_reports"),
  );
  assertEqual(own.rows[0].n, 1, "the reporter could not read their own report");

  const other = await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select count(*)::int as n from public.listing_reports"),
  );
  assertEqual(other.rows[0].n, 0, "a student read another student's report");
});

await test("an administrator reads every report and can triage it", async () => {
  const all = await asRole("authenticated", U_ADMIN, (tx) =>
    tx.query("select count(*)::int as n from public.listing_reports"),
  );
  assert(all.rows[0].n >= 1, "the administrator could not read the reports");

  const moved = await asRole("authenticated", U_ADMIN, async (tx) => {
    const { rows } = await tx.query(
      `update public.listing_reports set status = 'reviewed' returning status::text as status`,
    );
    return rows;
  });
  assertEqual(moved[0]?.status, "reviewed", "the administrator could not triage the report");
});

await test("a student cannot triage a report", async () => {
  const updated = await asRole("authenticated", U_STRANGER, async (tx) => {
    const { rows } = await tx.query(
      "update public.listing_reports set status = 'dismissed' returning id",
    );
    return rows.length;
  });
  assertEqual(updated, 0, "a student changed a report's status");
});

// ---------------------------------------------------------------------------
// Move-in costs
// ---------------------------------------------------------------------------

await test("a provider can state the move-in costs on their own listing", async () => {
  await asRole("authenticated", U_OWNER, (tx) =>
    tx.query(
      `update public.listings
       set agency_fee_amount = 45000,
           caution_deposit_amount = 90000,
           utilities_amount = 20000,
           utilities_period = 'month',
           utilities_note = 'Metered; estimate for one student'
       where id = $1`,
      [L_PUBLIC],
    ),
  );

  const { rows } = await db.query(
    "select agency_fee_amount::float8 as agency, utilities_period::text as period from public.listings where id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].agency, 45000, "the agency fee was not stored");
  assertEqual(rows[0].period, "month", "the utilities period was not stored");
});

await test("a utilities amount without a period is refused", async () => {
  // The draft listing has neither, so the amount is the only thing set.
  await refused(
    "amount without period",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query("update public.listings set utilities_amount = 15000 where id = $1", [L_DRAFT]),
      ),
    "23514",
  );
});

await test("a utilities period without an amount is refused", async () => {
  await refused(
    "period without amount",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query("update public.listings set utilities_period = 'month' where id = $1", [L_DRAFT]),
      ),
    "23514",
  );
});

await test("an amount and a period together are accepted", async () => {
  await asRole("authenticated", U_OWNER, (tx) =>
    tx.query(
      `update public.listings set utilities_amount = 15000, utilities_period = 'month'
       where id = $1`,
      [L_DRAFT],
    ),
  );

  const { rows } = await db.query(
    "select utilities_amount::float8 as amount from public.listings where id = $1",
    [L_DRAFT],
  );
  assertEqual(rows[0].amount, 15000, "the paired utilities figures were refused");
});

await test("costs cannot be zero or negative", async () => {
  await refused(
    "negative agency fee",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query("update public.listings set agency_fee_amount = -1 where id = $1", [L_PUBLIC]),
      ),
    "23514",
  );
});

await test("the provider who does not own the listing cannot set its costs", async () => {
  const updated = await asRole("authenticated", U_RIVAL, async (tx) => {
    const { rows } = await tx.query(
      "update public.listings set agency_fee_amount = 1 where id = $1 returning id",
      [L_PUBLIC],
    );
    return rows.length;
  });
  assertEqual(updated, 0, "a rival provider edited another provider's costs");
});

// ---------------------------------------------------------------------------
// Availability holds
// ---------------------------------------------------------------------------

await test("the owning provider can hold dates on their listing", async () => {
  await asRole("authenticated", U_OWNER, (tx) =>
    tx.query(
      `insert into public.listing_availability_holds (listing_id, starts_on, ends_on, note)
       values ($1, '2027-01-01', '2027-03-31', 'Held for a returning tenant')`,
      [L_PUBLIC],
    ),
  );

  const { rows } = await db.query(
    "select note from public.listing_availability_holds where listing_id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].note, "Held for a returning tenant", "the hold was not stored");
});

await test("an anonymous visitor can read the holds on a published listing", async () => {
  const { rows } = await asRole("anon", null, (tx) =>
    tx.query("select count(*)::int as n from public.listing_availability_holds"),
  );
  assert(rows[0].n >= 1, "the calendar's hold was not readable");
});

await test("a hold on a draft listing stays private", async () => {
  await db.query(
    `insert into public.listing_availability_holds (listing_id, starts_on, ends_on)
     values ($1, '2027-02-01', '2027-02-28')`,
    [L_DRAFT],
  );

  const { rows } = await asRole("anon", null, (tx) =>
    tx.query("select count(*)::int as n from public.listing_availability_holds where listing_id = $1", [L_DRAFT]),
  );
  assertEqual(rows[0].n, 0, "a draft listing's holds were readable");
});

await test("a rival provider cannot hold dates on someone else's listing", async () => {
  await refused(
    "foreign hold",
    () =>
      asRole("authenticated", U_RIVAL, (tx) =>
        tx.query(
          `insert into public.listing_availability_holds (listing_id, starts_on, ends_on)
           values ($1, '2027-05-01', '2027-05-31')`,
          [L_PUBLIC],
        ),
      ),
    "42501",
  );
});

await test("a hold cannot end before it starts, nor run past a year", async () => {
  await refused(
    "backwards hold",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query(
          `insert into public.listing_availability_holds (listing_id, starts_on, ends_on)
           values ($1, '2027-06-10', '2027-06-01')`,
          [L_PUBLIC],
        ),
      ),
    "23514",
  );
  await refused(
    "two-year hold",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query(
          `insert into public.listing_availability_holds (listing_id, starts_on, ends_on)
           values ($1, '2027-01-01', '2029-01-01')`,
          [L_PUBLIC],
        ),
      ),
    "23514",
  );
});

await test("the owning provider can release a hold", async () => {
  const deleted = await asRole("authenticated", U_OWNER, async (tx) => {
    const { rows } = await tx.query(
      `delete from public.listing_availability_holds
       where listing_id = $1 and note = 'Held for a returning tenant'
       returning id`,
      [L_PUBLIC],
    );
    return rows.length;
  });
  assertEqual(deleted, 1, "the owner could not release the hold");
});

// ---------------------------------------------------------------------------
// Listing verification and inspection
// ---------------------------------------------------------------------------

async function markListing(role, subject, verified, inspected) {
  return asRole(role, subject, (tx) =>
    tx.query("select * from public.admin_set_listing_verification($1, $2, $3)", [
      L_PUBLIC,
      verified,
      inspected,
    ]),
  );
}

await test("a provider cannot mark its own listing verified", async () => {
  await refused(
    "self-verification",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query(
          "update public.listings set verified_at = now() where id = $1",
          [L_PUBLIC],
        ),
      ),
    "42501",
  );
});

await test("a provider cannot mark its own listing inspected", async () => {
  await refused(
    "self-inspection",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query(
          "update public.listings set inspected_at = now() where id = $1",
          [L_PUBLIC],
        ),
      ),
    "42501",
  );
});

await test("a provider cannot claim a check while inserting a room", async () => {
  await refused(
    "insert with a mark",
    () =>
      asRole("authenticated", U_OWNER, (tx) =>
        tx.query(
          `insert into public.listings
             (provider_id, title, accommodation_type, city, rent_amount, rent_period,
              availability_status, verified_at)
           values ($1, 'Self-verified room', 'private_room', 'Lagos', 400000, 'year',
                   'available', now())`,
          [P_OWNER],
        ),
      ),
    "42501",
  );
});

await test("a student cannot use the moderator's marking function", async () => {
  await refused(
    "student marking a listing",
    () => markListing("authenticated", U_STUDENT, true, false),
    "42501",
  );
});

await test("an anonymous caller cannot reach the marking function", async () => {
  await refused(
    "anon marking a listing",
    () =>
      asRole("anon", null, (tx) =>
        tx.query("select * from public.admin_set_listing_verification($1, true, false)", [
          L_PUBLIC,
        ]),
      ),
    "42501",
  );
});

await test("an inspection cannot be claimed without a verification", async () => {
  await refused(
    "inspection without verification",
    () => markListing("authenticated", U_ADMIN, false, true),
    "22023",
  );
});

await test("an administrator marks a listing verified and then inspected", async () => {
  const first = await markListing("authenticated", U_ADMIN, true, false);
  assert(first.rows[0].verified_at, "the verification was not stamped");
  assertEqual(first.rows[0].inspected_at, null, "an inspection was stamped unasked");

  const both = await markListing("authenticated", U_ADMIN, true, true);
  assert(both.rows[0].verified_at, "the verification was lost");
  assert(both.rows[0].inspected_at, "the inspection was not stamped");

  // Readers see the marks on the published room.
  const seen = await asRole("anon", null, (tx) =>
    tx.query("select verified_at, inspected_at from public.listings where id = $1", [
      L_PUBLIC,
    ]),
  );
  assertEqual(seen.rows.length, 1, "anonymous readers lost the published room");
  assert(seen.rows[0].verified_at, "the verification is not readable");
  assert(seen.rows[0].inspected_at, "the inspection is not readable");
});

await test("a draft's marks stay out of anonymous reach", async () => {
  await markListing("authenticated", U_ADMIN, true, true);
  await db.query("update public.listings set verified_at = now(), inspected_at = now() where id = $1", [
    L_DRAFT,
  ]);

  const seen = await asRole("anon", null, (tx) =>
    tx.query("select id from public.listings where id = $1", [L_DRAFT]),
  );
  assertEqual(seen.rows.length, 0, "a draft listing was readable");

  await db.query("update public.listings set verified_at = null, inspected_at = null where id = $1", [
    L_DRAFT,
  ]);
});

await test("a material edit by the provider drops both marks", async () => {
  await markListing("authenticated", U_ADMIN, true, true);

  await asRole("authenticated", U_OWNER, (tx) =>
    tx.query("update public.listings set rent_amount = 950000 where id = $1", [L_PUBLIC]),
  );

  const { rows } = await db.query(
    "select verified_at, inspected_at from public.listings where id = $1",
    [L_PUBLIC],
  );
  assertEqual(rows[0].verified_at, null, "a stale verification survived a rent change");
  assertEqual(rows[0].inspected_at, null, "a stale inspection survived a rent change");
});

await test("a cosmetic edit keeps the marks", async () => {
  await markListing("authenticated", U_ADMIN, true, false);

  await asRole("authenticated", U_OWNER, (tx) =>
    tx.query("update public.listings set description = description || ' Now with a new coat of paint.' where id = $1", [
      L_PUBLIC,
    ]),
  );

  const { rows } = await db.query(
    "select verified_at from public.listings where id = $1",
    [L_PUBLIC],
  );
  assert(rows[0].verified_at, "a description change dropped the verification");
});

await test("an administrator can clear the marks again", async () => {
  await markListing("authenticated", U_ADMIN, true, true);
  const cleared = await markListing("authenticated", U_ADMIN, false, false);
  assertEqual(cleared.rows[0].verified_at, null, "the verification was not cleared");
  assertEqual(cleared.rows[0].inspected_at, null, "the inspection was not cleared");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}
