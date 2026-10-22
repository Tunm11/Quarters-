/**
 * Supabase configuration parsing.
 *
 * Kept pure so it can be tested without importing the Supabase client, and so
 * the app can fail loudly and clearly when configuration is missing. Values are
 * never logged or included in user-facing errors.
 */

export const SUPABASE_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type SupabaseEnvKey = (typeof SUPABASE_ENV_KEYS)[number];

export type SupabaseEnv = Partial<Record<SupabaseEnvKey, string | undefined>>;

export type SupabaseConfig =
  | {
      status: "configured";
      url: string;
      publishableKey: string;
    }
  | {
      status: "invalid";
      /** Keys that were not provided at all. */
      missing: SupabaseEnvKey[];
      /** Keys that were provided but did not look usable. */
      invalid: SupabaseEnvKey[];
    };

function read(env: SupabaseEnv, key: SupabaseEnvKey): string {
  return (env[key] ?? "").trim();
}

function isUsableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseSupabaseConfig(env: SupabaseEnv): SupabaseConfig {
  const url = read(env, "VITE_SUPABASE_URL");
  const publishableKey = read(env, "VITE_SUPABASE_PUBLISHABLE_KEY");

  const missing: SupabaseEnvKey[] = [];
  const invalid: SupabaseEnvKey[] = [];

  if (!url) {
    missing.push("VITE_SUPABASE_URL");
  } else if (!isUsableUrl(url)) {
    invalid.push("VITE_SUPABASE_URL");
  }

  if (!publishableKey) {
    missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0 || invalid.length > 0) {
    return { status: "invalid", missing, invalid };
  }

  return { status: "configured", url, publishableKey };
}

/** Human-readable problem summary that names variables but never prints them. */
export function describeSupabaseConfigProblem(config: SupabaseConfig): string {
  if (config.status === "configured") {
    return "";
  }

  const parts: string[] = [];
  if (config.missing.length > 0) {
    parts.push(`Missing: ${config.missing.join(", ")}.`);
  }
  if (config.invalid.length > 0) {
    parts.push(`Not a valid http(s) URL: ${config.invalid.join(", ")}.`);
  }
  return parts.join(" ");
}
