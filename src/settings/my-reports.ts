import type { PostgrestError } from "@supabase/supabase-js";
import { listingReportReasonLabel } from "@/listings/listing-reports";
import type { TypedSupabaseClient } from "@/lib/supabase";
import {
  reportReasonLabel,
  type RoommateReportReason,
} from "@/roommates/safety";

/**
 * The reports one account has filed, read through the my_reports RPC.
 *
 * A report is a moderation queue entry, not a promise: the row is written and
 * only its status ever moves. This is the read side, so a student can come back
 * and see what they reported and where it stands instead of it vanishing.
 */
export type MyReportKind = "person" | "listing";

/** Badge tones a report status can use, all present in BadgeTone. */
export type MyReportTone = "neutral" | "accent" | "positive" | "caution";

export type MyReport = {
  id: string;
  kind: MyReportKind;
  /** Who or what the report is about. */
  subject: string;
  reasonLabel: string;
  statusLabel: string;
  tone: MyReportTone;
  /** Still awaiting a decision, so the screen can say how many are open. */
  awaiting: boolean;
  createdAt: string;
};

/** A row as returned by my_reports, before it is turned into display data. */
export type MyReportRow = {
  kind: string;
  report_id: string;
  subject: string | null;
  reason: string;
  status: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  open: "Open",
  reviewing: "With a moderator",
  reviewed: "Reviewed",
  resolved: "Reviewed",
  dismissed: "Dismissed",
};

const statusTones: Record<string, MyReportTone> = {
  open: "caution",
  reviewing: "accent",
  reviewed: "positive",
  resolved: "positive",
  dismissed: "neutral",
};

export function reportStatusLabel(status: string): string {
  return statusLabels[status] ?? "Sent";
}

export function reportStatusTone(status: string): MyReportTone {
  return statusTones[status] ?? "neutral";
}

/** The reason in the words of whoever filed it, whatever kind it is. */
export function reportReasonText(kind: MyReportKind, reason: string): string {
  if (kind === "listing") {
    return listingReportReasonLabel(reason as never);
  }
  return reportReasonLabel(reason as RoommateReportReason);
}

/** Rejects an unrecognised kind rather than guessing which queue it belongs to. */
export function isReportKind(kind: string): kind is MyReportKind {
  return kind === "person" || kind === "listing";
}

/** Rows to display data, newest first, with unknown kinds dropped. */
export function buildMyReports(rows: MyReportRow[]): MyReport[] {
  return rows
    .filter((row) => isReportKind(row.kind))
    .map((row) => {
      const kind = row.kind as MyReportKind;
      const status = row.status;
      return {
        id: row.report_id,
        kind,
        subject: row.subject?.trim() || (kind === "listing" ? "A room" : "A student"),
        reasonLabel: reportReasonText(kind, row.reason),
        statusLabel: reportStatusLabel(status),
        tone: reportStatusTone(status),
        awaiting: status === "open" || status === "reviewing",
        createdAt: row.created_at,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countAwaitingReports(reports: MyReport[]): number {
  return reports.filter((report) => report.awaiting).length;
}

export function mapMyReportsError(error: PostgrestError): string {
  if (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205"
  ) {
    return "Your reports are not available yet. Apply the reporting migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see the reports you filed.";
  }
  return "Could not load the reports you filed. Please try again.";
}

export async function loadMyReports(
  client: TypedSupabaseClient,
): Promise<{ reports: MyReport[]; error: string | null }> {
  const { data, error } = await client.rpc("my_reports");

  if (error) {
    return { reports: [], error: mapMyReportsError(error) };
  }

  return {
    reports: buildMyReports((data ?? []) as MyReportRow[]),
    error: null,
  };
}
