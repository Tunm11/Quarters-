#!/usr/bin/env bun
/**
 * Applies SQL files to the live Supabase Postgres database.
 *
 * Usage:
 *   bun scripts/apply-sql.mjs --check
 *   bun scripts/apply-sql.mjs --status [--host <pooler-host>]
 *   bun scripts/apply-sql.mjs supabase/migrations/<file>.sql [more.sql ...]
 *   bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com <file.sql>
 *
 * `--status` is read-only. It compares the local migration files with the live
 * database two ways: the `supabase_migrations.schema_migrations` history, and a
 * probe for the tables/columns/functions/policies each file declares. The probe
 * exists because files applied with this script are not recorded in history, so
 * history alone cannot tell an unapplied migration from an unrecorded one.
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
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const statusOnly = argv.includes("--status");
const hostIndex = argv.indexOf("--host");
const poolerHost = hostIndex >= 0 ? (argv[hostIndex + 1] ?? null) : null;
const files = argv.filter(
  (arg, index) =>
    !arg.startsWith("--") && !(hostIndex >= 0 && index === hostIndex + 1),
);

if (files.length === 0 && !checkOnly && !statusOnly) {
  console.error(
    "Usage: bun scripts/apply-sql.mjs [--check|--status] [--host <pooler-host>] <file.sql> ...",
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

/**
 * A quoted Postgres text[] literal. The driver sends a JS array as a bare joined
 * string, which the server rejects as a malformed array literal.
 */
function textArray(values) {
  const items = values
    .map((value) => {
      // A backslash escapes inside an array element, and the element sits in a
      // single-quoted SQL literal: both levels have to be escaped.
      const escaped = String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/'/g, "''");
      return `"${escaped}"`;
    })
    .join(",");
  return `'{${items}}'`;
}

const sql = new Bun.SQL(parsed.toString(), { max: 1, connection_timeout: 20 });

function describe(error) {
  const detail = error?.cause?.message ?? error?.code ?? error?.errno ?? "";
  return `${error?.message ?? error}${detail ? ` (${detail})` : ""}`;
}

/**
 * The object kinds a migration can be recognised by. Each pattern finds the
 * names a file introduces, and each check asks the live catalogue whether one of
 * those names is already there. That is how a migration applied without being
 * recorded in `schema_migrations` is told apart from one never applied.
 */
const IDENT = '(?:"[^"]+"|[a-z_][a-z0-9_]*)';
const QUALIFIED = `(${IDENT}(?:\\s*\\.\\s*${IDENT})?)`;

/** Unquotes one identifier: Postgres folds unquoted names to lower case. */
function unquote(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed.toLowerCase();
}

/** `schema.name` (or a bare `name`, which means `public`) as normalised parts. */
function nameParts(raw) {
  const parts = raw.split(".").map(unquote);
  return parts.length === 1 ? ["public", parts[0]] : [parts[0], parts[1]];
}

/**
 * Existence tests, all shaped `exists (... = t.k)`, so one unnest per kind can
 * be asked in a single round trip. `t.k` is a key built by the matching entry.
 */
const CHECKS = {
  relations:
    "to_regclass(quote_ident(split_part(t.k, '.', 1)) || '.' || quote_ident(split_part(t.k, '.', 2))) is not null",
  types:
    "to_regtype(quote_ident(split_part(t.k, '.', 1)) || '.' || quote_ident(split_part(t.k, '.', 2))) is not null",
  functions:
    "exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = split_part(t.k, '.', 1) and p.proname = split_part(t.k, '.', 2))",
  triggers: "exists (select 1 from pg_trigger where not tgisinternal and tgname = t.k)",
  policies:
    "exists (select 1 from pg_policies where schemaname || '.' || tablename || '.' || policyname = t.k)",
  columns:
    "exists (select 1 from information_schema.columns where table_schema || '.' || table_name || '.' || column_name = t.k)",
  constraints: "exists (select 1 from pg_constraint where conname = t.k)",
  enumValues:
    "exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid join pg_namespace ns on ns.oid = ty.typnamespace where ns.nspname || '.' || ty.typname || '.' || e.enumlabel = t.k)",
  replicaIdentity:
    "exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname || '.' || c.relname = t.k and c.relreplident = 'f')",
  publications:
    "exists (select 1 from pg_publication_tables where schemaname || '.' || tablename = t.k)",
  buckets: "exists (select 1 from storage.buckets where id = t.k)",
  extensions: "exists (select 1 from pg_extension where extname = t.k)",
};

/** The kinds read straight out of a match. `columns` is paired separately. */
const PROBE_KINDS = [
  {
    kind: "relations",
    pattern: new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:unique\\s+|materialized\\s+)?(?:table|view|index)\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`,
      "gi",
    ),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    kind: "types",
    pattern: new RegExp(`\\bcreate\\s+type\\s+${QUALIFIED}`, "gi"),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    kind: "functions",
    pattern: new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+${QUALIFIED}`,
      "gi",
    ),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    kind: "triggers",
    pattern: new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\s+(${IDENT})`,
      "gi",
    ),
    key: (m) => unquote(m[1]),
  },
  {
    kind: "policies",
    pattern: new RegExp(`\\bcreate\\s+policy\\s+(${IDENT})\\s+on\\s+${QUALIFIED}`, "gi"),
    key: (m) => [...nameParts(m[2]), unquote(m[1])].join("."),
  },
  {
    kind: "constraints",
    pattern: new RegExp(`\\badd\\s+constraint\\s+(${IDENT})`, "gi"),
    key: (m) => unquote(m[1]),
  },
  {
    kind: "enumValues",
    pattern: new RegExp(
      `\\balter\\s+type\\s+${QUALIFIED}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'([^']+)'`,
      "gi",
    ),
    key: (m) => [...nameParts(m[1]), m[2]].join("."),
  },
  {
    kind: "replicaIdentity",
    pattern: new RegExp(
      `\\balter\\s+table\\s+${QUALIFIED}\\s+replica\\s+identity\\s+full`,
      "gi",
    ),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    kind: "publications",
    pattern: new RegExp(
      `\\balter\\s+publication\\s+${IDENT}\\s+add\\s+table\\s+${QUALIFIED}`,
      "gi",
    ),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    kind: "buckets",
    pattern: /\binsert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/gi,
    key: (m) => m[1],
  },
  {
    kind: "extensions",
    pattern: new RegExp(
      `\\bcreate\\s+extension\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})`,
      "gi",
    ),
    key: (m) => unquote(m[1]),
  },
];

/** Collapses a comment to one readable line for the status report. */
function shorten(text, limit = 70) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}\u2026` : flat;
}

/**
 * A `comment on column` statement. Migrations that only change data cannot be
 * recognised by the objects they create, but most of them also document the
 * change they made, and that comment is a schema object the live database
 * either has or does not have. The expected text is compared exactly, so a
 * different comment on the same column does not count as evidence.
 */
const COLUMN_COMMENT = new RegExp(
  `\\bcomment\\s+on\\s+column\\s+(${IDENT}(?:\\s*\\.\\s*${IDENT}){1,2})\\s+is\\s+'((?:[^']|'')*)'`,
  "gi",
);

/** The column comments a file sets, as `schema.table.column` and its text. */
function declaredComments(body) {
  const text = withoutComments(body);
  const comments = new Map();
  for (const match of text.matchAll(COLUMN_COMMENT)) {
    const parts = match[1].split(".").map(unquote);
    const path = parts.length === 2 ? ["public", ...parts] : parts;
    comments.set(path.join("."), match[2].replace(/''/g, "'"));
  }
  return comments;
}

/** Column comments that are absent or do not say what the file says they say. */
async function inspectComments(db, comments) {
  if (comments.size === 0) return [];
  const keys = [...comments.keys()];
  const expected = keys.map((key) => comments.get(key));
  const rows = await db.unsafe(`
    select t.k as key,
           t.v as expected,
           (select col_description(a.attrelid, a.attnum)
              from pg_attribute a
             where a.attrelid = to_regclass(quote_ident(split_part(t.k, '.', 1)) || '.' || quote_ident(split_part(t.k, '.', 2)))
               and a.attname = split_part(t.k, '.', 3)) as live
    from unnest(${textArray(keys)}::text[], ${textArray(expected)}::text[]) as t(k, v)
    where not (
      exists (
        select 1 from pg_attribute a
        where a.attrelid = to_regclass(quote_ident(split_part(t.k, '.', 1)) || '.' || quote_ident(split_part(t.k, '.', 2)))
          and a.attname = split_part(t.k, '.', 3)
          and col_description(a.attrelid, a.attnum) = t.v
      )
    )
  `);
  return rows.map((row) => {
    const live = row.live === null ? "no comment" : `\u201c${shorten(row.live)}\u201d`;
    return `${row.key} says ${live}, file says \u201c${shorten(row.expected)}\u201d`;
  });
}

/**
 * Objects a file removes. A migration that drops a policy a later migration
 * created is itself evidence that the later file ran, so drops are subtracted
 * from what a file is expected to have left behind.
 */
const DROP_KINDS = [
  {
    pattern: new RegExp(`\\bdrop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+${QUALIFIED}`, "gi"),
    key: (m) => [...nameParts(m[2]), unquote(m[1])].join("."),
  },
  {
    pattern: new RegExp(`\\bdrop\\s+trigger\\s+(?:if\\s+exists\\s+)?(${IDENT})`, "gi"),
    key: (m) => unquote(m[1]),
  },
  {
    pattern: new RegExp(`\\bdrop\\s+function\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`, "gi"),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    pattern: new RegExp(
      `\\bdrop\\s+(?:table|view|materialized\\s+view|index)\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`,
      "gi",
    ),
    key: (m) => nameParts(m[1]).join("."),
  },
  {
    pattern: new RegExp(`\\bdrop\\s+constraint\\s+(?:if\\s+exists\\s+)?(${IDENT})`, "gi"),
    key: (m) => unquote(m[1]),
  },
  {
    pattern: new RegExp(`\\bdrop\\s+type\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`, "gi"),
    key: (m) => nameParts(m[1]).join("."),
  },
];

/** The objects a migration file removes, in the same key shape as the probes. */
function declaredDrops(body) {
  const text = withoutComments(body);
  const keys = new Set();
  for (const { pattern, key } of DROP_KINDS) {
    for (const match of text.matchAll(pattern)) keys.add(key(match));
  }
  return [...keys];
}

/**
 * The `alter table` a lone `add column` belongs to: the nearest one above it,
 * as long as no `;` closes the statement in between.
 */
function ownerTable(alterTables, text, index) {
  let owner = null;
  for (const entry of alterTables) {
    if (entry.index < index) owner = entry;
    else break;
  }
  if (!owner) return null;
  return text.slice(owner.index, index).includes(";") ? null : owner;
}

/** Strips SQL comments so a commented-out statement is never probed. */
function withoutComments(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The named objects a migration file declares, deduplicated per kind. */
function declaredObjects(body) {
  const text = withoutComments(body);
  const objects = {};

  for (const { kind, pattern, key } of PROBE_KINDS) {
    const keys = new Set();
    for (const match of text.matchAll(pattern)) keys.add(key(match));
    if (keys.size) objects[kind] = [...keys];
  }

  const alterTables = [
    ...text.matchAll(
      new RegExp(`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QUALIFIED}`, "gi"),
    ),
  ].map((match) => ({ index: match.index, table: nameParts(match[1]).join(".") }));

  const columns = new Set();
  for (const match of text.matchAll(
    new RegExp(`\\badd\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})`, "gi"),
  )) {
    const owner = ownerTable(alterTables, text, match.index);
    if (owner) columns.add(`${owner.table}.${unquote(match[1])}`);
  }
  if (columns.size) objects.columns = [...columns];

  return objects;
}

/**
 * Asks the live schema about every object a file declares, and returns the keys
 * that are absent along with how many were checked. Read-only: one query.
 */
async function inspectObjects(db, objects) {
  const kinds = Object.keys(objects).filter((kind) => objects[kind]?.length);
  const total = kinds.reduce((sum, kind) => sum + objects[kind].length, 0);
  if (total === 0) return { present: 0, total: 0, missing: [] };

  const selects = kinds.map(
    (kind) =>
      `select '${kind}' as kind, t.k as key from unnest(${textArray(objects[kind])}::text[]) as t(k) where not (${CHECKS[kind]})`,
  );
  const rows = await db.unsafe(selects.join("\nunion all\n"));

  return {
    present: total - rows.length,
    total,
    missing: rows.map((row) => `${row.key} (${row.kind})`),
  };
}

/** Read-only: which local migrations the live database does not have yet. */
async function printStatus(db) {
  const [history] = await db`
    select to_regclass('supabase_migrations.schema_migrations') as name
  `;
  let recorded = [];
  if (history.name) {
    recorded = await db`select version from supabase_migrations.schema_migrations`;
  }
  const recordedVersions = new Set(recorded.map((row) => String(row.version)));

  const dir = resolve(process.cwd(), "supabase/migrations");
  const localFiles = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  console.log(
    `history table: ${history.name ? "present" : "missing"} \u2022 ${recordedVersions.size} recorded version(s)`,
  );
  console.log(`local migration files: ${localFiles.length}`);

  // Drops and comments are read from every file first: an object a later file
  // removes, or a comment it rewrites, is no evidence about the earlier file.
  const scanned = localFiles.map((file) => {
    const body = readFileSync(resolve(dir, file), "utf8");
    return {
      file,
      objects: declaredObjects(body),
      drops: declaredDrops(body),
      comments: declaredComments(body),
    };
  });
  const dropsAfter = new Map();
  const commentsAfter = new Map();
  const pendingDrops = new Set();
  const pendingComments = new Set();
  for (let i = scanned.length - 1; i >= 0; i -= 1) {
    dropsAfter.set(scanned[i].file, new Set(pendingDrops));
    commentsAfter.set(scanned[i].file, new Set(pendingComments));
    for (const key of scanned[i].drops) pendingDrops.add(key);
    for (const key of scanned[i].comments.keys()) pendingComments.add(key);
  }

  const unrecorded = [];
  for (const { file, objects, comments } of scanned) {
    const version = file.split("_")[0];
    if (recordedVersions.has(version)) continue;
    const drops = dropsAfter.get(file);
    const expected = {};
    let superseded = 0;
    for (const [kind, keys] of Object.entries(objects)) {
      const kept = keys.filter((key) => !drops.has(key));
      superseded += keys.length - kept.length;
      if (kept.length) expected[kind] = kept;
    }
    const rewritten = commentsAfter.get(file);
    const ownComments = new Map(
      [...comments].filter(([key]) => !rewritten.has(key)),
    );
    const missingComments = await inspectComments(db, ownComments);
    const probed = await inspectObjects(db, expected);
    unrecorded.push({
      file,
      superseded: superseded + (comments.size - ownComments.size),
      present: probed.present + ownComments.size - missingComments.length,
      total: probed.total + ownComments.size,
      missing: [...probed.missing, ...missingComments],
    });
  }

  const missingObjects = unrecorded.filter((row) => row.missing.length > 0);
  const nothingToProbe = unrecorded.filter(
    (row) => row.total === 0 && row.superseded === 0,
  );
  const supersededFiles = unrecorded.filter(
    (row) => row.total === 0 && row.superseded > 0,
  );
  console.log(`\nnot recorded in history: ${unrecorded.length} file(s)`);
  console.log(
    `  declared objects all present: ${unrecorded.length - missingObjects.length - nothingToProbe.length - supersededFiles.length}`,
  );
  console.log(`  with objects missing: ${missingObjects.length}`);
  console.log(`  superseded by a later migration: ${supersededFiles.length}`);
  console.log(`  nothing to probe: ${nothingToProbe.length}`);

  if (missingObjects.length > 0) {
    console.log("\nobjects missing from the live schema:");
    for (const { file, present, total, missing } of missingObjects) {
      console.log(`  ${file}: ${present}/${total} present`);
      for (const name of missing.slice(0, 6)) console.log(`      missing: ${name}`);
      if (missing.length > 6) console.log(`      ... and ${missing.length - 6} more`);
    }
  }

  if (supersededFiles.length > 0) {
    console.log("\nsuperseded (every object it declares is dropped later, so its end state is decided by the later file):");
    for (const { file } of supersededFiles) console.log(`  ${file}`);
  }

  if (nothingToProbe.length > 0) {
    console.log("\nno declared objects to probe (check these by hand):");
    for (const { file } of nothingToProbe) console.log(`  ${file}`);
  }
}

try {
  if (statusOnly) {
    await printStatus(sql);
    await sql.close();
    process.exit(0);
  }

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
