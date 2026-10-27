import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Report a listing.
 *
 * One report per account per listing, decided by a unique constraint rather
 * than by the screen, so a double tap or a second device cannot file duplicates.
 * Students never read anyone else's report; administrators read them all.
 */
export type ListingReportReason =
  Database["public"]["Enums"]["listing_report_reason"];

export type ListingReport = {
  id: string;
  reason: ListingReportReason;
  status: Database["public"]["Enums"]["listing_report_status"];
  created_at: string;
};

export const listingReportReasons: {
  value: ListingReportReason;
  label: string;
  hint: string;
}[] = [
  {
    value: "scam",
    label: "Looks like a scam",
    hint: "Asks for money before a viewing, or refuses to meet at the property.",
  },
  {
    value: "wrong_details",
    label: "Details are wrong",
    hint: "The rent, address, photos or room type do not match the room.",
  },
  {
    value: "already_taken",
    label: "Already taken",
    hint: "The room is gone but the listing is still published.",
  },
  {
    value: "unreachable",
    label: "Provider won't respond",
    hint: "Messages and viewing requests go unanswered.",
  },
  {
    value: "offensive",
    label: "Offensive content",
    hint: "Photos, wording or rules that should not be on QUARTERS.",
  },
  {
    value: "duplicate",
    label: "Duplicate listing",
    hint: "The same property is published more than once.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Tell us what is wrong in your own words.",
  },
];

export function listingReportReasonLabel(reason: ListingReportReason): string {
  return listingReportReasons.find((entry) => entry.value === reason)?.label ?? "Reported";
}

export const REPORT_DETAILS_MIN = 10;
export const REPORT_DETAILS_MAX = 1000;

/** Null when the draft is valid, otherwise the message to show. */
export function validateReport({
  reason,
  details,
}: {
  reason: ListingReportReason | null;
  details: string;
}): string | null {
  if (!reason) return "Choose why you are reporting this listing.";
  const trimmed = details.trim();
  if (reason === "other" && trimmed.length < REPORT_DETAILS_MIN) {
    return `Describe the problem in at least ${REPORT_DETAILS_MIN} characters.`;
  }
  if (trimmed.length > REPORT_DETAILS_MAX) {
    return `Keep the description under ${REPORT_DETAILS_MAX} characters.`;
  }
  if (trimmed.length > 0 && trimmed.length < REPORT_DETAILS_MIN) {
    return `Add a little more detail, or leave the description empty.`;
  }
  return null;
}

function mapReportError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Reporting is not available yet. Apply the listing-reports migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to report a listing.";
  }
  return "Could not send your report. Please try again.";
}

/**
 * Files a report. A repeat report is reported as such rather than as a failure:
 * the listing is already flagged by this account.
 */
export async function submitListingReport(
  client: TypedSupabaseClient,
  {
    listingId,
    reporterId,
    reason,
    details,
  }: {
    listingId: string;
    reporterId: string;
    reason: ListingReportReason;
    details: string;
  },
): Promise<{ error: string | null; duplicate: boolean }> {
  const validation = validateReport({ reason, details });
  if (validation) return { error: validation, duplicate: false };

  const trimmed = details.trim();
  const { error } = await client.from("listing_reports").insert({
    listing_id: listingId,
    reporter_id: reporterId,
    reason,
    details: trimmed.length > 0 ? trimmed : null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: null, duplicate: true };
    }
    return { error: mapReportError(error), duplicate: false };
  }

  return { error: null, duplicate: false };
}

/** The caller's own report for this listing, if they already filed one. */
export async function loadMyListingReport(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<ListingReport | null> {
  const { data, error } = await client
    .from("listing_reports")
    .select("id, reason, status, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data) return null;
  return data[0] ?? null;
}
