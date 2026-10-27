import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Roommate safety: blocking and reporting.
 *
 * A block is pairwise and enforced in the database: discovery hides both
 * profiles, interests are withdrawn, and new messages are refused. The display
 * name is snapshotted at block time because the blocked profile is no longer
 * readable by the blocker.
 *
 * A report is a moderation queue entry. Only the reporter and administrators
 * can read it; the client never sets its status.
 */

export type RoommateReportReason =
  | "harassment"
  | "fake_profile"
  | "scam"
  | "inappropriate"
  | "safety"
  | "other";

export type RoommateReportReasonOption = {
  value: RoommateReportReason;
  label: string;
  hint: string;
};

export const roommateReportReasons: RoommateReportReasonOption[] = [
  {
    value: "harassment",
    label: "Harassment or abuse",
    hint: "Threats, insults, or repeated unwanted contact.",
  },
  {
    value: "fake_profile",
    label: "Fake profile or impersonation",
    hint: "Someone pretending to be another student or using a false identity.",
  },
  {
    value: "scam",
    label: "Scam or money request",
    hint: "Asking for deposits, fees, or bank details before a viewing.",
  },
  {
    value: "inappropriate",
    label: "Inappropriate content",
    hint: "Sexual, violent, or otherwise unsuitable messages or photos.",
  },
  {
    value: "safety",
    label: "Safety concern",
    hint: "Something that made you feel unsafe in or outside QUARTERS.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Tell us what happened so a moderator can look into it.",
  },
];

export const REPORT_DETAILS_MAX = 1000;
export const REPORT_DETAILS_MIN_FOR_OTHER = 10;

export function reportReasonLabel(reason: RoommateReportReason): string {
  return (
    roommateReportReasons.find((option) => option.value === reason)?.label ??
    "Report"
  );
}

/** Returns the first problem with a report draft, or null when it is ready. */
export function validateReport(
  reason: RoommateReportReason | "",
  details: string,
): string | null {
  if (!reason) return "Choose a reason for the report.";
  if (!roommateReportReasons.some((option) => option.value === reason)) {
    return "Choose one of the listed reasons.";
  }

  const trimmed = details.trim();
  if (trimmed.length > REPORT_DETAILS_MAX) {
    return `Keep the details to ${REPORT_DETAILS_MAX} characters or fewer.`;
  }
  if (reason === "other" && trimmed.length < REPORT_DETAILS_MIN_FOR_OTHER) {
    return `Add at least ${REPORT_DETAILS_MIN_FOR_OTHER} characters so we know what happened.`;
  }
  return null;
}

export type BlockedRoommate = {
  id: string;
  profileId: string;
  displayName: string;
  createdAt: string;
};

export type RoommateReportSummary = {
  id: string;
  reason: RoommateReportReason;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
};

function isMissingTable(error: PostgrestError): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

export function mapSafetyError(
  error: PostgrestError,
  action: "load" | "block" | "unblock" | "report",
): string {
  if (isMissingTable(error)) {
    return "Safety tools are not enabled on this database yet. The safety migration has not been applied.";
  }
  if (error.code === "23505") {
    return action === "report"
      ? "You already have an open report about this roommate. Our moderators are reviewing it."
      : "You have already blocked this roommate.";
  }
  if (error.code === "23514") {
    return action === "report"
      ? "Add a little more detail before sending this report."
      : "That block could not be saved. Check the profile and try again.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    if (action === "load") return "Sign in to manage your blocked roommates.";
    if (action === "report") return "Sign in to report this roommate.";
    return action === "unblock"
      ? "Sign in to unblock this roommate."
      : "You cannot block this roommate while a block is already in place.";
  }
  switch (action) {
    case "block":
      return "Could not block this roommate. Please try again.";
    case "unblock":
      return "Could not unblock this roommate. Please try again.";
    case "report":
      return "Could not send your report. Please try again.";
    default:
      return "Could not load your blocked roommates. Please try again.";
  }
}

export async function blockRoommate(
  client: TypedSupabaseClient,
  input: {
    blockerId: string;
    profileId: string;
    displayName: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await client.from("roommate_blocks").insert({
    blocker_id: input.blockerId,
    blocked_profile_id: input.profileId,
    blocked_display_name: input.displayName.trim().slice(0, 80) || "Blocked roommate",
  });

  return { error: error ? mapSafetyError(error, "block") : null };
}

export async function unblockRoommate(
  client: TypedSupabaseClient,
  input: { blockerId: string; profileId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("roommate_blocks")
    .delete()
    .eq("blocker_id", input.blockerId)
    .eq("blocked_profile_id", input.profileId);

  return { error: error ? mapSafetyError(error, "unblock") : null };
}

export async function loadMyBlocks(
  client: TypedSupabaseClient,
  blockerId: string,
): Promise<{ blocks: BlockedRoommate[]; error: string | null }> {
  const { data, error } = await client
    .from("roommate_blocks")
    .select("id, blocked_profile_id, blocked_display_name, created_at")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { blocks: [], error: mapSafetyError(error, "load") };
  }

  return {
    blocks: (data ?? []).map((row) => ({
      id: row.id,
      profileId: row.blocked_profile_id,
      displayName: row.blocked_display_name,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

/** The caller's block on one profile, used to disable interest and chat. */
export async function loadMyBlockForProfile(
  client: TypedSupabaseClient,
  input: { blockerId: string; profileId: string },
): Promise<{ blocked: boolean; error: string | null }> {
  const { data, error } = await client
    .from("roommate_blocks")
    .select("id")
    .eq("blocker_id", input.blockerId)
    .eq("blocked_profile_id", input.profileId)
    .maybeSingle();

  if (error) {
    return { blocked: false, error: mapSafetyError(error, "load") };
  }
  return { blocked: Boolean(data), error: null };
}

export async function reportRoommate(
  client: TypedSupabaseClient,
  input: {
    reporterId: string;
    profileId: string;
    reason: RoommateReportReason;
    details: string;
  },
): Promise<{ report: RoommateReportSummary | null; error: string | null }> {
  const validation = validateReport(input.reason, input.details);
  if (validation) {
    return { report: null, error: validation };
  }

  const details = input.details.trim();
  const { data, error } = await client
    .from("roommate_reports")
    .insert({
      reporter_id: input.reporterId,
      reported_profile_id: input.profileId,
      reason: input.reason,
      details: details || null,
    })
    .select("id, reason, status, created_at")
    .single();

  if (error) {
    return { report: null, error: mapSafetyError(error, "report") };
  }

  return {
    report: {
      id: data.id,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
    },
    error: null,
  };
}

/** The open report the caller already filed about this profile, if any. */
export async function loadMyOpenReport(
  client: TypedSupabaseClient,
  input: { reporterId: string; profileId: string },
): Promise<{ report: RoommateReportSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_reports")
    .select("id, reason, status, created_at")
    .eq("reporter_id", input.reporterId)
    .eq("reported_profile_id", input.profileId)
    .in("status", ["open", "reviewing"])
    .maybeSingle();

  if (error) {
    return { report: null, error: mapSafetyError(error, "load") };
  }

  return {
    report: data
      ? {
          id: data.id,
          reason: data.reason,
          status: data.status,
          createdAt: data.created_at,
        }
      : null,
    error: null,
  };
}
