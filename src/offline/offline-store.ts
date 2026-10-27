/**
 * Offline snapshots.
 *
 * The app is a Supabase client, so every screen is a network read. When the
 * connection drops, the service worker can still serve the shell but has no
 * rows to put in it. This store keeps the last successful read of the two
 * screens that matter most offline — the shortlist and the conversation inbox —
 * scoped to the signed-in account, so they open read-only instead of blank.
 *
 * Deliberate limits:
 *   - localStorage, not IndexedDB: the payloads are small JSON summaries, and a
 *     synchronous read lets a hook decide before it paints.
 *   - every entry is namespaced by user id, so one account's shortlist can never
 *     surface on another account's device.
 *   - expired entries are ignored (14 days) and a write failure is swallowed:
 *     an offline copy is an enhancement, never a reason to break a screen.
 */

const PREFIX = "quarters.offline.v1";

/** Snapshots older than this are treated as missing. */
export const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type OfflineSnapshot<T> = {
  data: T;
  /** ISO timestamp of the read this copy came from. */
  savedAt: string;
};

type StoredSnapshot = {
  userId: string;
  savedAt: string;
  data: unknown;
};

/** The snapshot names the app keeps. */
export const OFFLINE_NAMES = {
  savedRooms: "saved-rooms",
  roomThreads: "inbox-room-threads",
  groups: "inbox-groups",
  connections: "inbox-connections",
} as const;

export type OfflineName = (typeof OFFLINE_NAMES)[keyof typeof OFFLINE_NAMES];

function keyFor(name: string, userId: string): string {
  return `${PREFIX}:${userId}:${name}`;
}

/** localStorage, or null where it is unavailable (SSR, private mode, quota). */
function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The last good copy for this account, or null when there is none, it belongs
 * to someone else, it is unreadable, or it has expired.
 */
export function readSnapshot<T>(
  name: string,
  userId: string,
  now: Date = new Date(),
): OfflineSnapshot<T> | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(keyFor(name, userId));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (parsed.userId !== userId || !parsed.savedAt || !("data" in parsed)) {
      return null;
    }
    const savedAt = new Date(parsed.savedAt).getTime();
    if (Number.isNaN(savedAt) || now.getTime() - savedAt > SNAPSHOT_MAX_AGE_MS) {
      return null;
    }
    return { data: parsed.data as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Replaces the copy for this account. Never throws. */
export function writeSnapshot<T>(
  name: string,
  userId: string,
  data: T,
  now: Date = new Date(),
): void {
  const store = storage();
  if (!store) return;

  const entry: StoredSnapshot = { userId, savedAt: now.toISOString(), data };
  try {
    store.setItem(keyFor(name, userId), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled. The screen keeps working online.
  }
}

/** Drops this account's copies, all of them or a named few. */
export function clearSnapshots(
  userId: string,
  names: readonly string[] = Object.values(OFFLINE_NAMES),
): void {
  const store = storage();
  if (!store) return;

  for (const name of names) {
    try {
      store.removeItem(keyFor(name, userId));
    } catch {
      // Nothing to do: the copy will be ignored when it expires.
    }
  }
}

/**
 * How old a cached copy is, in words a reader can act on: "just now",
 * "12 minutes ago", "today at 10:32", "22 Oct at 10:32".
 */
export function formatSnapshotAge(
  savedAt: string,
  now: Date = new Date(),
): string {
  const time = new Date(savedAt).getTime();
  if (Number.isNaN(time)) return "an unknown time";

  const elapsed = now.getTime() - time;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(elapsed / 60_000));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return `today at ${clock}`;
  if (time >= startOfToday - 24 * 60 * 60_000) return `yesterday at ${clock}`;

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(time));
  return `${date} at ${clock}`;
}
