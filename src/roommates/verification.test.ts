import { describe, expect, it } from "vitest";
import {
  compatibilityBreakdown,
  compatibilityScore,
  compatibilityVerdict,
  consentItems,
  deriveTraitScores,
  draftFromVerification,
  emptyVerificationDraft,
  standingNotice,
  traitBandLabel,
  validateVerification,
  validateVerificationStep,
  verificationSteps,
  type VerificationAnswers,
  type VerificationDraft,
} from "@/roommates/verification";
import type { RoommateVerificationRow } from "@/lib/database.types";

/** A complete, valid draft used as the baseline for the tests below. */
function validAnswers(): VerificationAnswers {
  return {
    tidy: "4",
    chores: "rota",
    sleep: "2",
    wake: "2",
    cooking: "most-days",
    smoking: "never",
    alcohol: "socially",
    pets: "none",
    sharing_food: "basics",
    guests: "2",
    overnight_guests: "2",
    noise: "2",
    quiet_hours: "2",
    conflict: "3",
    borrowing: "ask",
    study: "library",
    weekends: "2",
    friendship: "2",
    interests: ["reading", "music"],
    deal_breakers: ["parties"],
    about_you:
      "I'm a 300 level Law student at UNILAG. I'm usually in the library until 8pm and keep shared spaces tidy.",
    why_roommate: "My current place is too far from campus and I want to split rent closer to Akoka.",
    emergency_contact: "",
  };
}

function validDraft(): VerificationDraft {
  const draft = emptyVerificationDraft({
    fullName: "Amara Okafor",
    phone: "+234 801 234 5678",
    institution: "University of Lagos",
    studyLevel: "300",
    city: "Lagos",
    neighbourhood: "Akoka",
    gender: "female",
    schoolEmail: "amara@student.unilag.edu.ng",
  });
  draft.answers = validAnswers();
  draft.consents = { accurate: true, monitored: true, respectful: true };
  return draft;
}

function verificationRow(overrides: Partial<RoommateVerificationRow> = {}): RoommateVerificationRow {
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
    answers: { tidy: "4" },
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

describe("roommate verification questionnaire", () => {
  it("covers identity, habits, behaviour and consent in four steps", () => {
    expect(verificationSteps.map((step) => step.id)).toEqual([
      "identity",
      "habits",
      "life",
      "trust",
    ]);
    expect(consentItems).toHaveLength(3);

    // Every required choice has answers, so a determined student can finish.
    for (const step of verificationSteps) {
      for (const question of step.questions) {
        if (question.kind === "single") {
          expect(question.options.length).toBeGreaterThan(1);
        }
        if (question.kind === "multi") {
          expect(question.options.length).toBeGreaterThan(question.maxSelections);
        }
      }
    }
  });

  it("accepts a complete draft", () => {
    expect(validateVerification(validDraft())).toEqual({});
  });

  it("requires each step's answers before continuing", () => {
    const draft = emptyVerificationDraft();
    expect(validateVerificationStep("identity", draft)).toMatchObject({
      fullName: expect.any(String),
      phone: expect.any(String),
      institution: expect.any(String),
      studyLevel: expect.any(String),
      city: expect.any(String),
    });

    expect(Object.keys(validateVerificationStep("habits", draft)).length).toBe(9);
    expect(Object.keys(validateVerificationStep("life", draft)).length).toBe(10);
  });

  it("checks phone, email and free-text lengths", () => {
    const draft = validDraft();
    draft.identity.phone = "123";
    draft.identity.schoolEmail = "not-an-email";
    draft.answers.about_you = "too short";
    draft.answers.why_roommate = "also short";

    const errors = validateVerification(draft);
    expect(errors.phone).toContain("phone");
    expect(errors.schoolEmail).toContain("school email");
    expect(errors.about_you).toContain("at least 40");
    expect(errors.why_roommate).toContain("at least 20");
  });

  it("limits multi-select questions and allows the optional one to be empty", () => {
    const draft = validDraft();
    draft.answers.interests = [];
    draft.answers.deal_breakers = [];
    const errors = validateVerification(draft);
    expect(errors.interests).toBeTruthy();
    expect(errors.deal_breakers).toBeUndefined();

    draft.answers.interests = ["music", "football", "gaming", "cooking", "reading", "fitness", "tech"];
    expect(validateVerification(draft).interests).toContain("at most 6");
  });

  it("requires all three consents", () => {
    const draft = validDraft();
    draft.consents = { accurate: true, monitored: false, respectful: false };
    const errors = validateVerification(draft);
    expect(errors.consent_monitored).toBeTruthy();
    expect(errors.consent_respectful).toBeTruthy();
    expect(errors.consent_accurate).toBeUndefined();
  });
});

describe("compatibility traits", () => {
  it("derives 1-5 traits from the chosen options", () => {
    const traits = deriveTraitScores(validAnswers());

    for (const score of Object.values(traits)) {
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(5);
    }
    // This draft is tidy, early-rising, quiet and fairly structured.
    expect(traits.tidy).toBeGreaterThan(3);
    expect(traits.sleep).toBeLessThan(2.5);
    expect(traits.social).toBeLessThan(3);
    expect(traits.guests).toBeLessThan(2.5);
    expect(traits.routine).toBeGreaterThan(3);
  });

  it("falls back to a neutral score when no trait data exists", () => {
    expect(deriveTraitScores({})).toEqual({
      tidy: 3,
      sleep: 3,
      social: 3,
      guests: 3,
      routine: 3,
    });
  });

  it("scores identical habits at 100 and opposite habits at 0", () => {
    const me = { tidy: 3, sleep: 3, social: 3, guests: 3, routine: 3 };
    expect(compatibilityScore(me, { ...me })).toBe(100);
    expect(
      compatibilityScore(
        { tidy: 1, sleep: 1, social: 1, guests: 1, routine: 1 },
        { tidy: 5, sleep: 5, social: 5, guests: 5, routine: 5 },
      ),
    ).toBe(0);
  });

  it("needs at least three shared traits before showing a score", () => {
    expect(compatibilityScore({ tidy: 3 }, { tidy: 3 })).toBeNull();
    expect(compatibilityScore(null, { tidy: 3 })).toBeNull();
    expect(
      compatibilityScore(
        { tidy: 3, sleep: 3, social: 3 },
        { tidy: 3, sleep: 3, social: 3 },
      ),
    ).toBe(100);
  });

  it("labels the score honestly", () => {
    expect(compatibilityVerdict(100).label).toBe("Strong fit");
    expect(compatibilityVerdict(75).label).toBe("Good fit");
    expect(compatibilityVerdict(60).label).toBe("Worth a chat");
    expect(compatibilityVerdict(30).label).toBe("Different rhythms");
  });

  it("describes each trait on the 1-5 band and builds a comparison", () => {
    expect(traitBandLabel("sleep", 1)).toBe("Early riser");
    expect(traitBandLabel("sleep", 5)).toBe("Very late nights");

    const breakdown = compatibilityBreakdown(
      { tidy: 4, sleep: 2, social: 3, guests: 2, routine: 4 },
      { tidy: 2, sleep: 2, social: 5, guests: 4, routine: 3 },
    );
    expect(breakdown).toHaveLength(5);
    expect(breakdown[0]).toMatchObject({
      key: "tidy",
      mineLabel: "Tidy",
      theirsLabel: "Casual",
    });
  });
});

describe("verification records", () => {
  it("rebuilds an editable draft without trusting unknown answer shapes", () => {
    const row = verificationRow({
      answers: { tidy: "4", interests: ["music", "tech"], broken: 5 },
    });
    const draft = draftFromVerification(row);

    expect(draft.identity.fullName).toBe("Amara Okafor");
    expect(draft.answers.tidy).toBe("4");
    expect(draft.answers.interests).toEqual(["music", "tech"]);
    expect(draft.answers.broken).toBeUndefined();
    expect(draft.consents).toEqual({ accurate: true, monitored: true, respectful: true });
  });

  it("surfaces a moderator reason for suspended and blocked accounts", () => {
    expect(standingNotice(verificationRow())).toBeNull();
    expect(
      standingNotice(
        verificationRow({ status: "suspended", suspension_reason: "Duplicate account under review." }),
      ),
    ).toBe("Duplicate account under review.");
    expect(
      standingNotice(verificationRow({ status: "blocked", blocked_reason: "Fake profile." })),
    ).toBe("Fake profile.");
  });
});
