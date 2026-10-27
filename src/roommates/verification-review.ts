import type { RoommateVerificationRow } from "@/lib/database.types";

/**
 * Human explanation of a rejected roommate verification.
 *
 * A rejected row is either `suspended` or `blocked`. The moderator's reason is
 * stored on the row; automated submission checks live in `risk_flags`. Both are
 * private to the student and moderators.
 */

export type VerificationRejectionFlag = {
  key: string;
  title: string;
  description: string;
};

const flagCopy: Record<string, Omit<VerificationRejectionFlag, "key">> = {
  shared_phone: {
    title: "Phone number already in use",
    description:
      "This phone number is also attached to another QUARTERS verification. Each student must verify with their own number.",
  },
  thin_answers: {
    title: "Written answers needed more detail",
    description:
      "One of your free-text answers was too short for us to assess. Add a few specific sentences about your routine and why you are looking.",
  },
  uniform_answers: {
    title: "Answers looked automated",
    description:
      "Every habit answer was identical, which can look copied. Answer each question as it actually applies to you.",
  },
};

export function verificationFlagDetails(flags: string[]): VerificationRejectionFlag[] {
  return flags.map((key) => {
    const copy = flagCopy[key] ?? {
      title: "A submission check needs a look",
      description:
        "One of our automated checks flagged this submission. A moderator will explain it in the review note.",
    };
    return { key, ...copy };
  });
}

export type VerificationRejection = {
  kind: "suspended" | "blocked";
  heading: string;
  /** The moderator's own words, falling back to the stored review note. */
  reason: string;
  decidedAt: string | null;
  flags: VerificationRejectionFlag[];
  /** Blocked accounts cannot edit; suspended students can correct answers. */
  canEditAnswers: boolean;
  canAppeal: boolean;
};

export function verificationRejection(
  row: RoommateVerificationRow,
): VerificationRejection | null {
  if (row.status !== "suspended" && row.status !== "blocked") return null;

  const blocked = row.status === "blocked";
  const reason =
    (blocked ? row.blocked_reason : row.suspension_reason) ??
    row.review_note ??
    (blocked
      ? "A moderator blocked this account from roommate discovery after a review."
      : "A moderator paused roommate discovery while your verification is reviewed.");

  return {
    kind: row.status,
    heading: blocked ? "Why your verification was blocked" : "Why your verification is paused",
    reason,
    decidedAt: blocked
      ? (row.blocked_at ?? row.reviewed_at)
      : (row.suspended_at ?? row.reviewed_at),
    flags: verificationFlagDetails(row.risk_flags),
    canEditAnswers: !blocked,
    canAppeal: true,
  };
}

/** Shown in the discovery gate: one sentence the student can act on. */
export function verificationRejectionNotice(row: RoommateVerificationRow): string {
  const review = verificationRejection(row);
  if (!review) return "";
  return review.reason;
}
