/**
 * Local verification for the Phase 2B listings foundation.
 *
 * Applies the real migration files to an in-process PostgreSQL (PGlite) with
 * minimal Supabase stand-ins (anon/authenticated roles, auth.uid(), storage
 * tables/foldername), then exercises RLS, column grants, admin authorisation,
 * constraints, triggers and Storage policies as each real role.
 *
 * This proves behaviour against the migration SQL. It is NOT a live Supabase
 * test: PostgREST, the Storage HTTP layer, Auth JWT issuance and the deployed
 * database are still unverified.
 *
 * Usage: bun run test:db
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const U_STUDENT = "00000000-0000-4000-8000-000000000001";
const U_PROVIDER_A = "00000000-0000-4000-8000-000000000002";
const U_PROVIDER_B = "00000000-0000-4000-8000-000000000003";
const U_PROVIDER_PENDING = "00000000-0000-4000-8000-000000000004";
const U_PROVIDER_SUSPENDED = "00000000-0000-4000-8000-000000000005";
const U_PROVIDER_REJECTED = "00000000-0000-4000-8000-000000000006";
const U_ADMIN = "00000000-0000-4000-8000-000000000007";
const U_ADMIN_PROVIDER = "00000000-0000-4000-8000-000000000008";

const P_A = "11111111-1111-4111-8111-111111111111";
const P_B = "11111111-1111-4111-8111-222222222222";
const P_PENDING = "11111111-1111-4111-8111-333333333333";
const P_SUSPENDED = "11111111-1111-4111-8111-444444444444";
const P_REJECTED = "11111111-1111-4111-8111-555555555555";
const P_ADMIN = "11111111-1111-4111-8111-666666666666";

const L_PUBLISHED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const L_DRAFT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const L_ARCHIVED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const L_HIDDEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const L_FLAGGED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const L_OTHER_PUBLISHED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6";
const L_OTHER_DRAFT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7";
const L_SUSPENDED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8";
const L_PENDING_PROVIDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
const L_REJECTED_PROVIDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";

const imagePath = (provider, listing, file) => `${provider}/${listing}/${file}`;

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text unique not null
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $fn$
    select nullif(
      coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
        current_setting('request.jwt.claim.sub', true)
      ),
      ''
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
    ('${U_STUDENT}', 'student@example.test'),
    ('${U_PROVIDER_A}', 'provider-a@example.test'),
    ('${U_PROVIDER_B}', 'provider-b@example.test'),
    ('${U_PROVIDER_PENDING}', 'provider-pending@example.test'),
    ('${U_PROVIDER_SUSPENDED}', 'provider-suspended@example.test'),
    ('${U_PROVIDER_REJECTED}', 'provider-rejected@example.test'),
    ('${U_ADMIN}', 'admin@example.test'),
    ('${U_ADMIN_PROVIDER}', 'admin-provider@example.test');

  insert into public.profiles (id, display_name) values
    ('${U_PROVIDER_A}', 'Ade Provider');

  insert into public.admin_users (user_id, granted_by, note) values
    ('${U_ADMIN}', '${U_ADMIN}', 'Seed administrator'),
    ('${U_ADMIN_PROVIDER}', '${U_ADMIN}', 'Administrator who also owns a provider');

  insert into public.providers (id, owner_id, kind, display_name) values
    ('${P_A}', '${U_PROVIDER_A}', 'landlord', 'Ade Court'),
    ('${P_B}', '${U_PROVIDER_B}', 'agent', 'Bola Homes'),
    ('${P_PENDING}', '${U_PROVIDER_PENDING}', 'landlord', 'Pending Rooms'),
    ('${P_SUSPENDED}', '${U_PROVIDER_SUSPENDED}', 'agent', 'Suspended Lets'),
    ('${P_REJECTED}', '${U_PROVIDER_REJECTED}', 'landlord', 'Rejected Rooms'),
    ('${P_ADMIN}', '${U_ADMIN_PROVIDER}', 'agent', 'Admin Own Lets');

  insert into public.provider_reviews
    (provider_id, decision, provider_note, internal_note, evidence_references, reviewed_by)
  values
    ('${P_A}', 'approved', 'Approved to list on QUARTERS.', 'Identity note checked.', array['evidence/a.pdf'], '${U_ADMIN}'),
    ('${P_B}', 'approved', 'Approved to list on QUARTERS.', null, '{}', '${U_ADMIN}'),
    ('${P_SUSPENDED}', 'approved', 'Approved to list on QUARTERS.', null, '{}', '${U_ADMIN}'),
    ('${P_SUSPENDED}', 'suspended', 'Publishing suspended pending review.', 'Repeated complaints.', '{}', '${U_ADMIN}'),
    ('${P_REJECTED}', 'rejected', 'Application rejected: ownership could not be confirmed.', 'No property evidence supplied.', '{}', '${U_ADMIN}');

  insert into public.listings
    (id, provider_id, title, description, accommodation_type, institution, city,
     neighbourhood, rent_amount, rent_period, availability_status, bedrooms,
     bathrooms, facilities, publication_status)
  values
    ('${L_PUBLISHED}', '${P_A}', 'Sunlit self-contained in Akoka',
     'A bright self-contained studio five minutes from the campus gate.',
     'self_contained', 'University of Lagos', 'Lagos', 'Akoka', 75000.00, 'month',
     'available', 1, 1, array['Wi-Fi', 'Water'], 'published'),
    ('${L_DRAFT}', '${P_A}', 'Quiet room in Yaba',
     'A quiet private room in a shared flat within walking distance of the tech hub.',
     'private_room', 'University of Lagos', 'Lagos', 'Yaba', 45000.00, 'month',
     'available', 1, null, array['Wi-Fi'], 'draft'),
    ('${L_ARCHIVED}', '${P_A}', 'Retired room in Gbagada',
     'An older listing the provider has retired from the public catalogue.',
     'private_room', null, 'Lagos', 'Gbagada', 60000.00, 'month',
     'unavailable', 1, 1, '{}', 'published'),
    ('${L_HIDDEN}', '${P_A}', 'Hidden room in Surulere',
     'A published listing that an administrator has hidden pending a report.',
     'private_room', null, 'Lagos', 'Surulere', 40000.00, 'month',
     'available', 1, 1, '{}', 'published'),
    ('${L_FLAGGED}', '${P_A}', 'Flagged room in Mushin',
     'A visible listing with an open moderation flag about its rent.',
     'private_room', null, 'Lagos', 'Mushin', 35000.00, 'month',
     'available', 1, 1, '{}', 'published'),
    ('${L_OTHER_PUBLISHED}', '${P_B}', 'Shared apartment in Ikeja',
     'A shared apartment close to the bus terminal and local markets.',
     'shared_room', 'Lagos State University', 'Lagos', 'Ikeja', 30000.00, 'month',
     'limited', null, 2, array['Wi-Fi', 'Security'], 'published'),
    ('${L_OTHER_DRAFT}', '${P_B}', 'Draft flat in Lekki',
     'A draft listing the second provider has not published yet.',
     'apartment', null, 'Lagos', 'Lekki', 200000.00, 'year',
     'available', 2, 2, '{}', 'draft'),
    ('${L_SUSPENDED}', '${P_SUSPENDED}', 'Rooms in Agege',
     'A listing that was published before its provider was suspended.',
     'private_room', null, 'Lagos', 'Agege', 25000.00, 'month',
     'available', 1, 1, '{}', 'published'),
    ('${L_PENDING_PROVIDER}', '${P_PENDING}', 'Pending provider room in Ikorodu',
     'A provider still under review cannot publish this listing.',
     'private_room', null, 'Lagos', 'Ikorodu', 30000.00, 'month',
     'available', 1, 1, '{}', 'draft'),
    ('${L_REJECTED_PROVIDER}', '${P_REJECTED}', 'Rejected provider room in Ajah',
     'A provider whose application was rejected cannot publish this listing.',
     'private_room', null, 'Lagos', 'Ajah', 30000.00, 'month',
     'available', 1, 1, '{}', 'draft');

  update public.listings set publication_status = 'archived' where id = '${L_ARCHIVED}';

  insert into public.listing_addresses (listing_id, address_line, landmark) values
    ('${L_PUBLISHED}', '12 St Finbarr Road, Akoka', 'Beside the second gate'),
    ('${L_DRAFT}', '5 Herbert Macaulay Way, Yaba', null),
    ('${L_HIDDEN}', '8 Bode Thomas Street, Surulere', null),
    ('${L_OTHER_PUBLISHED}', '4 Allen Avenue, Ikeja', 'Opposite the filling station');

  insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover) values
    ('${L_PUBLISHED}', '${imagePath(P_A, L_PUBLISHED, "cover.jpg")}', 'Front of the building', 0, true),
    ('${L_PUBLISHED}', '${imagePath(P_A, L_PUBLISHED, "room.jpg")}', 'The main room', 1, false),
    ('${L_DRAFT}', '${imagePath(P_A, L_DRAFT, "room.jpg")}', 'Draft room', 0, true),
    ('${L_ARCHIVED}', '${imagePath(P_A, L_ARCHIVED, "room.jpg")}', 'Retired room', 0, true),
    ('${L_HIDDEN}', '${imagePath(P_A, L_HIDDEN, "room.jpg")}', 'Hidden room', 0, true),
    ('${L_FLAGGED}', '${imagePath(P_A, L_FLAGGED, "room.jpg")}', 'Flagged room', 0, true),
    ('${L_OTHER_PUBLISHED}', '${imagePath(P_B, L_OTHER_PUBLISHED, "cover.jpg")}', 'Shared lounge', 0, true),
    ('${L_OTHER_DRAFT}', '${imagePath(P_B, L_OTHER_DRAFT, "room.jpg")}', 'Draft lounge', 0, true),
    ('${L_SUSPENDED}', '${imagePath(P_SUSPENDED, L_SUSPENDED, "room.jpg")}', 'Agege room', 0, true),
    ('${L_PENDING_PROVIDER}', '${imagePath(P_PENDING, L_PENDING_PROVIDER, "room.jpg")}', 'Pending room', 0, true),
    ('${L_REJECTED_PROVIDER}', '${imagePath(P_REJECTED, L_REJECTED_PROVIDER, "room.jpg")}', 'Rejected room', 0, true);

  insert into storage.objects (bucket_id, name) values
    ('listing-images', '${imagePath(P_A, L_PUBLISHED, "cover.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_PUBLISHED, "room.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_DRAFT, "room.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_ARCHIVED, "room.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_HIDDEN, "room.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_FLAGGED, "room.jpg")}'),
    ('listing-images', '${imagePath(P_B, L_OTHER_PUBLISHED, "cover.jpg")}'),
    ('listing-images', '${imagePath(P_B, L_OTHER_DRAFT, "room.jpg")}'),
    ('listing-images', '${imagePath(P_SUSPENDED, L_SUSPENDED, "room.jpg")}'),
    ('listing-images', '${imagePath(P_PENDING, L_PENDING_PROVIDER, "room.jpg")}'),
    ('listing-images', '${imagePath(P_REJECTED, L_REJECTED_PROVIDER, "room.jpg")}'),
    ('listing-images', '${imagePath(P_A, L_DRAFT, "orphan.jpg")}');
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
        ? [error.message, error.code && `SQLSTATE ${error.code}`, error.detail, error.hint]
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

async function act(tx, role, subject) {
  await tx.exec(`set local role ${role}`);
  await tx.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(subject ? { sub: subject, role } : {}),
  ]);
}

async function asRole(role, subject, fn, mode = "commit") {
  let result;
  try {
    await db.transaction(async (tx) => {
      await act(tx, role, subject);
      result = await fn(tx);
      if (mode === "rollback") throw { __rollback: true };
    });
  } catch (error) {
    if (!error || error.__rollback !== true) throw error;
  }
  return result;
}

async function withTx(fn, mode = "commit") {
  let result;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx, (role, subject) => act(tx, role, subject));
      if (mode === "rollback") throw { __rollback: true };
    });
  } catch (error) {
    if (!error || error.__rollback !== true) throw error;
  }
  return result;
}

/**
 * Asserts that PostgreSQL denied the statement with an authorisation SQLSTATE
 * (42501 by default), so a constraint or unrelated execution error cannot be
 * mistaken for an access-control success.
 */
async function expectDenied(promise, label, codes = ["42501"]) {
  try {
    await promise;
  } catch (error) {
    const code = error?.code ?? error?.sqlState ?? "unknown";
    if (!codes.includes(code)) {
      throw new Error(`${label}: denied with unexpected SQLSTATE ${code}: ${error.message}`);
    }
    return error;
  }
  throw new Error(`${label}: expected PostgreSQL to deny the statement`);
}

async function listingIds(tx) {
  const { rows } = await tx.query("select id from public.listings order by id");
  return rows.map((row) => row.id);
}

async function reviewState(tx, listingId) {
  const { rows } = await tx.query("select * from public.admin_listing_review_state($1)", [listingId]);
  return rows[0];
}

async function restoreListing(tx, listingId, revision, reason, providerNote = null) {
  const { rows } = await tx.query(
    "select * from public.admin_restore_listing($1, $2, $3, $4)",
    [listingId, revision, reason, providerNote],
  );
  return rows[0];
}

async function objectNames(tx) {
  const { rows } = await tx.query(
    "select name from storage.objects where bucket_id = 'listing-images' order by name",
  );
  return rows.map((row) => row.name);
}

async function countRows(tx, table) {
  const { rows } = await tx.query(`select 1 from public.${table}`);
  return rows.length;
}

async function boot() {
  await db.exec(BOOTSTRAP);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
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

  // Seed two administrator actions through the real function so the initial
  // state includes genuine audit history.
  await asRole("authenticated", U_ADMIN, async (tx) => {
    await tx.query(
      "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
      [L_HIDDEN, "hide", "Safety review after a report.", "Listing hidden while we review a report."],
    );
    await tx.query(
      "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
      [L_FLAGGED, "flag", "Rent appears inconsistent with the provider profile.", "Please confirm the rent amount."],
    );
  });
}

await boot();

// ---------------------------------------------------------------------------
// Anonymous / public reads
// ---------------------------------------------------------------------------

await test("public sees only published, approved-provider, visible listings", async () => {
  const visible = await asRole("anon", null, listingIds);
  assertEqual(visible.sort(), [L_PUBLISHED, L_FLAGGED, L_OTHER_PUBLISHED].sort());
});

await test("a moderation flag does not hide a listing", async () => {
  const ids = await asRole("anon", null, listingIds);
  assert(ids.includes(L_FLAGGED), "flagged listing should still be public");
  const state = await asRole("authenticated", U_ADMIN, async (tx) => {
    const { rows } = await tx.query(
      "select moderation_status, visibility from public.listing_administration where listing_id = $1",
      [L_FLAGGED],
    );
    return rows[0];
  });
  assertEqual(state.moderation_status, "flagged");
  assertEqual(state.visibility, "visible");
});

await test("public cannot see drafts, hidden, archived or suspended-provider listings", async () => {
  const ids = await asRole("anon", null, listingIds);
  for (const hidden of [L_DRAFT, L_HIDDEN, L_ARCHIVED, L_SUSPENDED, L_PENDING_PROVIDER, L_REJECTED_PROVIDER]) {
    assert(!ids.includes(hidden), `${hidden} must not be public`);
  }
});

await test("public sees only approved providers", async () => {
  const rows = await asRole("anon", null, async (tx) => {
    const { rows } = await tx.query("select id, status from public.providers order by id");
    return rows;
  });
  assertEqual(
    rows.map((row) => row.id).sort(),
    [P_A, P_B].sort(),
  );
  assert(rows.every((row) => row.status === "approved"));
});

await test("public cannot read providers.owner_id", async () => {
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select owner_id from public.providers limit 1")),
    "anon owner_id",
  );
});

await test("public cannot read addresses, administration or event history", async () => {
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select * from public.listing_addresses")),
    "anon addresses",
  );
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select * from public.listing_administration")),
    "anon administration",
  );
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select * from public.listing_moderation_events")),
    "anon moderation events",
  );
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select * from public.listing_publication_events")),
    "anon publication events",
  );
  await expectDenied(
    asRole("anon", null, (tx) => tx.query("select * from public.provider_reviews")),
    "anon provider reviews",
  );
});

await test("public sees images only for currently visible listings", async () => {
  const rows = await asRole("anon", null, async (tx) => {
    const { rows } = await tx.query("select listing_id from public.listing_images order by listing_id");
    return rows;
  });
  const ids = rows.map((row) => row.listing_id).sort();
  assertEqual(
    ids,
    [L_PUBLISHED, L_PUBLISHED, L_FLAGGED, L_OTHER_PUBLISHED].sort(),
  );

  const names = await asRole("anon", null, objectNames);
  assertEqual(names.length, 4);
  assert(names.every((name) => !name.includes(L_DRAFT) && !name.includes(L_HIDDEN) && !name.includes(L_ARCHIVED)));
});

await test("public cannot upload, replace or delete storage objects", async () => {
  await expectDenied(
    asRole("anon", null, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name) values ('listing-images', '${imagePath(P_A, L_DRAFT, "anon.jpg")}')`,
      ),
    ),
    "anon storage insert",
  );
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

await test("a student reads public listings only and cannot create or modify them", async () => {
  const ids = await asRole("authenticated", U_STUDENT, listingIds);
  assertEqual(ids.sort(), [L_PUBLISHED, L_FLAGGED, L_OTHER_PUBLISHED].sort());

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.listings (provider_id, title, accommodation_type, city, publication_status)
         values ('${P_A}', 'Student listing', 'private_room', 'Lagos', 'published')`,
      ),
    ),
    "student listing insert",
  );

  const changed = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query(
      "update public.listings set title = 'Hijacked' where id = $1 returning id",
      [L_PUBLISHED],
    );
    return rows.length;
  });
  assertEqual(changed, 0);

  const deleted = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query("delete from public.listings where id = $1 returning id", [L_PUBLISHED]);
    return rows.length;
  });
  assertEqual(deleted, 0);
});

await test("a student cannot read private records or self-grant provider/admin status", async () => {
  const counts = await asRole("authenticated", U_STUDENT, async (tx) => ({
    addresses: await countRows(tx, "listing_addresses"),
    administration: await countRows(tx, "listing_administration"),
    moderation: await countRows(tx, "listing_moderation_events"),
    publication: await countRows(tx, "listing_publication_events"),
    content: await countRows(tx, "listing_content_events"),
    reviews: await countRows(tx, "provider_reviews"),
  }));
  assertEqual(counts.addresses, 0);
  assertEqual(counts.administration, 0);
  assertEqual(counts.moderation, 0);
  assertEqual(counts.publication, 0);
  assertEqual(counts.content, 0);
  assertEqual(counts.reviews, 0);

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.providers (owner_id, kind, display_name, status)
         values ('${U_STUDENT}', 'landlord', 'Self Approved', 'approved')`,
      ),
    ),
    "student provider insert",
  );

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(`insert into public.admin_users (user_id) values ('${U_STUDENT}')`),
    ),
    "student admin insert",
  );

  const isAdmin = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query("select public.is_admin() as value");
    return rows[0].value;
  });
  assertEqual(isAdmin, false);
});

await test("a student cannot upload or delete storage objects", async () => {
  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name) values ('listing-images', '${imagePath(P_A, L_DRAFT, "student.jpg")}')`,
      ),
    ),
    "student storage insert",
  );

  const deleted = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query(
      "delete from storage.objects where name = $1 returning id",
      [imagePath(P_A, L_PUBLISHED, "cover.jpg")],
    );
    return rows.length;
  });
  assertEqual(deleted, 0);
});

// ---------------------------------------------------------------------------
// Approved provider publishing workflow
// ---------------------------------------------------------------------------

await test("an approved provider publishes immediately and drafts stay private", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      // PGlite 0.5 mis-evaluates INSERT ... RETURNING with RLS policies, so the
      // row is read back with a normal SELECT. Live Supabase must still verify
      // the PostgREST insert-with-representation path.
      await tx.query(
        `insert into public.listings
           (provider_id, title, description, accommodation_type, city, rent_amount,
            rent_period, publication_status)
         values ('${P_A}', 'Newly published room in Akoka', 'A new room that is published immediately by its approved provider.', 'private_room', 'Lagos', 50000, 'month', 'published')`,
      );
      const inserted = await tx.query(
        "select id, publication_status, first_published_at from public.listings where provider_id = $1::uuid and title = $2",
        [P_A, "Newly published room in Akoka"],
      );
      const newId = inserted.rows[0].id;
      assertEqual(inserted.rows[0].publication_status, "published");
      assert(inserted.rows[0].first_published_at, "first publication should be stamped");
      const initialEvent = await tx.query(
        "select from_status, to_status from public.listing_publication_events where listing_id = $1 order by id",
        [newId],
      );
      assertEqual(initialEvent.rows, [{ from_status: "draft", to_status: "published" }]);

      await as("anon", null);
      const publicIds = await listingIds(tx);
      assert(publicIds.includes(newId), "new published listing should be public immediately");

      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        `insert into public.listings
           (provider_id, title, description, accommodation_type, city, rent_amount,
            rent_period, publication_status)
         values ($1::uuid, $2, $3, 'private_room', 'Lagos', 45000, 'month', 'draft')`,
        [P_A, "Private draft room in Akoka", "A draft that is not visible to the public yet."],
      );
      const draft = await tx.query(
        "select id from public.listings where provider_id = $1::uuid and title = $2",
        [P_A, "Private draft room in Akoka"],
      );
      const draftId = draft.rows[0].id;

      await as("anon", null);
      const afterDraft = await listingIds(tx);
      assert(!afterDraft.includes(draftId), "draft must stay private");

      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set publication_status = 'published' where id = $1", [draftId]);

      await as("anon", null);
      const afterPublish = await listingIds(tx);
      assert(afterPublish.includes(draftId), "provider-published draft should become public");
    },
    "rollback",
  );
});

await test("approved providers can edit published content without per-listing approval", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set title = $1, rent_amount = 80000 where id = $2", [
        "Updated sunlit self-contained",
        L_PUBLISHED,
      ]);

      await as("anon", null);
      const { rows } = await tx.query("select title, rent_amount from public.listings where id = $1", [
        L_PUBLISHED,
      ]);
      assertEqual(rows[0].title, "Updated sunlit self-contained");
      assertEqual(Number(rows[0].rent_amount), 80000);
    },
    "rollback",
  );
});

await test("pending, rejected and suspended providers cannot publish", async () => {
  for (const [provider, owner, label] of [
    [P_PENDING, U_PROVIDER_PENDING, "pending"],
    [P_REJECTED, U_PROVIDER_REJECTED, "rejected"],
    [P_SUSPENDED, U_PROVIDER_SUSPENDED, "suspended"],
  ]) {
    await expectDenied(
      asRole("authenticated", owner, (tx) =>
        tx.exec(
          `insert into public.listings
             (provider_id, title, description, accommodation_type, city, rent_amount,
              rent_period, publication_status)
           values ('${provider}', '${label} provider listing', 'This listing must not be created by a non-approved provider.', 'private_room', 'Lagos', 20000, 'month', 'published')`,
        ),
      ),
      `${label} provider publish`,
    );
  }

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.listings
           (provider_id, title, accommodation_type, city, publication_status)
         values ('${P_A}', 'Student listing', 'private_room', 'Lagos', 'published')`,
      ),
    ),
    "student publish for another provider",
  );
});

await test("a suspended provider cannot modify protected listing data or images", async () => {
  const updated = await asRole("authenticated", U_PROVIDER_SUSPENDED, async (tx) => {
    const { rows } = await tx.query(
      "update public.listings set title = 'Suspended edit' where id = $1 returning id",
      [L_SUSPENDED],
    );
    return rows.length;
  });
  assertEqual(updated, 0);

  const deleted = await asRole("authenticated", U_PROVIDER_SUSPENDED, async (tx) => {
    const { rows } = await tx.query("delete from public.listings where id = $1 returning id", [L_SUSPENDED]);
    return rows.length;
  });
  assertEqual(deleted, 0);

  await expectDenied(
    asRole("authenticated", U_PROVIDER_SUSPENDED, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_SUSPENDED}', '${imagePath(P_SUSPENDED, L_SUSPENDED, "new.jpg")}', 3)`,
      ),
    ),
    "suspended image insert",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_SUSPENDED, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_SUSPENDED, L_SUSPENDED, "new.jpg")}')`,
      ),
    ),
    "suspended storage insert",
  );

  const readable = await asRole("authenticated", U_PROVIDER_SUSPENDED, async (tx) => ({
    listings: await countRows(tx, "listings"),
    address: await tx.query("select 1 from public.listing_addresses where listing_id = $1", [L_SUSPENDED]),
    images: await tx.query("select 1 from public.listing_images where listing_id = $1", [L_SUSPENDED]),
    objects: await tx.query("select name from storage.objects where name = $1", [
      imagePath(P_SUSPENDED, L_SUSPENDED, "room.jpg"),
    ]),
    reviews: await tx.query("select decision, provider_note from public.provider_reviews order by id"),
    administration: await tx.query(
      "select visibility, moderation_status from public.listing_administration where listing_id = $1",
      [L_SUSPENDED],
    ),
  }));
  assert(readable.listings >= 1, "suspended provider must still read own listings");
  assertEqual(readable.address.rows.length, 0, "this listing has no address seeded");
  assertEqual(readable.images.rows.length, 1);
  assertEqual(readable.objects.rows.length, 1, "suspended provider must still read own image objects");
  assert(readable.reviews.rows.some((row) => row.decision === "suspended"));
  assertEqual(readable.administration.rows.length, 1, "suspended provider must still read own moderation state");
});

await test("provider suspension hides existing listings and reinstatement restores only visible ones", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'suspended', 'Suspended for review.', $2)`,
        [P_A, U_ADMIN],
      );

      await as("anon", null);
      const duringSuspension = await listingIds(tx);
      assertEqual(duringSuspension, [L_OTHER_PUBLISHED], "only the other provider's listing remains public");

      await as("authenticated", U_PROVIDER_A);
      const own = await listingIds(tx);
      assertEqual(own.length, 6, "provider sees five own listings plus the public one");

      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'approved', 'Reinstated after review.', $2)`,
        [P_A, U_ADMIN],
      );

      await as("anon", null);
      const afterReinstatement = await listingIds(tx);
      assertEqual(
        afterReinstatement.sort(),
        [L_PUBLISHED, L_FLAGGED, L_OTHER_PUBLISHED].sort(),
        "reinstatement restores visible listings only; hidden/archived stay hidden",
      );
    },
    "rollback",
  );
});

await test("an independently hidden listing stays hidden after provider reinstatement", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, reviewed_by)
         values ($1, 'suspended', $2)`,
        [P_A, U_ADMIN],
      );
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Independently hidden during suspension.", "Hidden while we review this property."],
      );
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'approved', 'Reinstated after review.', $2)`,
        [P_A, U_ADMIN],
      );

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "independently hidden listing must stay hidden after reinstatement");
    },
    "rollback",
  );
});

// ---------------------------------------------------------------------------
// Administrator moderation
// ---------------------------------------------------------------------------

await test("administrators can flag and request corrections without hiding a listing", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "flag", "Rent may be inaccurate.", "Please confirm the advertised rent."],
      );

      let state = await tx.query(
        "select moderation_status, visibility from public.listing_administration where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(state.rows[0].moderation_status, "flagged");
      assertEqual(state.rows[0].visibility, "visible");

      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "request_correction", "Correction requested.", "Please correct the rent and photos."],
      );
      state = await tx.query(
        "select moderation_status, visibility from public.listing_administration where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(state.rows[0].moderation_status, "correction_requested");
      assertEqual(state.rows[0].visibility, "visible");

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(ids.includes(L_PUBLISHED), "correction request must not automatically hide the listing");

      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "resolve", "Resolved after correction.", null],
      );
      state = await tx.query(
        "select moderation_status from public.listing_administration where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(state.rows[0].moderation_status, "resolved");
    },
    "rollback",
  );
});

await test("administrators can hide, restore and archive a listing", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Safety concern.", "Hidden while we review a safety report."],
      );

      await as("anon", null);
      let ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "hidden listing must not be public");

      await as("authenticated", U_ADMIN);
      const holdState = await reviewState(tx, L_PUBLISHED);
      assertEqual(holdState.held, true);
      await restoreListing(tx, L_PUBLISHED, holdState.content_revision, "Review complete.", "Restored after review.");

      await as("anon", null);
      ids = await listingIds(tx);
      assert(ids.includes(L_PUBLISHED), "restored published listing should be public again");

      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "archive", "Archived by moderator.", "Listing archived."],
      );
      const archiveState = await reviewState(tx, L_PUBLISHED);
      assertEqual(archiveState.publication_status, "archived");
      const archiveRestore = await restoreListing(
        tx,
        L_PUBLISHED,
        archiveState.content_revision,
        "Visibility restored without republishing.",
      );
      assertEqual(archiveRestore.publication_status, "archived");
      assertEqual(archiveRestore.publicly_visible, false);

      await as("anon", null);
      ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "restoring visibility must not republish an archived listing");
      const archivedObject = await tx.query("select 1 from storage.objects where name = $1", [
        imagePath(P_A, L_PUBLISHED, "cover.jpg"),
      ]);
      assertEqual(archivedObject.rows.length, 0, "archived listing images stay private after hold clearance");
    },
    "rollback",
  );
});

await test("an administrative archive cannot be bypassed by provider republishing", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "archive", "Archived for a policy breach.", null],
      );

      await as("authenticated", U_PROVIDER_A);

      // Both direct republishing and the archived -> draft -> published
      // two-step are blocked by the transition trigger.
      await tx.exec("savepoint archived_republish");
      await expectDenied(
        tx.query(
          "update public.listings set publication_status = 'published' where id = $1 returning id",
          [L_PUBLISHED],
        ),
        "archived to published",
        ["42501"],
      );
      await tx.exec("rollback to savepoint archived_republish");

      await tx.exec("savepoint archived_to_draft");
      await expectDenied(
        tx.query(
          "update public.listings set publication_status = 'draft' where id = $1 returning id",
          [L_PUBLISHED],
        ),
        "archived to draft",
        ["42501"],
      );
      await tx.exec("rollback to savepoint archived_to_draft");

      const archived = await tx.query(
        "select publication_status from public.listings where id = $1",
        [L_PUBLISHED],
      );
      assertEqual(archived.rows[0].publication_status, "archived");

      const visibility = await tx.query(
        "select visibility from public.listing_administration where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(visibility.rows[0].visibility, "hidden", "administrative hold must survive the denied republish attempts");

      // Clearing the hold is not an unarchive. The listing must remain archived,
      // and ordinary clients still cannot republish it afterwards.
      await as("authenticated", U_ADMIN);
      let state = await reviewState(tx, L_PUBLISHED);
      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        state.content_revision,
        "Reviewed the archive state; keep it archived.",
      );
      assertEqual(restored.visibility, "visible");
      assertEqual(restored.publication_status, "archived");
      assertEqual(restored.publicly_visible, false);

      await as("authenticated", U_PROVIDER_A);
      await tx.exec("savepoint archived_after_restore");
      await expectDenied(
        tx.query(
          "update public.listings set publication_status = 'published' where id = $1 returning id",
          [L_PUBLISHED],
        ),
        "archived to published after hold clearance",
        ["42501"],
      );
      await tx.exec("rollback to savepoint archived_after_restore");

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "archived listing must remain out of public Explore");
    },
    "rollback",
  );
});

await test("a hold keeps Explore and Storage private until the reviewed revision is restored", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Correction review.", "Please correct the title, address and photos."],
      );

      let state = await reviewState(tx, L_PUBLISHED);
      assertEqual(state.held, true);
      assertEqual(state.publicly_visible, false);

      await as("authenticated", U_PROVIDER_A);
      const feedback = await tx.query(
        `select provider_note from public.listing_moderation_events
         where listing_id = $1 and action = 'hide'
         order by id desc limit 1`,
        [L_PUBLISHED],
      );
      assertEqual(feedback.rows[0].provider_note, "Please correct the title, address and photos.");

      await as("anon", null);
      let ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "held listing must be absent from Explore");
      const hiddenObject = await tx.query("select 1 from storage.objects where name = $1", [
        imagePath(P_A, L_PUBLISHED, "cover.jpg"),
      ]);
      assertEqual(hiddenObject.rows.length, 0, "held listing images must be denied to anon");
      const hiddenRows = await tx.query("select 1 from public.listing_images where listing_id = $1", [
        L_PUBLISHED,
      ]);
      assertEqual(hiddenRows.rows.length, 0, "held listing image rows must be denied to anon");

      await as("authenticated", U_PROVIDER_A);
      const originalCover = imagePath(P_A, L_PUBLISHED, "cover.jpg");
      const replacementCover = imagePath(P_A, L_PUBLISHED, "cover-replaced.jpg");
      await tx.query("update public.listings set title = $1 where id = $2", [
        "Corrected Akoka title",
        L_PUBLISHED,
      ]);
      await tx.query("update public.listing_addresses set landmark = $1 where listing_id = $2", [
        "Corrected landmark",
        L_PUBLISHED,
      ]);
      await tx.query(
        "update public.listing_images set alt_text = 'Corrected room photo' where listing_id = $1 and storage_path = $2",
        [L_PUBLISHED, imagePath(P_A, L_PUBLISHED, "room.jpg")],
      );
      await tx.query(
        "update public.listing_images set storage_path = $1 where storage_path = $2",
        [replacementCover, originalCover],
      );
      await tx.query("update storage.objects set name = $1 where name = $2", [
        replacementCover,
        originalCover,
      ]);

      await as("authenticated", U_ADMIN);
      state = await reviewState(tx, L_PUBLISHED);
      assertEqual(state.held, true, "provider corrections must not clear the hold");
      assert(state.content_revision > 0);

      const markerEvents = await tx.query(
        `select changed_fields, previous_values, new_values
         from public.listing_content_events
         where listing_id = $1
           and changed_fields && array['title', 'address', 'images', 'image_storage']::text[]
         order by id`,
        [L_PUBLISHED],
      );
      const labels = markerEvents.rows.flatMap((row) => row.changed_fields);
      assert(labels.includes("title"), "title change is audited");
      assert(labels.includes("address"), "address change is audited");
      assert(labels.includes("images"), "image-row change is audited");
      assert(labels.includes("image_storage"), "Storage-object change is audited");

      const addressEvent = await tx.query(
        `select previous_values, new_values from public.listing_content_events
         where listing_id = $1 and changed_fields @> array['address']::text[]
         order by id desc limit 1`,
        [L_PUBLISHED],
      );
      assertEqual(addressEvent.rows.length, 1);
      assertEqual(Object.keys(addressEvent.rows[0].previous_values).length, 0);
      assertEqual(Object.keys(addressEvent.rows[0].new_values).length, 0);

      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        state.content_revision,
        "Reviewed current title, address and images.",
        "Restored after correction.",
      );
      assertEqual(restored.publicly_visible, true);
      assertEqual(restored.publication_status, "published");
      assertEqual(restored.visibility, "visible");

      await as("anon", null);
      ids = await listingIds(tx);
      assert(ids.includes(L_PUBLISHED), "reviewed listing returns to public Explore");
      const publicObject = await tx.query("select 1 from storage.objects where name = $1", [
        replacementCover,
      ]);
      assertEqual(publicObject.rows.length, 1, "reviewed listing images return to public Storage reads");

      await as("authenticated", U_ADMIN);
      const reviewEvent = await tx.query(
        `select action, review_decision, reviewed_revision, acted_by, reason, provider_note
         from public.admin_listing_moderation_history($1)
         where action = 'restore'
         order by id desc limit 1`,
        [L_PUBLISHED],
      );
      assertEqual(reviewEvent.rows.length, 1);
      assertEqual(reviewEvent.rows[0].review_decision, "approved");
      assertEqual(reviewEvent.rows[0].reviewed_revision, state.content_revision);
      assertEqual(reviewEvent.rows[0].acted_by, U_ADMIN);
      assertEqual(reviewEvent.rows[0].reason, "Reviewed current title, address and images.");
    },
    "rollback",
  );
});

await test("a content change after review makes restoration stale and a failed restore stays hidden", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Stale-review test.", null],
      );
      const reviewed = await reviewState(tx, L_PUBLISHED);

      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set description = $1 where id = $2", [
        "A materially changed description after the review.",
        L_PUBLISHED,
      ]);

      await as("authenticated", U_ADMIN);
      const changed = await reviewState(tx, L_PUBLISHED);
      assert(changed.content_revision > reviewed.content_revision);

      await tx.exec("savepoint stale_restore_attempt");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          reviewed.content_revision,
          "This review is stale.",
          null,
        ]),
        "stale restoration",
        ["40001"],
      );
      await tx.exec("rollback to savepoint stale_restore_attempt");

      const stillHeld = await reviewState(tx, L_PUBLISHED);
      assertEqual(stillHeld.held, true, "a failed restoration must leave the hold in place");
      assertEqual(stillHeld.visibility, "hidden");

      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        stillHeld.content_revision,
        "Reviewed the corrected current revision.",
      );
      assertEqual(restored.publicly_visible, true);
    },
    "rollback",
  );
});

await test("address, image-row and Storage changes each invalidate a held review", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Correction review for all content paths.", null],
      );
      let reviewed = await reviewState(tx, L_PUBLISHED);

      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        "update public.listing_addresses set address_line = $1 where listing_id = $2",
        ["14 St Finbarr Road, Akoka", L_PUBLISHED],
      );

      await as("authenticated", U_ADMIN);
      let changed = await reviewState(tx, L_PUBLISHED);
      assert(changed.content_revision > reviewed.content_revision, "address change must bump the revision");
      await tx.exec("savepoint stale_address_restore");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          reviewed.content_revision,
          "Stale after an address edit.",
          null,
        ]),
        "stale address restoration",
        ["40001"],
      );
      await tx.exec("rollback to savepoint stale_address_restore");

      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        "update public.listing_images set alt_text = $1 where storage_path = $2",
        ["Updated room photo", imagePath(P_A, L_PUBLISHED, "room.jpg")],
      );

      reviewed = changed;
      await as("authenticated", U_ADMIN);
      changed = await reviewState(tx, L_PUBLISHED);
      assert(changed.content_revision > reviewed.content_revision, "image-row change must bump the revision");
      await tx.exec("savepoint stale_image_restore");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          reviewed.content_revision,
          "Stale after an image-row edit.",
          null,
        ]),
        "stale image-row restoration",
        ["40001"],
      );
      await tx.exec("rollback to savepoint stale_image_restore");

      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        "insert into storage.objects (bucket_id, name) values ('listing-images', $1)",
        [imagePath(P_A, L_PUBLISHED, "review-upload.jpg")],
      );

      reviewed = changed;
      await as("authenticated", U_ADMIN);
      changed = await reviewState(tx, L_PUBLISHED);
      assert(changed.content_revision > reviewed.content_revision, "Storage-object change must bump the revision");
      await tx.exec("savepoint stale_storage_restore");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          reviewed.content_revision,
          "Stale after a Storage edit.",
          null,
        ]),
        "stale storage restoration",
        ["40001"],
      );
      await tx.exec("rollback to savepoint stale_storage_restore");

      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        changed.content_revision,
        "Reviewed address, image row and Storage object.",
      );
      assertEqual(restored.publicly_visible, true);
    },
    "rollback",
  );
});

await test("a second restoration attempt is rejected and cannot duplicate approval", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Repeated-restore test.", null],
      );
      const state = await reviewState(tx, L_PUBLISHED);

      const first = await restoreListing(
        tx,
        L_PUBLISHED,
        state.content_revision,
        "First reviewed restoration.",
      );
      assertEqual(first.publicly_visible, true);

      // PGlite is single-connection, so this proves the post-success guard and
      // audit idempotence rather than true two-session interleaving. The staging
      // gate still requires a real two-connection lock-contention test.
      await tx.exec("savepoint duplicate_restore");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          state.content_revision,
          "Attempted second restoration.",
          null,
        ]),
        "second restoration",
        ["23514"],
      );
      await tx.exec("rollback to savepoint duplicate_restore");

      const after = await reviewState(tx, L_PUBLISHED);
      assertEqual(after.held, false);
      assertEqual(after.visibility, "visible");
      assertEqual(after.publicly_visible, true);

      const approvals = await tx.query(
        `select id from public.listing_moderation_events
         where listing_id = $1 and action = 'restore'
         order by id`,
        [L_PUBLISHED],
      );
      assertEqual(approvals.rows.length, 1, "only one restoration approval may be recorded");
    },
    "rollback",
  );
});

await test("a publication-status change during a hold invalidates review and cannot bypass it", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Publication-change review.", null],
      );
      const reviewed = await reviewState(tx, L_PUBLISHED);

      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set publication_status = 'draft' where id = $1", [
        L_PUBLISHED,
      ]);

      await as("authenticated", U_ADMIN);
      const changed = await reviewState(tx, L_PUBLISHED);
      assertEqual(changed.held, true);
      assertEqual(changed.publication_status, "draft");
      assert(changed.content_revision > reviewed.content_revision);

      await tx.exec("savepoint publication_restore_attempt");
      await expectDenied(
        tx.query("select * from public.admin_restore_listing($1, $2, $3, $4)", [
          L_PUBLISHED,
          reviewed.content_revision,
          "Stale publication review.",
          null,
        ]),
        "stale publication restoration",
        ["40001"],
      );
      await tx.exec("rollback to savepoint publication_restore_attempt");

      const stillHeld = await reviewState(tx, L_PUBLISHED);
      assertEqual(stillHeld.visibility, "hidden");
      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        stillHeld.content_revision,
        "Reviewed the draft publication state.",
      );
      assertEqual(restored.visibility, "visible");
      assertEqual(restored.publication_status, "draft");
      assertEqual(restored.publicly_visible, false);

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "a restored draft must not become public");
    },
    "rollback",
  );
});

await test("a suspended provider does not become public when a hold is cleared", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'suspended', 'Suspended while a listing hold is reviewed.', $2)`,
        [P_A, U_ADMIN],
      );
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Hold while the provider is suspended.", null],
      );

      const state = await reviewState(tx, L_PUBLISHED);
      const restored = await restoreListing(
        tx,
        L_PUBLISHED,
        state.content_revision,
        "Reviewed content before reinstatement.",
      );
      assertEqual(restored.visibility, "visible");
      assertEqual(restored.provider_status, "suspended");
      assertEqual(restored.publicly_visible, false);

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(!ids.includes(L_PUBLISHED), "suspended provider listing must stay private after hold clearance");
      const object = await tx.query("select 1 from storage.objects where name = $1", [
        imagePath(P_A, L_PUBLISHED, "cover.jpg"),
      ]);
      assertEqual(object.rows.length, 0, "suspended provider images must stay private after hold clearance");

      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'approved', 'Reinstated after review.', $2)`,
        [P_A, U_ADMIN],
      );
      await as("anon", null);
      const afterReinstatement = await listingIds(tx);
      assert(afterReinstatement.includes(L_PUBLISHED), "reinstatement makes the already-reviewed listing public again");
    },
    "rollback",
  );
});

await test("only administrators can apply moderation actions", async () => {
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "hide", "Provider trying to moderate.", null],
      ),
    ),
    "provider admin action",
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "flag", null, null],
      ),
    ),
    "flag without reason",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "hide", "Missing listing.", null],
      ),
    ),
    "missing listing",
    ["23503"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "resolve", "x", null],
      ),
    ),
    "resolve with short optional reason",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "restore", "Restore must use the dedicated review path.", null],
      ),
    ),
    "generic restore bypass",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_PUBLISHED, "flag", "A provider-visible reason.", ""],
      ),
    ),
    "empty provider note",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query("select * from public.admin_restore_listing($1, 0, 'x', null)", [L_PUBLISHED]),
    ),
    "restore with short reason",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.query(
        "select * from public.admin_restore_listing($1, 0, 'Restoration with an empty note.', '')",
        [L_PUBLISHED],
      ),
    ),
    "restore with empty provider note",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_restore_listing($1, 0, 'Provider restore attempt.', null)", [
        L_PUBLISHED,
      ]),
    ),
    "provider restore RPC",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_listing_review_state($1)", [L_PUBLISHED]),
    ),
    "provider review state RPC",
  );
});

await test("providers cannot modify or erase moderation history", async () => {
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("update public.listing_administration set visibility = 'hidden' where listing_id = $1", [
        L_PUBLISHED,
      ]),
    ),
    "provider administration update",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_moderation_events
           (listing_id, action, moderation_status, visibility, publication_status)
         values ('${L_PUBLISHED}', 'flag', 'flagged', 'visible', 'published')`,
      ),
    ),
    "provider moderation event insert",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec("update public.listing_moderation_events set reason = 'rewritten'"),
    ),
    "provider moderation event update",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec("delete from public.listing_moderation_events"),
    ),
    "provider moderation event delete",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select public.bump_listing_content_revision($1)", [L_PUBLISHED]),
    ),
    "provider revision helper",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query(
        "select public.record_listing_content_change($1, array['title'], '{}'::jsonb, '{}'::jsonb)",
        [L_PUBLISHED],
      ),
    ),
    "provider content helper",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_publication_events (listing_id, from_status, to_status)
         values ('${L_PUBLISHED}', 'draft', 'published')`,
      ),
    ),
    "provider publication event insert",
  );

  const ownHistory = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
    const { rows } = await tx.query(
      "select listing_id, action, moderation_status, provider_note from public.listing_moderation_events order by id",
    );
    return rows;
  });
  assert(ownHistory.length >= 2, "provider can read their own moderation history");
  assert(ownHistory.every((row) => row.listing_id !== L_OTHER_PUBLISHED));
});

await test("administrators can inspect drafts, hidden listings and private records", async () => {
  const counts = await asRole("authenticated", U_ADMIN, async (tx) => ({
    listings: await countRows(tx, "listings"),
    providers: await countRows(tx, "providers"),
    addresses: await countRows(tx, "listing_addresses"),
    images: await countRows(tx, "listing_images"),
    administration: await countRows(tx, "listing_administration"),
    moderation: await countRows(tx, "listing_moderation_events"),
    publication: await countRows(tx, "listing_publication_events"),
    content: await countRows(tx, "listing_content_events"),
    reviews: await countRows(tx, "provider_reviews"),
    objects: (await tx.query("select name from storage.objects")).rows.length,
  }));
  assertEqual(counts.listings, 10);
  assertEqual(counts.providers, 6);
  assertEqual(counts.addresses, 4);
  assertEqual(counts.images, 11);
  assertEqual(counts.administration, 10);
  assertEqual(counts.moderation, 2);
  assertEqual(counts.publication, 7);
  assert(counts.content >= 27, "address, image-row and Storage-object changes are audited");
  assertEqual(counts.reviews, 5);
  assertEqual(counts.objects, 12);

  const draft = await asRole("authenticated", U_ADMIN, async (tx) => {
    const address = await tx.query("select 1 from public.listing_addresses where listing_id = $1", [L_DRAFT]);
    const image = await tx.query("select 1 from public.listing_images where listing_id = $1", [L_DRAFT]);
    return { address: address.rows.length, image: image.rows.length };
  });
  assertEqual(draft.address, 1);
  assertEqual(draft.image, 1);
});

await test("provider reviews expose provider-facing columns only and admins get the internal record", async () => {
  const own = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
    const { rows } = await tx.query(
      "select decision, provider_note, reviewed_at from public.provider_reviews",
    );
    return rows;
  });
  assertEqual(own.length, 1);
  assertEqual(own[0].decision, "approved");

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select internal_note from public.provider_reviews"),
    ),
    "provider internal note",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select evidence_references from public.provider_reviews"),
    ),
    "provider evidence",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select reviewed_by from public.provider_reviews"),
    ),
    "provider reviewer id",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.provider_reviews"),
    ),
    "provider review select star",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_provider_review_history($1)", [P_A]),
    ),
    "provider admin review RPC",
  );

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.query("select * from public.admin_provider_review_history($1)", [P_A]),
    ),
    "student admin review RPC",
  );

  const internal = await asRole("authenticated", U_ADMIN, async (tx) => {
    const { rows } = await tx.query("select * from public.admin_provider_review_history($1)", [P_A]);
    return rows;
  });
  assertEqual(internal.length, 1);
  assertEqual(internal[0].internal_note, "Identity note checked.");
  assertEqual(internal[0].reviewed_by, U_ADMIN);
});

await test("ordinary users cannot write provider reviews and admins cannot forge the reviewer", async () => {
  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.provider_reviews (provider_id, decision, reviewed_by)
         values ('${P_PENDING}', 'approved', '${U_STUDENT}')`,
      ),
    ),
    "student review insert",
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.exec(
        `insert into public.provider_reviews (provider_id, decision, reviewed_by)
         values ('${P_PENDING}', 'approved', '${U_PROVIDER_A}')`,
      ),
    ),
    "forged reviewer",
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.exec(
        `insert into public.provider_reviews (provider_id, decision, reviewed_by)
         values ('${P_PENDING}', 'pending', '${U_ADMIN}')`,
      ),
    ),
    "pending decision",
    ["23514"],
  );
});

await test("a provider application can be submitted but not self-approved", async () => {
  await withTx(async (tx, as) => {
    await as("authenticated", U_STUDENT);
    await tx.query(
      `insert into public.providers (owner_id, kind, display_name)
       values ($1::uuid, 'landlord', 'Student Rooms')`,
      [U_STUDENT],
    );
    const inserted = await tx.query(
      "select id, status from public.providers where display_name = $1",
      ["Student Rooms"],
    );
    assertEqual(inserted.rows[0].status, "pending");

    await as("anon", null);
    const publicProviders = await tx.query("select id from public.providers");
    assert(!publicProviders.rows.some((row) => row.id === inserted.rows[0].id), "pending provider is not public");

    await as("authenticated", U_STUDENT);
    const own = await tx.query("select status from public.providers where display_name = $1", ["Student Rooms"]);
    assertEqual(own.rows[0].status, "pending");
  }, "rollback");

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.providers (owner_id, kind, display_name, status)
         values ('${U_STUDENT}', 'landlord', 'Instant Approval', 'approved')`,
      ),
    ),
    "self-approved application",
  );

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.providers (owner_id, kind, display_name, status)
         values ('${U_PROVIDER_A}', 'landlord', 'Someone Else', 'pending')`,
      ),
    ),
    "application for another account",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(`update public.providers set status = 'suspended' where id = '${P_A}'`),
    ),
    "provider self status update",
  );
});

await test("admin approval lets a pending provider publish; rejection does not", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'approved', 'Approved after review.', $2)`,
        [P_PENDING, U_ADMIN],
      );

      const status = await tx.query("select status from public.providers where id = $1", [P_PENDING]);
      assertEqual(status.rows[0].status, "approved");

      await as("authenticated", U_PROVIDER_PENDING);
      await tx.query(
        `insert into public.listings
           (provider_id, title, description, accommodation_type, city, rent_amount,
            rent_period, publication_status)
         values ($1::uuid, 'Approved pending provider room', 'A listing published immediately after approval.', 'private_room', 'Lagos', 25000, 'month', 'published')`,
        [P_PENDING],
      );
      const inserted = await tx.query(
        "select id from public.listings where provider_id = $1::uuid and title = $2",
        [P_PENDING, "Approved pending provider room"],
      );

      await as("anon", null);
      const ids = await listingIds(tx);
      assert(ids.includes(inserted.rows[0].id));
    },
    "rollback",
  );

  await expectDenied(
    withTx(async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        `insert into public.provider_reviews (provider_id, decision, provider_note, reviewed_by)
         values ($1, 'rejected', 'Rejected after review.', $2)`,
        [P_PENDING, U_ADMIN],
      );
      await as("authenticated", U_PROVIDER_PENDING);
      await tx.exec(
        `insert into public.listings
           (provider_id, title, description, accommodation_type, city, rent_amount,
            rent_period, publication_status)
         values ('${P_PENDING}', 'Rejected provider room', 'This provider must not publish.', 'private_room', 'Lagos', 25000, 'month', 'published')`,
      );
    }, "rollback"),
    "rejected provider publish",
  );
});

await test("an administrator cannot review their own provider record", async () => {
  await expectDenied(
    asRole("authenticated", U_ADMIN_PROVIDER, (tx) =>
      tx.exec(
        `insert into public.provider_reviews (provider_id, decision, reviewed_by)
         values ('${P_ADMIN}', 'approved', '${U_ADMIN_PROVIDER}')`,
      ),
    ),
    "self review",
  );
});

// ---------------------------------------------------------------------------
// Publication and deletion history
// ---------------------------------------------------------------------------

await test("providers cannot delete published, archived, hidden or reviewed listings", async () => {
  for (const listing of [L_PUBLISHED, L_ARCHIVED, L_HIDDEN, L_FLAGGED]) {
    const deleted = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
      const { rows } = await tx.query("delete from public.listings where id = $1 returning id", [listing]);
      return rows.length;
    });
    assertEqual(deleted, 0, `${listing} must not be deletable`);
  }

  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set publication_status = 'draft' where id = $1", [L_PUBLISHED]);
      const deleted = await tx.query("delete from public.listings where id = $1 returning id", [L_PUBLISHED]);
      assertEqual(deleted.rows.length, 0, "published history cannot be erased via draft");
    },
    "rollback",
  );
});

await test("an untouched never-published draft can be deleted", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        `insert into public.listings
           (provider_id, title, accommodation_type, city, publication_status)
         values ($1::uuid, 'Untouched deletable draft', 'private_room', 'Lagos', 'draft')`,
        [P_A],
      );
      const inserted = await tx.query(
        "select id from public.listings where provider_id = $1::uuid and title = $2",
        [P_A, "Untouched deletable draft"],
      );
      const draftId = inserted.rows[0].id;

      const deleted = await tx.query("delete from public.listings where id = $1 returning id", [draftId]);
      assertEqual(deleted.rows.length, 1);

      const administration = await tx.query(
        "select 1 from public.listing_administration where listing_id = $1",
        [draftId],
      );
      assertEqual(administration.rows.length, 0, "administration row must cascade from an untouched draft");
    },
    "rollback",
  );
});

await test("a privileged cascade delete does not fail on child lock triggers", async () => {
  await withTx(
    async (tx) => {
      // The service role may still remove a listing outside the client policy.
      // Its cascading child deletes must not raise a false "listing missing"
      // error from the BEFORE lock triggers.
      await tx.query("delete from public.listings where id = $1", [L_DRAFT]);
      const listing = await tx.query("select 1 from public.listings where id = $1", [L_DRAFT]);
      const administration = await tx.query(
        "select 1 from public.listing_administration where listing_id = $1",
        [L_DRAFT],
      );
      assertEqual(listing.rows.length, 0);
      assertEqual(administration.rows.length, 0);
    },
    "rollback",
  );
});

await test("a draft with content audit history cannot be deleted and its events survive", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      const before = await tx.query(
        "select id from public.listing_content_events where listing_id = $1 order by id",
        [L_DRAFT],
      );
      assert(before.rows.length > 0, "seeded draft should have address/image audit events");

      const deleted = await tx.query("delete from public.listings where id = $1 returning id", [L_DRAFT]);
      assertEqual(deleted.rows.length, 0, "content audit history must prevent hard deletion");

      const listing = await tx.query("select 1 from public.listings where id = $1", [L_DRAFT]);
      assertEqual(listing.rows.length, 1);
      const after = await tx.query(
        "select id from public.listing_content_events where listing_id = $1 order by id",
        [L_DRAFT],
      );
      assertEqual(after.rows.length, before.rows.length, "audit events must remain intact");
    },
    "rollback",
  );
});

await test("a draft with moderation history cannot be deleted", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        `insert into public.listings
           (provider_id, title, accommodation_type, city, publication_status)
         values ($1::uuid, 'Flagged draft room', 'private_room', 'Lagos', 'draft')`,
        [P_A],
      );
      const inserted = await tx.query(
        "select id from public.listings where provider_id = $1::uuid and title = $2",
        [P_A, "Flagged draft room"],
      );
      const draftId = inserted.rows[0].id;

      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [draftId, "flag", "Draft needs review.", "Please correct the draft."],
      );

      await as("authenticated", U_PROVIDER_A);
      const deleted = await tx.query("delete from public.listings where id = $1 returning id", [draftId]);
      assertEqual(deleted.rows.length, 0, "moderation history must be preserved");
    },
    "rollback",
  );
});

await test("providers cannot delete each other's drafts", async () => {
  const deleted = await asRole("authenticated", U_PROVIDER_B, async (tx) => {
    const { rows } = await tx.query("delete from public.listings where id = $1 returning id", [L_DRAFT]);
    return rows.length;
  });
  assertEqual(deleted, 0);
});

await test("publication transitions are recorded as history", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query("update public.listings set publication_status = 'archived' where id = $1", [L_PUBLISHED]);

      const events = await tx.query(
        "select from_status, to_status from public.listing_publication_events where listing_id = $1 order by id",
        [L_PUBLISHED],
      );
      assertEqual(events.rows.length, 2);
      assertEqual(events.rows[0].from_status, "draft");
      assertEqual(events.rows[0].to_status, "published");
      assertEqual(events.rows[1].from_status, "published");
      assertEqual(events.rows[1].to_status, "archived");

      await as("authenticated", U_PROVIDER_B);
      const other = await tx.query(
        "select 1 from public.listing_publication_events where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(other.rows.length, 0);
    },
    "rollback",
  );
});

await test("provider history omits administrator identifiers", async () => {
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select acted_by from public.listing_moderation_events limit 1"),
    ),
    "provider acted_by",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select changed_by from public.listing_publication_events limit 1"),
    ),
    "provider changed_by",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select changed_by from public.listing_content_events limit 1"),
    ),
    "provider content actor",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select review_decision from public.listing_moderation_events limit 1"),
    ),
    "provider review decision",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select reviewed_revision from public.listing_moderation_events limit 1"),
    ),
    "provider reviewed revision",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_listing_moderation_history($1)", [L_FLAGGED]),
    ),
    "provider moderation history RPC",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_listing_content_history($1)", [L_PUBLISHED]),
    ),
    "provider content history RPC",
  );

  const allowed = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
    const moderation = await tx.query(
      "select listing_id, action, moderation_status, provider_note, acted_at from public.listing_moderation_events",
    );
    const publication = await tx.query(
      "select listing_id, from_status, to_status, changed_at from public.listing_publication_events",
    );
    return { moderation: moderation.rows, publication: publication.rows };
  });
  assert(allowed.moderation.length >= 1);
  assert(allowed.publication.length >= 1);

  const admin = await asRole("authenticated", U_ADMIN, async (tx) => {
    const moderation = await tx.query(
      "select acted_by from public.admin_listing_moderation_history($1)",
      [L_FLAGGED],
    );
    const publication = await tx.query(
      "select changed_by from public.admin_listing_publication_history($1)",
      [L_PUBLISHED],
    );
    const content = await tx.query(
      "select changed_by, changed_fields from public.admin_listing_content_history($1)",
      [L_PUBLISHED],
    );
    return {
      moderation: moderation.rows,
      publication: publication.rows,
      content: content.rows,
    };
  });
  assert(admin.moderation.length >= 1);
  assertEqual(admin.moderation[0].acted_by, U_ADMIN);
  assert(admin.publication.length >= 1);
  assert(admin.content.length >= 1);

  await withTx(
    async (tx, as) => {
      await as("authenticated", U_ADMIN);
      await tx.query(
        "select public.admin_apply_listing_action($1, $2::public.listing_admin_action, $3, $4)",
        [L_OTHER_PUBLISHED, "archive", "Archived for audit test.", null],
      );
      const rows = await tx.query(
        "select changed_by from public.admin_listing_publication_history($1)",
        [L_OTHER_PUBLISHED],
      );
      assert(rows.rows.some((row) => row.changed_by === U_ADMIN));
    },
    "rollback",
  );
});

await test("material listing content edits are audited and immutable", async () => {
  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      await tx.query(
        "update public.listings set title = $1, rent_amount = $2 where id = $3",
        ["Audited title for the Akoka room", 90000, L_PUBLISHED],
      );

      const events = await tx.query(
        `select changed_fields, previous_values, new_values
         from public.listing_content_events
         where listing_id = $1
           and changed_fields && array['title', 'rent_amount']::text[]
         order by id`,
        [L_PUBLISHED],
      );
      assertEqual(events.rows.length, 1);
      assert(events.rows[0].changed_fields.includes("title"));
      assert(events.rows[0].changed_fields.includes("rent_amount"));
      assertEqual(events.rows[0].previous_values.title, "Sunlit self-contained in Akoka");
      assertEqual(Number(events.rows[0].new_values.rent_amount), 90000);

      await as("authenticated", U_PROVIDER_B);
      const other = await tx.query(
        "select 1 from public.listing_content_events where listing_id = $1",
        [L_PUBLISHED],
      );
      assertEqual(other.rows.length, 0);

      await as("authenticated", U_ADMIN);
      const all = await tx.query(
        "select 1 from public.listing_content_events where listing_id = $1 and changed_fields && array['title', 'rent_amount']::text[]",
        [L_PUBLISHED],
      );
      assertEqual(all.rows.length, 1);
    },
    "rollback",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_content_events
           (listing_id, changed_fields)
         values ('${L_PUBLISHED}', array['title'])`,
      ),
    ),
    "provider content event insert",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec("update public.listing_content_events set changed_fields = array['title']"),
    ),
    "provider content event update",
  );
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec("delete from public.listing_content_events"),
    ),
    "provider content event delete",
  );
});

await test("administrators can read applicant identity; ordinary users cannot", async () => {
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("select * from public.admin_provider_application($1)", [P_A]),
    ),
    "provider application RPC",
  );
  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.query("select * from public.admin_provider_application($1)", [P_A]),
    ),
    "student application RPC",
  );

  const application = await asRole("authenticated", U_ADMIN, async (tx) => {
    const { rows } = await tx.query("select * from public.admin_provider_application($1)", [P_A]);
    return rows;
  });
  assertEqual(application.length, 1);
  assertEqual(application[0].owner_id, U_PROVIDER_A);
  assertEqual(application[0].owner_display_name, "Ade Provider");
});

// ---------------------------------------------------------------------------
// Images and Storage
// ---------------------------------------------------------------------------

await test("DB image rows follow visibility and ownership", async () => {
  const publicRows = await asRole("anon", null, async (tx) => {
    const { rows } = await tx.query("select listing_id from public.listing_images order by listing_id");
    return rows.map((row) => row.listing_id);
  });
  assertEqual(publicRows.length, 4);

  const own = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
    const { rows } = await tx.query("select listing_id from public.listing_images");
    return rows.length;
  });
  assertEqual(own, 7, "six own images plus one public image from the other provider");

  const student = await asRole("authenticated", U_STUDENT, async (tx) => {
    const { rows } = await tx.query("select listing_id from public.listing_images");
    return rows.length;
  });
  assertEqual(student, 4);
});

await test("image paths are validated and cross-provider writes are rejected", async () => {
  await asRole(
    "authenticated",
    U_PROVIDER_A,
    async (tx) => {
      await tx.query(
        "insert into public.listing_images (listing_id, storage_path, position) values ($1, $2, 2)",
        [L_DRAFT, imagePath(P_A, L_DRAFT, "new.jpg")],
      );
    },
    "rollback",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_DRAFT}', '${imagePath(P_B, L_DRAFT, "wrong.jpg")}', 2)`,
      ),
    ),
    "cross-provider image path",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_DRAFT}', '${imagePath(P_A, L_DRAFT, "../escape.jpg")}', 2)`,
      ),
    ),
    "traversal image path",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_OTHER_DRAFT}', '${imagePath(P_B, L_OTHER_DRAFT, "foreign.jpg")}', 2)`,
      ),
    ),
    "image for another listing",
  );

  await expectDenied(
    asRole("authenticated", U_STUDENT, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_DRAFT}', '${imagePath(P_A, L_DRAFT, "student.jpg")}', 2)`,
      ),
    ),
    "student image insert",
  );
});

await test("image position and cover constraints still hold", async () => {
  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position)
         values ('${L_PUBLISHED}', '${imagePath(P_A, L_PUBLISHED, "duplicate.jpg")}', 0)`,
      ),
    ),
    "duplicate image position",
    ["23505"],
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listing_images (listing_id, storage_path, position, is_cover)
         values ('${L_PUBLISHED}', '${imagePath(P_A, L_PUBLISHED, "second-cover.jpg")}', 2, true)`,
      ),
    ),
    "second cover image",
    ["23505"],
  );
});

await test("storage bucket is private with image-only limits", async () => {
  const { rows } = await db.query(
    "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'listing-images'",
  );
  assertEqual(rows.length, 1);
  assertEqual(rows[0].public, false);
  assertEqual(Number(rows[0].file_size_limit), 8388608);
  assertEqual(rows[0].allowed_mime_types.sort(), ["image/jpeg", "image/png", "image/webp"]);
});

await test("storage reads follow publication, ownership and admin roles", async () => {
  const publicNames = await asRole("anon", null, objectNames);
  assertEqual(publicNames.length, 4);
  for (const name of publicNames) {
    assert(
      name.includes(L_PUBLISHED) || name.includes(L_FLAGGED) || name.includes(L_OTHER_PUBLISHED),
      `unexpected public object ${name}`,
    );
  }

  const providerNames = await asRole("authenticated", U_PROVIDER_A, objectNames);
  assertEqual(providerNames.length, 8, "seven own objects plus the other provider's public image");
  assert(providerNames.some((name) => name.includes("orphan.jpg")));

  const studentNames = await asRole("authenticated", U_STUDENT, objectNames);
  assertEqual(studentNames.length, 4);

  const adminNames = await asRole("authenticated", U_ADMIN, objectNames);
  assertEqual(adminNames.length, 12);

  const hiddenRead = await asRole("anon", null, async (tx) => {
    const { rows } = await tx.query("select 1 from storage.objects where name = $1", [
      imagePath(P_A, L_HIDDEN, "room.jpg"),
    ]);
    return rows.length;
  });
  assertEqual(hiddenRead, 0);

  const otherProviderRead = await asRole("authenticated", U_PROVIDER_B, async (tx) => {
    const { rows } = await tx.query("select 1 from storage.objects where name = $1", [
      imagePath(P_A, L_HIDDEN, "room.jpg"),
    ]);
    return rows.length;
  });
  assertEqual(otherProviderRead, 0);

  const adminHiddenRead = await asRole("authenticated", U_ADMIN, async (tx) => {
    const { rows } = await tx.query("select 1 from storage.objects where name = $1", [
      imagePath(P_A, L_HIDDEN, "room.jpg"),
    ]);
    return rows.length;
  });
  assertEqual(adminHiddenRead, 1);
});

await test("restrictive policies stop broad storage policies from widening listing-image access", async () => {
  await db.exec(`
    create policy debug_broad_storage_select on storage.objects
      for select to anon, authenticated using (true);
    create policy debug_broad_storage_insert on storage.objects
      for insert to authenticated with check (true);
    create policy debug_broad_storage_update on storage.objects
      for update to anon, authenticated using (true) with check (true);
    create policy debug_broad_storage_delete on storage.objects
      for delete to anon, authenticated using (true);
    insert into storage.buckets (id, name, public) values ('debug-other', 'debug-other', false);
    insert into storage.objects (bucket_id, name) values ('debug-other', 'debug-other/other.jpg');
    create policy debug_other_read on storage.objects
      for select to anon using (bucket_id = 'debug-other');
  `);

  try {
    const publicNames = await asRole("anon", null, objectNames);
    assertEqual(publicNames.length, 4, "broad select must not expose draft/hidden listing images");

    const unrelated = await asRole("anon", null, async (tx) => {
      const { rows } = await tx.query(
        "select name from storage.objects where bucket_id = 'debug-other'",
      );
      return rows;
    });
    assertEqual(unrelated.length, 1, "restrictive policy must not block unrelated buckets");

    await expectDenied(
      asRole("authenticated", U_STUDENT, (tx) =>
        tx.exec(
          `insert into storage.objects (bucket_id, name)
           values ('listing-images', '${imagePath(P_A, L_DRAFT, "broad-policy.jpg")}')`,
        ),
      ),
      "broad policy student listing-image insert",
    );

    await expectDenied(
      asRole("authenticated", U_PROVIDER_B, (tx) =>
        tx.exec(
          `insert into storage.objects (bucket_id, name)
           values ('listing-images', '${imagePath(P_A, L_DRAFT, "cross-broad.jpg")}')`,
        ),
      ),
      "broad policy cross-provider listing-image insert",
    );

    const anonymousUpdate = await asRole("anon", null, async (tx) => {
      const { rows } = await tx.query(
        "update storage.objects set name = name where name = $1 returning name",
        [imagePath(P_A, L_HIDDEN, "room.jpg")],
      );
      return rows.length;
    });
    assertEqual(anonymousUpdate, 0, "broad update must not let anon touch hidden listing images");

    const studentUpdate = await asRole("authenticated", U_STUDENT, async (tx) => {
      const { rows } = await tx.query(
        "update storage.objects set name = name where name = $1 returning name",
        [imagePath(P_A, L_HIDDEN, "room.jpg")],
      );
      return rows.length;
    });
    assertEqual(studentUpdate, 0, "broad update must not let a student touch listing images");

    const anonymousDelete = await asRole("anon", null, async (tx) => {
      const { rows } = await tx.query(
        "delete from storage.objects where name = $1 returning name",
        [imagePath(P_A, L_HIDDEN, "room.jpg")],
      );
      return rows.length;
    });
    assertEqual(anonymousDelete, 0, "broad delete must not let anon delete listing images");

    const crossProviderDelete = await asRole("authenticated", U_PROVIDER_B, async (tx) => {
      const { rows } = await tx.query(
        "delete from storage.objects where name = $1 returning name",
        [imagePath(P_A, L_HIDDEN, "room.jpg")],
      );
      return rows.length;
    });
    assertEqual(
      crossProviderDelete,
      0,
      "broad delete must not let another provider delete listing images",
    );
  } finally {
    await db.exec(`
      drop policy if exists debug_broad_storage_select on storage.objects;
      drop policy if exists debug_broad_storage_insert on storage.objects;
      drop policy if exists debug_broad_storage_update on storage.objects;
      drop policy if exists debug_broad_storage_delete on storage.objects;
      drop policy if exists debug_other_read on storage.objects;
      delete from storage.objects where bucket_id = 'debug-other';
      delete from storage.buckets where id = 'debug-other';
    `);
  }
});

await test("storage writes require an approved provider managing the path", async () => {
  await asRole(
    "authenticated",
    U_PROVIDER_A,
    async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name) values ('listing-images', $1)", [
        imagePath(P_A, L_DRAFT, "uploaded.jpg"),
      ]);
    },
    "rollback",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_B, L_OTHER_PUBLISHED, "intruder.jpg")}')`,
      ),
    ),
    "cross-provider storage insert",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_A, L_DRAFT, "../escape.jpg")}')`,
      ),
    ),
    "traversal storage insert",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_PENDING, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_PENDING, L_PENDING_PROVIDER, "pending.jpg")}')`,
      ),
    ),
    "pending provider storage insert",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_REJECTED, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_REJECTED, L_REJECTED_PROVIDER, "rejected.jpg")}')`,
      ),
    ),
    "rejected provider storage insert",
  );

  await expectDenied(
    asRole("authenticated", U_ADMIN, (tx) =>
      tx.exec(
        `insert into storage.objects (bucket_id, name)
         values ('listing-images', '${imagePath(P_A, L_DRAFT, "admin-upload.jpg")}')`,
      ),
    ),
    "admin storage insert",
  );
});

await test("storage updates and deletes are scoped to the managing provider", async () => {
  await asRole(
    "authenticated",
    U_PROVIDER_A,
    async (tx) => {
      const { rows } = await tx.query(
        "update storage.objects set name = $1 where name = $2 returning id",
        [imagePath(P_A, L_DRAFT, "renamed.jpg"), imagePath(P_A, L_DRAFT, "orphan.jpg")],
      );
      assertEqual(rows.length, 1);
    },
    "rollback",
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.query("update storage.objects set name = $1 where name = $2", [
        imagePath(P_B, L_OTHER_PUBLISHED, "moved.jpg"),
        imagePath(P_A, L_DRAFT, "orphan.jpg"),
      ]),
    ),
    "cross-provider storage move",
  );

  const deletedOther = await asRole("authenticated", U_PROVIDER_A, async (tx) => {
    const { rows } = await tx.query("delete from storage.objects where name = $1 returning id", [
      imagePath(P_B, L_OTHER_PUBLISHED, "cover.jpg"),
    ]);
    return rows.length;
  });
  assertEqual(deletedOther, 0);

  const deletedOwn = await asRole(
    "authenticated",
    U_PROVIDER_A,
    async (tx) => {
      const { rows } = await tx.query("delete from storage.objects where name = $1 returning id", [
        imagePath(P_A, L_DRAFT, "room.jpg"),
      ]);
      return rows.length;
    },
    "rollback",
  );
  assertEqual(deletedOwn, 1);

  const adminDeleted = await asRole(
    "authenticated",
    U_ADMIN,
    async (tx) => {
      const { rows } = await tx.query("delete from storage.objects where name = $1 returning id", [
        imagePath(P_A, L_HIDDEN, "room.jpg"),
      ]);
      return rows.length;
    },
    "rollback",
  );
  assertEqual(adminDeleted, 1);
});

// ---------------------------------------------------------------------------
// Constraints and referential integrity
// ---------------------------------------------------------------------------

await test("money, currency and publish completeness constraints hold", async () => {
  const { rows } = await db.query(
    "select pg_typeof(rent_amount)::text as kind from public.listings where id = $1",
    [L_PUBLISHED],
  );
  assertEqual(rows[0].kind, "numeric");

  await expectDenied(
    db.exec(
      `insert into public.listings (provider_id, title, accommodation_type, city, rent_amount, rent_period)
       values ('${P_A}', 'Negative rent listing', 'private_room', 'Lagos', -1, 'month')`,
    ),
    "negative rent",
    ["23514"],
  );

  await expectDenied(
    db.exec(
      `insert into public.listings (provider_id, title, accommodation_type, city, currency)
       values ('${P_A}', 'Dollar listing', 'private_room', 'Lagos', 'USD')`,
    ),
    "unsupported currency",
    ["23514"],
  );

  await expectDenied(
    asRole("authenticated", U_PROVIDER_A, (tx) =>
      tx.exec(
        `insert into public.listings
           (provider_id, title, accommodation_type, city, publication_status)
         values ('${P_A}', 'Published without rent', 'private_room', 'Lagos', 'published')`,
      ),
    ),
    "incomplete publish",
    ["23514"],
  );
});

await test("providers with listings cannot be deleted and audited drafts are retained", async () => {
  await expectDenied(
    db.exec(`delete from public.providers where id = '${P_A}'`),
    "provider restrict",
    ["23001", "23503"],
  );

  await withTx(
    async (tx, as) => {
      await as("authenticated", U_PROVIDER_A);
      const deleted = await tx.query("delete from public.listings where id = $1 returning id", [L_DRAFT]);
      assertEqual(deleted.rows.length, 0, "a draft with audit rows must not cascade away");

      const listing = await tx.query("select 1 from public.listings where id = $1", [L_DRAFT]);
      const administration = await tx.query(
        "select 1 from public.listing_administration where listing_id = $1",
        [L_DRAFT],
      );
      const content = await tx.query(
        "select 1 from public.listing_content_events where listing_id = $1",
        [L_DRAFT],
      );
      assertEqual(listing.rows.length, 1);
      assertEqual(administration.rows.length, 1);
      assert(content.rows.length > 0);
    },
    "rollback",
  );
});

await test("saved listings are not implemented", async () => {
  const { rows } = await db.query("select to_regclass('public.saved_listings') as name");
  assertEqual(rows[0].name, null);
});

await db.close();

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
