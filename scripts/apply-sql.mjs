#!/usr/bin/env bun
/**
 * Applies SQL files to the live Supabase Postgres database.
 *
 * Usage:
 *   bun scripts/apply-sql.mjs --check
 *   bun scripts/apply-sql.mjs supabase/migrations/<file>.sql [more.sql ...]
 *   bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com <file.sql>
 *
 * Requires SUPABASE_DB_URL in the environment. The value is never printed.
 *
 * `--host` switches to the Supabase pooler. The project's direct database host
 * (db.<ref>.supabase.co) resolves to IPv6 only, so environments without IPv6
 * must go through the pooler, whose user is "postgres.<project-ref>".
 *
 * Each file runs inside its own transaction, so a failure leaves the database
 * untouched instead of half-applied.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const hostIndex = argv.indexOf("--host");
const poolerHost = hostIndex >= 0 ? (argv[hostIndex + 1] ?? null) : null;
const files = argv.filter(
  (arg, index) =>
    !arg.startsWith("--") && !(hostIndex >= 0 && index === hostIndex + 1),
);

if (files.length === 0 && !checkOnly) {
  console.error(
    "Usage: bun scripts/apply-sql.mjs [--check] [--host <pooler-host>] <file.sql> ...",
  );
  process.exit(2);
}

const rawUrl = process.env.SUPABASE_DB_URL;

if (!rawUrl) {
  console.error(
    "SUPABASE_DB_URL is not set. Add the Supabase connection string in Settings -> Environment, then rerun.",
  );
  process.exit(2);
}

const parsed = new URL(rawUrl);

// The project ref lives either in the direct host or in the pooler username.
const directMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
const userMatch = decodeURIComponent(parsed.username).match(
  /^postgres\.([a-z0-9]+)$/i,
);
const projectRef = directMatch?.[1] ?? userMatch?.[1] ?? null;

if (!projectRef) {
  console.error(
    "Could not determine the Supabase project ref from SUPABASE_DB_URL. Use the Session pooler connection string.",
  );
  process.exit(2);
}

if (poolerHost) {
  parsed.hostname = poolerHost;
  parsed.port = parsed.port || "5432";
  parsed.username = `postgres.${projectRef}`;
}

if (!parsed.searchParams.has("sslmode")) {
  parsed.searchParams.set("sslmode", "require");
}

// Host and project ref are not secret; the password never leaves the driver.
console.log(`target: ${parsed.hostname} • project ${projectRef}`);

const sql = new Bun.SQL(parsed.toString(), { max: 1, connection_timeout: 20 });

function describe(error) {
  const detail = error?.cause?.message ?? error?.code ?? error?.errno ?? "";
  return `${error?.message ?? error}${detail ? ` (${detail})` : ""}`;
}

try {
  if (checkOnly) {
    const info = await sql`
      select current_database() as database,
             current_user as role,
             (select count(*) from public.listings)::int as listings,
             (select count(*) from public.providers)::int as providers
    `;
    const columns = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'listings'
      order by ordinal_position
    `;
    const table = await sql`
      select to_regclass('public.listing_viewing_requests') as name
    `;
    const demo = await sql`
      select count(*)::int as n
      from public.listings
      where id = 'd0000000-0000-4000-8000-000000000101'
    `;

    console.log(`connected: ${info[0].database} as ${info[0].role}`);
    console.log(`rows: ${info[0].listings} listings, ${info[0].providers} providers`);
    console.log(`demo room present: ${demo[0].n === 1}`);
    console.log(
      `total_rooms column: ${columns.some((c) => c.column_name === "total_rooms")}`,
    );
    console.log(
      `rent_session_months column: ${columns.some((c) => c.column_name === "rent_session_months")}`,
    );
    console.log(`listing_viewing_requests: ${table[0].name ?? "missing"}`);
    await sql.close();
    process.exit(0);
  }

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    const body = readFileSync(path, "utf8");

    process.stdout.write(`applying ${file} ... `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
      });
      console.log("ok");
    } catch (error) {
      console.log("failed");
      console.error(`\n${file}: ${describe(error)}`);
      await sql.close();
      process.exit(1);
    }
  }
} catch (error) {
  console.error(`\nconnection/preflight failed: ${describe(error)}`);
  await sql.close();
  process.exit(1);
}

await sql.close();
console.log(`applied ${files.length} file(s)`);
