import { describe, expect, it } from "vitest";
import type { RoommateVerificationRow } from "@/lib/database.types";
import {
  verificationFlagDetails,
  verificationRejection,
  verificationRejectionNotice,
} from "@/roommates/verification-review";

function verificationRow(
  overrides: Partial<RoommateVerificationRow> = {},
): RoommateVerificationRow {
  return {
    id: "verification-1",
    user_id: "user-1",
    full_name: "Amara Okafor",
    phone: "+234 801 234 5678",
    institution: "University of Lagos",
    study_level: "300",
    city: "Lagos",
    neighbourhood: "Akoka",
    gender: "female",
    school_email: null,
    answers: { about_you: "A short answer." },
    tidy_score: 4,
    sleep_score: 2,
    social_score: 3,
    guest_score: 2,
    routine_score: 4,
    status: "verified",
    review_state: "clear",
    risk_flags: [],
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    suspended_at: null,
    suspension_reason: null,
    blocked_at: null,
    blocked_reason: null,
    consent_accuracy_at: "2026-10-24T10:00:00Z",
    consent_monitoring_at: "2026-10-24T10:00:00Z",
    submitted_at: "2026-10-24T10:00:00Z",
    created_at: "2026-10-24T10:00:00Z",
    updated_at: "2026-10-24T10:00:00Z",
    ...overrides,
  };
}

describe("verification rejection explanation", () => {
  it("returns nothing for a verified row", () => {
    expect(verificationRejection(verificationRow())).toBeNull();
  });

  it("shows the moderator reason and allows editing while suspended", () => {
    const review = verificationRejection(
      verificationRow({
        status: "suspended",
        review_state: "under_review",
        suspension_reason: "Phone number matched a duplicate account.",
        suspended_at: "2026-10-25T09:00:00Z",
        risk_flags: ["shared_phone"],
      }),
    );

    expect(review).not.toBeNull();
    expect(review?.kind).toBe("suspended");
    expect(review?.reason).toBe("Phone number matched a duplicate account.");
    expect(review?.decidedAt).toBe("2026-10-25T09:00:00Z");
    expect(review?.canEditAnswers).toBe(true);
    expect(review?.canAppeal).toBe(true);
    expect(review?.flags).toHaveLength(1);
    expect(review?.flags[0]?.key).toBe("shared_phone");
  });

  it("locks answers when blocked but still allows an appeal", () => {
    const review = verificationRejection(
      verificationRow({
        status: "blocked",
        blocked_reason: "Repeated contact after a block.",
        blocked_at: "2026-10-25T12:00:00Z",
      }),
    );

    expect(review?.kind).toBe("blocked");
    expect(review?.canEditAnswers).toBe(false);
    expect(review?.canAppeal).toBe(true);
    expect(review?.heading).toBe("Why your verification was blocked");
  });

  it("falls back to the review note and then a status default", () => {
    const withNote = verificationRejection(
      verificationRow({ status: "suspended", review_note: "Needs a manual look." }),
    );
    expect(withNote?.reason).toBe("Needs a manual look.");

    const withoutReason = verificationRejection(
      verificationRow({ status: "blocked" }),
    );
    expect(withoutReason?.reason).toContain("blocked this account");
  });

  it("describes known flags and keeps unknown ones actionable", () => {
    const flags = verificationFlagDetails(["shared_phone", "uniform_answers", "new_check"]);
    expect(flags.map((flag) => flag.key)).toEqual([
      "shared_phone",
      "uniform_answers",
      "new_check",
    ]);
    expect(flags[0]?.description).toContain("phone number");
    expect(flags[2]?.title).toBe("A submission check needs a look");
  });

  it("provides the gate notice from the same reason", () => {
    expect(
      verificationRejectionNotice(
        verificationRow({
          status: "suspended",
          suspension_reason: "Answers could not be confirmed.",
        }),
      ),
    ).toBe("Answers could not be confirmed.");
  });
});
