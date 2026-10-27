/**
 * Verification for account photo storage and self-service account deletion.
 *
 * Applies the real migration files to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins, then exercises delete_own_account() exactly as
 * three callers: unauthenticated, authenticated with the wrong confirmation,
 * authenticated with an open paid booking, and authenticated after cancelling.
 * Nothing here touches the live project, which is why the destructive path can
 * be tested at all.
 *
 * The web-push migration is skipped: it creates the `pg_net` extension, which
 * PGlite does not ship, and it is unrelated to these rules.
 *
 * Usage: bun run test:account
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
const U_DEMO_OWNER = "00000000-0000-4000-8000-000000000025";

const P_PROVIDER = "11111111-1111-4111-8111-000000000021";
const L_LISTING = "aaaaaaaa-aaaa-4aaa-8aaa-000000000021";
const G_BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-000000000021";

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
    owner uuid,
    owner_id uuid
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
    ('${U_ADMIN}', 'admin@example.test'),
    ('${U_DEMO_OWNER}', 'demo@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_STUDENT}', 'Student'),
    ('${U_OTHER}', 'Other Student'),
    ('${U_DEMO_OWNER}', 'Demo Owner');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Account verification');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_PROVIDER}', '${U_PROVIDER}', 'landlord', 'Account Court');

  insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by) values
    ('${P_PROVIDER}', 'approved', 'Approved for account verification.', '${U_ADMIN}');

  insert into public.listings
    (id, provider_id, title, description, accommodation_type, city, rent_amount,
     rent_period, availability_status, publication_status)
  values
    ('${L_LISTING}', '${P_PROVIDER}', 'Room used for the account test',
     'A room that exists only so a booking can reference it.', 'private_room', 'Lagos',
     500000.00, 'year', 'available', 'published');

  insert into public.booking_groups
    (id, listing_id, room_number, created_by, total_amount, currency, status)
  values
    ('${G_BOOKING}', '${L_LISTING}', 1, '${U_STUDENT}', 500000.00, 'NGN', 'paid');

  insert into public.booking_group_members
    (group_id, user_id, member_order, share_amount, paid_at, status)
  values
    ('${G_BOOKING}', '${U_STUDENT}', 0, 250000.00, now(), 'joined'),
    ('${G_BOOKING}', '${U_OTHER}', 1, 250000.00, now(), 'joined');
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

/** Runs fn with the given Postgres role and JWT subject, in its own transaction. */
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

async function userExists(id) {
  const { rows } = await db.query("select 1 from auth.users where id = $1", [id]);
  return rows.length === 1;
}

async function boot() {
  await db.exec(BOOTSTRAP);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && !SKIP_MIGRATIONS.has(file))
    .sort();

  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  await db.exec(SEED);
}

await boot();

await test("account migration creates the private avatars bucket", async () => {
  const { rows } = await db.query(
    "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'",
  );
  assert(rows.length === 1, "avatars bucket is missing");
  assert(rows[0].public === false, "avatars bucket must be private");
  assert(Number(rows[0].file_size_limit) === 5242880, "avatars bucket size limit is wrong");
  assert(
    rows[0].allowed_mime_types.join(",") === "image/jpeg,image/png,image/webp",
    "avatars bucket mime types are wrong",
  );
});

await test("avatars policies cover read, insert, update and delete", async () => {
  const { rows } = await db.query(
    `select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%'
     order by policyname`,
  );
  assert(
    rows.map((row) => row.policyname).join(",") ===
      "avatars_delete_own,avatars_insert_own,avatars_read_authenticated,avatars_update_own",
    "unexpected avatars policy set",
  );
});

await test("profile photos may only point at the account's own folder", async () => {
  await expectError(
    () =>
      db.query("update public.profiles set avatar_url = $1 where id = $2", [
        "someone-else/avatar.jpg",
        U_STUDENT,
      ]),
    "23514",
    "foreign avatar path",
  );

  await db.query("update public.profiles set avatar_url = $1 where id = $2", [
    `${U_STUDENT}/avatar-1.jpg`,
    U_STUDENT,
  ]);
  const { rows } = await db.query("select avatar_url from public.profiles where id = $1", [
    U_STUDENT,
  ]);
  assert(rows[0].avatar_url === `${U_STUDENT}/avatar-1.jpg`, "own avatar path was not saved");
});

await test("delete_own_account is SECURITY DEFINER and authenticated-only", async () => {
  const { rows } = await db.query(
    `select p.prosecdef,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can,
            has_function_privilege('anon', p.oid, 'execute') as anon_can
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'delete_own_account'`,
  );
  assert(rows.length === 1, "delete_own_account() is missing");
  assert(rows[0].prosecdef === true, "delete_own_account() must run as its owner");
  assert(rows[0].authenticated_can === true, "authenticated must be able to call it");
  assert(rows[0].anon_can === false, "anon must not be able to call it");
});

await test("an unauthenticated caller cannot delete an account", async () => {
  await expectError(
    () => db.query("select public.delete_own_account('DELETE')"),
    "42501",
    "unauthenticated deletion",
  );
  assert(await userExists(U_STUDENT), "the student was deleted without a session");
});

await test("the wrong confirmation string is refused", async () => {
  await expectError(
    () =>
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.query("select public.delete_own_account('delete')"),
      ),
    "22023",
    "wrong confirmation",
  );
  assert(await userExists(U_STUDENT), "the student was deleted without typing DELETE");
});

await test("an open paid booking blocks deletion", async () => {
  await expectError(
    () =>
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.query("select public.delete_own_account('DELETE')"),
      ),
    "P0001",
    "paid booking",
  );
  assert(await userExists(U_STUDENT), "the student was deleted with a paid booking open");

  const { rows } = await db.query(
    "select 1 from public.booking_group_members where group_id = $1",
    [G_BOOKING],
  );
  assert(rows.length === 2, "the booking was altered by a refused deletion");
});

await test("a cancelled booking allows deletion, cascading the account's rows", async () => {
  await db.query("update public.booking_groups set status = 'cancelled' where id = $1", [
    G_BOOKING,
  ]);
  await db.query(
    "insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)",
    [`${U_STUDENT}/avatar-1.jpg`, U_STUDENT],
  );

  await asRole("authenticated", U_STUDENT, (tx) =>
    tx.query("select public.delete_own_account('DELETE')"),
  );

  assert(!(await userExists(U_STUDENT)), "the auth user survived deletion");
  assert(await userExists(U_OTHER), "another account was deleted");

  const { rows: profiles } = await db.query("select 1 from public.profiles where id = $1", [
    U_STUDENT,
  ]);
  assert(profiles.length === 0, "the profile row survived the cascade");

  const { rows: members } = await db.query(
    "select 1 from public.booking_group_members where user_id = $1",
    [U_STUDENT],
  );
  assert(members.length === 0, "the booking membership survived the cascade");

  const { rows: objects } = await db.query(
    "select 1 from storage.objects where bucket_id = 'avatars' and name like $1",
    [`${U_STUDENT}/%`],
  );
  assert(objects.length === 0, "the account's avatar object row was left behind");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
await db.close();
