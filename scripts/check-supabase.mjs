/**
 * Non-destructive Supabase configuration check.
 *
 * Confirms the two public environment variables are present and that the
 * project's auth endpoint answers. Prints status information only — never the
 * URL or key values, and never tokens.
 *
 * Usage: bun run check:supabase
 */

const url = (process.env.VITE_SUPABASE_URL ?? "").trim();
const key = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

const missing = [];
if (!url) missing.push("VITE_SUPABASE_URL");
if (!key) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");

if (missing.length > 0) {
  console.error(`config: missing ${missing.join(", ")}`);
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error("config: VITE_SUPABASE_URL is not a valid URL");
  process.exit(1);
}

if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
  console.error("config: VITE_SUPABASE_URL must use http or https");
  process.exit(1);
}

const keyKind = key.startsWith("sb_publishable_")
  ? "publishable key"
  : key.startsWith("eyJ")
    ? "legacy anon JWT"
    : "unrecognised key format (expected a publishable key)";

console.log(`config: both variables are set (${keyKind})`);

try {
  const response = await fetch(`${parsed.origin}/auth/v1/health`, {
    headers: { apikey: key },
  });
  console.log(`auth health: HTTP ${response.status}${response.ok ? " OK" : ""}`);
  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error(
    `auth health: request failed (${error instanceof Error ? error.name : "unknown error"})`,
  );
  process.exit(1);
}
