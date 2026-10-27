import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type ViewingRequestStatus =
  Database["public"]["Enums"]["viewing_request_status"];

export type ViewingRequestSummary = {
  id: string;
  scheduled_for: string;
  status: ViewingRequestStatus;
};

/** Visit slots offered by the scheduling card. Viewings are day-time only. */
export const VISIT_TIMES = ["10:00", "12:00", "14:00", "16:00"] as const;

export type VisitTime = (typeof VISIT_TIMES)[number];

export type VisitDay = {
  /** Local calendar date, `YYYY-MM-DD`, for building the slot. */
  iso: string;
  weekday: string;
  day: string;
  month: string;
};

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "short" });
const slotFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The next `count` calendar days, starting today, in the visitor's timezone. */
export function buildVisitDays(from: Date = new Date(), count = 5): VisitDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + index,
    );
    return {
      iso: toDateInputValue(date),
      weekday: weekdayFormatter.format(date),
      day: dayFormatter.format(date),
      month: monthFormatter.format(date),
    };
  });
}

/**
 * Combines a local calendar date with a local time into the timestamp sent to
 * Supabase. Built from local parts on purpose, so "10:00" means 10:00 where the
 * visitor is, not 10:00 UTC.
 */
export function scheduledForFromSlot(dayIso: string, time: string): string {
  const [year, month, day] = dayIso.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export function formatVisitSlot(scheduledFor: string): string {
  return slotFormatter.format(new Date(scheduledFor));
}

/** Client-side guard; the database policy is the real authority. */
export function validateVisitSelection(
  dayIso: string | null,
  time: string | null,
): string | null {
  if (!dayIso) return "Choose a day for your visit.";
  if (!time) return "Choose a time for your visit.";
  if (!VISIT_TIMES.includes(time as VisitTime)) {
    return "Choose one of the offered visit times.";
  }
  if (Number.isNaN(new Date(scheduledForFromSlot(dayIso, time)).getTime())) {
    return "That visit slot is not valid.";
  }
  return null;
}

/**
 * A visit can be cancelled any time up to this many hours before it starts, so
 * a provider is never left waiting at the property. The database policy
 * enforces the same cutoff.
 */
export const CANCELLATION_CUTOFF_HOURS = 24;

/** Hours between now and the visit; negative once the visit has started. */
export function hoursUntilVisit(
  scheduledFor: string,
  now: Date = new Date(),
): number {
  return (new Date(scheduledFor).getTime() - now.getTime()) / 3_600_000;
}

/** The reason this visit cannot be cancelled right now, or null when it can. */
export function visitCancellationBlock(
  scheduledFor: string,
  now: Date = new Date(),
): string | null {
  const hours = hoursUntilVisit(scheduledFor, now);
  if (Number.isNaN(hours)) return null;
  if (hours <= CANCELLATION_CUTOFF_HOURS) {
    return `It's less than ${CANCELLATION_CUTOFF_HOURS} hours to this visit, so it can no longer be cancelled.`;
  }
  return null;
}

export function mapViewingRequestError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Visit requests are not enabled on this database yet. The Phase 2D migration has not been applied.";
  }
  if (error.code === "23505") {
    return "You already have an open visit request for this room.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to request a visit.";
  }
  return "Could not send your visit request. Please try again.";
}

/**
 * Returns the visitor's latest request for this room: the open one, or a
 * completed viewing so the screen can offer the room for booking. RLS restricts
 * this to the caller's own rows, so no requester id is needed in the query.
 */
export async function loadOpenViewingRequest(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ request: ViewingRequestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("listing_viewing_requests")
    .select("id, scheduled_for, status")
    .eq("listing_id", listingId)
    .in("status", ["pending", "confirmed", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { request: null, error: mapViewingRequestError(error) };
  }
  return { request: data ?? null, error: null };
}

function mapViewingCancellationError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Cancelling visits is not enabled on this database yet. Apply the viewing-request migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to cancel your visit.";
  }
  return "Could not cancel this visit. Please try again.";
}

/**
 * Cancels the visitor's own open request. The RLS policy only matches a pending
 * or confirmed request that is more than `CANCELLATION_CUTOFF_HOURS` away, so an
 * update that changes nothing means the cutoff was reached, or the request was
 * already answered.
 */
export async function cancelViewingRequest(
  client: TypedSupabaseClient,
  requestId: string,
): Promise<{ request: ViewingRequestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("listing_viewing_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .in("status", ["pending", "confirmed"])
    .select("id, scheduled_for, status")
    .maybeSingle();

  if (error) {
    return { request: null, error: mapViewingCancellationError(error) };
  }
  if (!data) {
    return {
      request: null,
      error: `It's less than ${CANCELLATION_CUTOFF_HOURS} hours to this visit, so it can no longer be cancelled.`,
    };
  }
  return { request: data, error: null };
}

export type RequestViewingInput = {
  listingId: string;
  requesterId: string;
  scheduledFor: string;
  note?: string | null;
};

/**
 * Creates a pending viewing request. The insert carries only client-writable
 * columns; status defaults to pending and the RLS policy rejects anything else.
 */
export async function requestViewing(
  client: TypedSupabaseClient,
  { listingId, requesterId, scheduledFor, note }: RequestViewingInput,
): Promise<{ request: ViewingRequestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("listing_viewing_requests")
    .insert({
      listing_id: listingId,
      requester_id: requesterId,
      scheduled_for: scheduledFor,
      note: note?.trim() ? note.trim() : null,
    })
    .select("id, scheduled_for, status")
    .single();

  if (error) {
    return { request: null, error: mapViewingRequestError(error) };
  }
  return { request: data, error: null };
}
