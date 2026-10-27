import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type NotificationKind =
  Database["public"]["Enums"]["notification_kind"];

/** One row of the activity feed, as the database is willing to show it. */
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const NOTIFICATION_COLUMNS = "id, kind, title, body, href, read_at, created_at";

/** How many rows the feed keeps in memory; older activity is not needed. */
export const NOTIFICATION_PAGE_SIZE = 60;

export function mapNotificationsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Notifications are not enabled on this database yet. Apply the notifications migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see your notifications.";
  }
  return "Could not load your notifications. Please try again.";
}

/**
 * The caller's own activity, newest first. RLS scopes the rows; there is no
 * user filter because `user_id` is deliberately absent from the column grants.
 */
export async function loadNotifications(
  client: TypedSupabaseClient,
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<{ notifications: AppNotification[]; error: string | null }> {
  try {
    const { data, error } = await client
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { notifications: [], error: mapNotificationsError(error) };
    }
    return { notifications: (data ?? []) as AppNotification[], error: null };
  } catch {
    return {
      notifications: [],
      error: "Could not load your notifications. Please try again.",
    };
  }
}

/** Stamps one row read. Already-read rows are left alone. */
export async function markNotificationRead(
  client: TypedSupabaseClient,
  notificationId: string,
): Promise<{ readAt: string | null; error: string | null }> {
  try {
    const readAt = new Date().toISOString();
    const { error } = await client
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", notificationId)
      .is("read_at", null);

    if (error) return { readAt: null, error: mapNotificationsError(error) };
    return { readAt, error: null };
  } catch {
    return {
      readAt: null,
      error: "Could not update the notification. Please try again.",
    };
  }
}

/** Stamps every unread row of the caller read in one statement. */
export async function markAllNotificationsRead(
  client: TypedSupabaseClient,
): Promise<{ readAt: string | null; error: string | null }> {
  try {
    const readAt = new Date().toISOString();
    const { error } = await client
      .from("notifications")
      .update({ read_at: readAt })
      .is("read_at", null);

    if (error) return { readAt: null, error: mapNotificationsError(error) };
    return { readAt, error: null };
  } catch {
    return {
      readAt: null,
      error: "Could not update your notifications. Please try again.",
    };
  }
}

/** The badge number: unread rows, counted by the database. */
export async function countUnreadNotifications(
  client: TypedSupabaseClient,
): Promise<{ count: number; error: boolean }> {
  try {
    const { count, error } = await client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);

    if (error) return { count: 0, error: true };
    return { count: count ?? 0, error: false };
  } catch {
    return { count: 0, error: true };
  }
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Compact age for a feed row: "Just now", "12m ago", "3h ago", then a date. */
export function formatNotificationTime(
  createdAt: string,
  now: Date = new Date(),
): string {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return "";

  const elapsed = now.getTime() - then;
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(then));
}

/** Tone for a row's icon chip, kept out of the component's render branch. */
export function notificationTone(
  kind: NotificationKind,
): "accent" | "positive" | "caution" | "neutral" {
  switch (kind) {
    case "roommate_accepted":
    case "visit_confirmed":
    case "room_approved":
    case "saved_room_available":
      return "positive";
    case "roommate_interest":
    case "visit_requested":
    case "room_requested":
    case "saved_room_price_changed":
    case "saved_search_match":
      return "accent";
    case "roommate_declined":
    case "visit_declined":
    case "room_declined":
    case "saved_room_availability_changed":
      return "caution";
    case "report_decision":
    case "appeal_decision":
      // One kind covers both outcomes of a decision, so the chip stays neutral
      // between approved and declined and the title carries the answer.
      return "accent";
    default:
      return "neutral";
  }
}
