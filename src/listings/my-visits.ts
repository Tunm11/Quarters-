import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";
import { loadListingsByIds, type PublicListing } from "@/listings/public-listings";
import type { BadgeTone } from "@/components/ui/badge";

export type VisitStatus = Database["public"]["Enums"]["viewing_request_status"];

/** One visit request as the visitor may read it: no requester id, ever. */
export type VisitRequest = {
  id: string;
  listing_id: string;
  scheduled_for: string;
  status: VisitStatus;
  note: string | null;
  created_at: string;
};

/** A visit plus the room it is for. The room can disappear from the catalogue. */
export type MyVisit = {
  request: VisitRequest;
  listing: PublicListing | null;
};

const VISIT_COLUMNS =
  "id, listing_id, scheduled_for, status, note, created_at";

/** Visits still ahead of the visitor and not yet answered against them. */
export function isUpcomingVisit(visit: MyVisit, now: Date = new Date()): boolean {
  if (visit.request.status !== "pending" && visit.request.status !== "confirmed") {
    return false;
  }
  return new Date(visit.request.scheduled_for).getTime() >= now.getTime();
}

/**
 * Splits the list into what is still ahead (soonest first) and everything else
 * — declined, cancelled, completed, or a time that has already passed (newest
 * first). The screen shows both, because the history explains what happened.
 */
export function splitVisits(
  visits: MyVisit[],
  now: Date = new Date(),
): { upcoming: MyVisit[]; past: MyVisit[] } {
  const upcoming: MyVisit[] = [];
  const past: MyVisit[] = [];

  for (const visit of visits) {
    if (isUpcomingVisit(visit, now)) upcoming.push(visit);
    else past.push(visit);
  }

  const time = (visit: MyVisit) => new Date(visit.request.scheduled_for).getTime();
  upcoming.sort((a, b) => time(a) - time(b));
  past.sort((a, b) => time(b) - time(a));

  return { upcoming, past };
}

/** What the badge should say, which is not always the stored status. */
export type VisitDisplayStatus = VisitStatus | "passed";

export const visitStatusMeta: Record<
  VisitStatus,
  { label: string; tone: BadgeTone; description: string }
> = {
  pending: {
    label: "Awaiting lister",
    tone: "caution",
    description: "The lister has not confirmed this visit yet.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "positive",
    description: "The lister confirmed this visit.",
  },
  declined: {
    label: "Declined",
    tone: "danger",
    description: "The lister could not host this visit.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    description: "You cancelled this visit.",
  },
  completed: {
    label: "Visited",
    tone: "outline",
    description: "This visit has already happened.",
  },
};

/**
 * A pending or confirmed request whose slot has already gone by is shown as
 * "Visit passed" rather than claiming it is still waiting or confirmed — nobody
 * in the app moves a stale request to `completed`.
 */
export const visitDisplayMeta: Record<
  VisitDisplayStatus,
  { label: string; tone: BadgeTone; description: string }
> = {
  ...visitStatusMeta,
  passed: {
    label: "Visit passed",
    tone: "neutral",
    description: "This slot has gone by without the visit being marked done.",
  },
};

export function displayStatusFor(
  visit: MyVisit,
  now: Date = new Date(),
): VisitDisplayStatus {
  const { status, scheduled_for } = visit.request;
  const overdue = new Date(scheduled_for).getTime() < now.getTime();
  if (overdue && (status === "pending" || status === "confirmed")) {
    return "passed";
  }
  return status;
}

export function mapMyVisitsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Visit requests are not enabled on this database yet. Apply the viewing-request migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see your visits.";
  }
  return "Could not load your visits. Please try again.";
}

/**
 * Every visit the caller has requested, newest scheduled first. RLS limits the
 * table to the caller's own rows, so no requester filter is needed, and the
 * rooms are resolved through the public read model (a room that is no longer
 * published simply has no card).
 */
export async function loadMyVisits(
  client: TypedSupabaseClient,
): Promise<{ visits: MyVisit[]; error: string | null }> {
  const { data, error } = await client
    .from("listing_viewing_requests")
    .select(VISIT_COLUMNS)
    .order("scheduled_for", { ascending: false })
    .limit(50);

  if (error) {
    return { visits: [], error: mapMyVisitsError(error) };
  }

  const requests = (data ?? []) as VisitRequest[];
  if (requests.length === 0) {
    return { visits: [], error: null };
  }

  const listings = await loadListingsByIds(client, [
    ...new Set(requests.map((request) => request.listing_id)),
  ]);

  return {
    visits: requests.map((request) => ({
      request,
      listing: listings.get(request.listing_id) ?? null,
    })),
    error: null,
  };
}
