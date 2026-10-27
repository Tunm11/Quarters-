import type { PostgrestError } from "@supabase/supabase-js";
import type { RoommateVerificationAppealRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * A re-review request for a suspended or blocked verification.
 *
 * Students explain what changed or why they believe the decision was wrong.
 * Only moderators can resolve an appeal: reinstating the verification approves
 * it, and a further block declines it (both handled in the database).
 */

export type VerificationAppealReason =
  | "corrected"
  | "mistake"
  | "impersonation"
  | "other";

export type VerificationAppealReasonOption = {
  value: VerificationAppealReason;
  label: string;
  hint: string;
};

export const verificationAppealReasons: VerificationAppealReasonOption[] = [
  {
    value: "corrected",
    label: "I corrected the issue",
    hint: "You changed the flagged details or answers and want another look.",
  },
  {
    value: "mistake",
    label: "I think this was a mistake",
    hint: "The decision refers to something that does not apply to you.",
  },
  {
    value: "impersonation",
    label: "Someone used my details",
    hint: "Your phone number or identity was used on another account without permission.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Explain the situation in your own words.",
  },
];

export type VerificationAppeal = Pick<
  RoommateVerificationAppealRow,
  | "id"
  | "reason"
  | "message"
  | "status"
  | "decision_note"
  | "decided_at"
  | "created_at"
>;

export const APPEAL_MESSAGE_MIN = 30;
export const APPEAL_MESSAGE_MAX = 1000;

export function appealReasonLabel(reason: VerificationAppealReason): string {
  return (
    verificationAppealReasons.find((option) => option.value === reason)?.label ??
    "Re-review request"
  );
}

export function validateAppeal(
  reason: VerificationAppealReason | "",
  message: string,
): string | null {
  if (!reason) return "Choose why you are asking for another review.";
  if (!verificationAppealReasons.some((option) => option.value === reason)) {
    return "Choose one of the listed reasons.";
  }

  const trimmed = message.trim();
  if (trimmed.length < APPEAL_MESSAGE_MIN) {
    return `Explain what changed in at least ${APPEAL_MESSAGE_MIN} characters.`;
  }
  if (trimmed.length > APPEAL_MESSAGE_MAX) {
    return `Keep this to ${APPEAL_MESSAGE_MAX} characters or fewer.`;
  }
  return null;
}

export type AppealStatusMeta = {
  label: string;
  tone: "caution" | "positive" | "danger";
  description: string;
};

export function appealStatusMeta(
  status: VerificationAppeal["status"],
): AppealStatusMeta {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        tone: "positive",
        description: "A moderator approved this request. Your standing has been updated.",
      };
    case "declined":
      return {
        label: "Declined",
        tone: "danger",
        description: "A moderator reviewed this request and kept the current decision.",
      };
    default:
      return {
        label: "Pending review",
        tone: "caution",
        description:
          "A moderator has been notified. Your access stays as it is until they decide.",
      };
  }
}

export function mapAppealError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Re-review requests are not enabled on this database yet. The safety migration has not been applied.";
  }
  if (error.code === "23505") {
    return "You already have a re-review request pending. A moderator will look at it soon.";
  }
  if (error.code === "23514") {
    return "Add a little more detail before sending your request.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in again to request a re-review.";
  }
  return "Could not send your re-review request. Please try again.";
}

export async function loadMyLatestAppeal(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ appeal: VerificationAppeal | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_verification_appeals")
    .select(
      "id, reason, message, status, decision_note, decided_at, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { appeal: null, error: mapAppealError(error) };
  }
  return { appeal: data ?? null, error: null };
}

export async function submitVerificationAppeal(
  client: TypedSupabaseClient,
  input: {
    userId: string;
    verificationId: string;
    reason: VerificationAppealReason;
    message: string;
  },
): Promise<{ appeal: VerificationAppeal | null; error: string | null }> {
  const validation = validateAppeal(input.reason, input.message);
  if (validation) {
    return { appeal: null, error: validation };
  }

  const { data, error } = await client
    .from("roommate_verification_appeals")
    .insert({
      user_id: input.userId,
      verification_id: input.verificationId,
      reason: input.reason,
      message: input.message.trim(),
    })
    .select(
      "id, reason, message, status, decision_note, decided_at, created_at",
    )
    .single();

  if (error) {
    return { appeal: null, error: mapAppealError(error) };
  }
  return { appeal: data, error: null };
}
