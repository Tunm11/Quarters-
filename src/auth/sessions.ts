import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Session and device management against real Supabase Auth data.
 *
 * Supabase stores one row per sign-in in `auth.sessions`; the access token's
 * `session_id` claim matches that row. The client cannot read the auth schema,
 * so `list_own_sessions()` and `revoke_own_session()` (see
 * `supabase/migrations/20261025420000_add_session_management.sql`) expose only
 * the caller's own rows. Nothing here is mocked: a failed call is reported as a
 * failure and an empty list is reported as empty.
 */

export type AuthSession = {
  id: string;
  createdAt: string;
  /** Last token refresh, or the sign-in time when the session never refreshed. */
  lastActiveAt: string | null;
  userAgent: string | null;
  ip: string | null;
  /** True for the session making this call. */
  isCurrent: boolean;
};

export type SessionListResult = { sessions: AuthSession[]; error: string | null };
export type SessionActionResult = { error: string | null };

type Client = SupabaseClient<Database>;

export type DeviceKind = "mobile" | "tablet" | "desktop" | "unknown";

export type DeviceDescription = {
  /** "Chrome on Android", "Safari on iPhone", or "Unrecognised device". */
  label: string;
  browser: string | null;
  platform: string | null;
  kind: DeviceKind;
};

const UNKNOWN_DEVICE = "Unrecognised device";

/**
 * Turns a stored user agent into something a student recognises.
 *
 * Supabase stores the raw header, so this stays a best-effort summary: it names
 * the browser and platform when the string identifies them and says so plainly
 * when it does not, instead of inventing a device.
 */
export function describeDevice(userAgent: string | null | undefined): DeviceDescription {
  const ua = userAgent ?? "";
  if (!ua.trim()) {
    return { label: UNKNOWN_DEVICE, browser: null, platform: null, kind: "unknown" };
  }

  const platform = detectPlatform(ua);
  const browser = detectBrowser(ua);

  if (!browser && !platform) {
    return { label: UNKNOWN_DEVICE, browser: null, platform: null, kind: "unknown" };
  }

  const label =
    browser && platform
      ? `${browser} on ${platform.name}`
      : (browser ?? platform?.name ?? UNKNOWN_DEVICE);

  return {
    label,
    browser: browser ?? null,
    platform: platform?.name ?? null,
    kind: platform?.kind ?? "unknown",
  };
}

function detectPlatform(ua: string): { name: string; kind: DeviceKind } | null {
  if (/iPad/i.test(ua)) return { name: "iPad", kind: "tablet" };
  if (/iPhone|iPod/i.test(ua)) return { name: "iPhone", kind: "mobile" };
  if (/Android/i.test(ua)) {
    // Android tablets omit "Mobile"; phones include it.
    return { name: "Android", kind: /Mobile/i.test(ua) ? "mobile" : "tablet" };
  }
  if (/Windows/i.test(ua)) return { name: "Windows", kind: "desktop" };
  if (/CrOS/i.test(ua)) return { name: "ChromeOS", kind: "desktop" };
  if (/Macintosh|Mac OS X/i.test(ua)) return { name: "macOS", kind: "desktop" };
  if (/Linux/i.test(ua)) return { name: "Linux", kind: "desktop" };
  return null;
}

function detectBrowser(ua: string): string | null {
  // Order matters: every Chromium browser also claims Chrome and Safari.
  if (/Edg[A-Z]?\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  if (/CriOS|Chrome|Chromium/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return null;
}

/**
 * Readable age of a timestamp ("Active now", "About 2 hours ago", "12 Mar 2026").
 * `now` is injectable so tests do not depend on the clock.
 */
export function formatLastActive(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (seconds < 0) return "Just now";
  if (seconds < 120) return "Active just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `About ${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

/** Loads the signed-in account's sessions. */
export async function loadOwnSessions(client: Client): Promise<SessionListResult> {
  const { data, error } = await client.rpc("list_own_sessions");

  if (error) {
    return { sessions: [], error: mapSessionError(error) };
  }

  const sessions = (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    userAgent: row.user_agent,
    ip: row.ip,
    isCurrent: row.is_current,
  }));

  return { sessions, error: null };
}

/** Ends one of the account's sessions. Its refresh token stops working. */
export async function revokeSession(
  client: Client,
  sessionId: string,
): Promise<SessionActionResult> {
  const { error } = await client.rpc("revoke_own_session", { p_session_id: sessionId });
  if (error) {
    return { error: mapSessionError(error) };
  }
  return { error: null };
}

/**
 * Session failures, mapped to what the student can act on. 42883 and PGRST202
 * mean the RPC is absent, i.e. the migration has not been applied yet.
 */
function mapSessionError(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "42883":
    case "PGRST202":
      return "Session management is not enabled on this database yet. The session migration has not been applied.";
    case "42501":
      return "Sign in again to manage your sessions.";
    case "P0001":
      return error.message || "That session is no longer active.";
    default:
      return "Could not reach session management. Please try again.";
  }
}
