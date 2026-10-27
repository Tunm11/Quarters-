import type { PostgrestError } from "@supabase/supabase-js";
import type {
  RoommateProfileRow,
  RoommateVerificationRow,
} from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Roommate verification: the questionnaire that unlocks discovery.
 *
 * Verification is intentionally extensive — identity, living habits, behaviour
 * and social life — because the answers double as the compatibility signal
 * students see on each other's cards. Nothing here is public: raw answers stay
 * in the owner-only roommate_verifications row; only the derived 1-5 traits are
 * mirrored onto the discovery profile.
 */

export type TraitKey = "tidy" | "sleep" | "social" | "guests" | "routine";

export type TraitScores = Record<TraitKey, number>;

/** A partial trait source: verification row, profile row or draft scores. */
export type TraitSource = Partial<Record<TraitKey, number | null>>;

export const traitKeys: TraitKey[] = ["tidy", "sleep", "social", "guests", "routine"];

export const traitMeta: Record<TraitKey, { label: string; hints: [string, string] }> = {
  tidy: { label: "Tidiness", hints: ["Relaxed about mess", "Spotless"] },
  sleep: { label: "Sleep rhythm", hints: ["Early riser", "Late nights"] },
  social: { label: "Social energy", hints: ["Private", "Very social"] },
  guests: { label: "Guests", hints: ["Rarely hosts", "Always hosting"] },
  routine: { label: "Routine", hints: ["Spontaneous", "Very structured"] },
};

/** Wording for each trait at each 1-5 band, used on the detail screen. */
const traitBandLabels: Record<TraitKey, [string, string, string, string, string]> = {
  tidy: ["Relaxed about mess", "Casual", "Balanced", "Tidy", "Spotless"],
  sleep: ["Early riser", "Morning person", "Flexible hours", "Night owl", "Very late nights"],
  social: ["Private", "Low-key", "Balanced", "Sociable", "Very social"],
  guests: ["Rarely hosts", "Occasional guests", "Sometimes hosts", "Hosts often", "Always hosting"],
  routine: ["Spontaneous", "Fairly flexible", "Balanced", "Fairly structured", "Very structured"],
};

export function traitBandLabel(key: TraitKey, score: number): string {
  const band = Math.min(4, Math.max(0, Math.round(score) - 1));
  return traitBandLabels[key][band];
}

/* -------------------------------------------------------------------------- */
/* Questionnaire                                                              */
/* -------------------------------------------------------------------------- */

export type VerificationAnswerValue = string | string[];
export type VerificationAnswers = Record<string, VerificationAnswerValue>;

export type ChoiceOption = {
  value: string;
  label: string;
  hint?: string;
  /** Absolute trait values this answer stands for, on the 1-5 scale. */
  traits?: Partial<TraitScores>;
};

export type SingleQuestion = {
  id: string;
  kind: "single";
  prompt: string;
  help?: string;
  required: boolean;
  options: ChoiceOption[];
};

export type MultiQuestion = {
  id: string;
  kind: "multi";
  prompt: string;
  help?: string;
  required: boolean;
  maxSelections: number;
  options: { value: string; label: string }[];
};

export type TextQuestion = {
  id: string;
  kind: "text";
  prompt: string;
  help?: string;
  required: boolean;
  minLength: number;
  maxLength: number;
  placeholder?: string;
};

export type VerificationQuestion = SingleQuestion | MultiQuestion | TextQuestion;

export type VerificationStepId = "identity" | "habits" | "life" | "trust";

export type VerificationStep = {
  id: VerificationStepId;
  title: string;
  description: string;
  /** Identity is rendered from identityFields; other steps from questions. */
  questions: VerificationQuestion[];
};

export type StudyLevel =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "postgraduate"
  | "recent_graduate"
  | "other";

export type VerificationGender = "female" | "male" | "prefer_not_to_say";

export type VerificationIdentity = {
  fullName: string;
  phone: string;
  institution: string;
  studyLevel: StudyLevel | "";
  city: string;
  neighbourhood: string;
  gender: VerificationGender | "";
  schoolEmail: string;
};

export type VerificationConsents = {
  accurate: boolean;
  monitored: boolean;
  respectful: boolean;
};

export type VerificationDraft = {
  identity: VerificationIdentity;
  answers: VerificationAnswers;
  consents: VerificationConsents;
};

export const identityFields: {
  key: keyof VerificationIdentity;
  label: string;
  placeholder: string;
  description?: string;
  type: "text" | "tel" | "email";
  autoComplete?: string;
  maxLength: number;
  optional?: boolean;
}[] = [
  {
    key: "fullName",
    label: "Full name",
    placeholder: "As it appears on your student ID",
    description: "Prefilled from your QUARTERS profile. Never shown publicly.",
    type: "text",
    autoComplete: "name",
    maxLength: 80,
  },
  {
    key: "phone",
    label: "Phone / WhatsApp number",
    placeholder: "+234 801 234 5678",
    description: "Private. Used only for verification and moderation follow-up.",
    type: "tel",
    autoComplete: "tel",
    maxLength: 20,
  },
  {
    key: "institution",
    label: "School or institution",
    placeholder: "University of Lagos",
    type: "text",
    autoComplete: "organization",
    maxLength: 120,
  },
  {
    key: "city",
    label: "City",
    placeholder: "Lagos",
    type: "text",
    autoComplete: "address-level2",
    maxLength: 80,
  },
  {
    key: "neighbourhood",
    label: "Area / neighbourhood",
    placeholder: "Akoka",
    type: "text",
    autoComplete: "address-level3",
    maxLength: 80,
    optional: true,
  },
  {
    key: "schoolEmail",
    label: "School email",
    placeholder: "you@student.unilag.edu.ng",
    description: "Optional, but it speeds up a review if your profile is flagged.",
    type: "email",
    autoComplete: "email",
    maxLength: 120,
    optional: true,
  },
];

export const studyLevelOptions: { value: StudyLevel; label: string }[] = [
  { value: "100", label: "100 level" },
  { value: "200", label: "200 level" },
  { value: "300", label: "300 level" },
  { value: "400", label: "400 level" },
  { value: "500", label: "500 level" },
  { value: "postgraduate", label: "Postgraduate" },
  { value: "recent_graduate", label: "Recent graduate" },
  { value: "other", label: "Other" },
];

export const genderOptions: { value: VerificationGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const tidyOptions: ChoiceOption[] = [
  { value: "1", label: "Relaxed — a little mess is fine", traits: { tidy: 1 } },
  { value: "2", label: "Casual — tidy when it matters", traits: { tidy: 2 } },
  { value: "3", label: "Balanced — I tidy as I go", traits: { tidy: 3 } },
  { value: "4", label: "Tidy — surfaces clear most days", traits: { tidy: 4 } },
  { value: "5", label: "Spotless — everything has a place", traits: { tidy: 5 } },
];

export const verificationSteps: VerificationStep[] = [
  {
    id: "identity",
    title: "About you",
    description:
      "Start with who you are. Your full name comes from your account profile; the rest is kept private and only seen by moderators.",
    questions: [],
  },
  {
    id: "habits",
    title: "Living habits",
    description:
      "How you keep a home. These answers are the biggest part of your compatibility score.",
    questions: [
      {
        id: "tidy",
        kind: "single",
        prompt: "How tidy do you keep shared spaces?",
        required: true,
        options: tidyOptions,
      },
      {
        id: "chores",
        kind: "single",
        prompt: "How should shared chores work?",
        required: true,
        options: [
          { value: "rota", label: "A rota with clear days", traits: { tidy: 4, routine: 5 } },
          { value: "as-you-go", label: "Clean as you go", traits: { tidy: 4, routine: 3 } },
          { value: "weekend", label: "One big clean at the weekend", traits: { tidy: 3, routine: 4 } },
          { value: "whoever", label: "Whoever notices first", traits: { tidy: 2, routine: 2 } },
          { value: "help", label: "Split the cost of help if we can", traits: { tidy: 2, routine: 2 } },
        ],
      },
      {
        id: "sleep",
        kind: "single",
        prompt: "When do you usually go to sleep?",
        required: true,
        options: [
          { value: "1", label: "Before 10pm", traits: { sleep: 1 } },
          { value: "2", label: "Around 11pm", traits: { sleep: 2 } },
          { value: "3", label: "Around midnight", traits: { sleep: 3 } },
          { value: "4", label: "Between 1am and 2am", traits: { sleep: 4 } },
          { value: "5", label: "After 2am", traits: { sleep: 5 } },
        ],
      },
      {
        id: "wake",
        kind: "single",
        prompt: "When does your day usually start?",
        required: true,
        options: [
          { value: "1", label: "Before 6am", traits: { sleep: 1 } },
          { value: "2", label: "Around 7am", traits: { sleep: 2 } },
          { value: "3", label: "Around 8am", traits: { sleep: 3 } },
          { value: "4", label: "Around 9am", traits: { sleep: 4 } },
          { value: "5", label: "After 10am", traits: { sleep: 5 } },
        ],
      },
      {
        id: "cooking",
        kind: "single",
        prompt: "How often do you cook at home?",
        required: true,
        options: [
          { value: "rarely", label: "Rarely — mostly eat out", traits: { routine: 2 } },
          { value: "sometimes", label: "A few times a week", traits: { routine: 3 } },
          { value: "most-days", label: "Most days", traits: { routine: 4 } },
          { value: "meal-prep", label: "I meal-prep for the week", traits: { routine: 5 } },
        ],
      },
      {
        id: "smoking",
        kind: "single",
        prompt: "Smoking or vaping?",
        required: true,
        options: [
          { value: "never", label: "Never" },
          { value: "outside", label: "Only outside" },
          { value: "occasionally", label: "Occasionally" },
          { value: "regularly", label: "Regularly" },
        ],
      },
      {
        id: "alcohol",
        kind: "single",
        prompt: "Drinking at home?",
        required: true,
        options: [
          { value: "never", label: "Never" },
          { value: "socially", label: "Socially, now and then" },
          { value: "regularly", label: "Regularly" },
        ],
      },
      {
        id: "pets",
        kind: "single",
        prompt: "Pets?",
        required: true,
        options: [
          { value: "none", label: "I have none and prefer a pet-free flat" },
          { value: "comfortable", label: "I don't have pets but I'm comfortable with them" },
          { value: "have", label: "I have a pet I would bring" },
        ],
      },
      {
        id: "sharing_food",
        kind: "single",
        prompt: "How should groceries work?",
        required: true,
        options: [
          { value: "separate", label: "Everyone buys their own" },
          { value: "basics", label: "Share basics, buy the rest separately" },
          { value: "together", label: "Share the shopping and split costs" },
        ],
      },
    ],
  },
  {
    id: "life",
    title: "Behaviour & social life",
    description:
      "How you share a space and spend your time. Honest answers make matching useful — there are no wrong ones.",
    questions: [
      {
        id: "guests",
        kind: "single",
        prompt: "How often do you host friends at home?",
        required: true,
        options: [
          { value: "1", label: "Rarely or never", traits: { guests: 1 } },
          { value: "2", label: "Once in a while", traits: { guests: 2 } },
          { value: "3", label: "A few times a month", traits: { guests: 3 } },
          { value: "4", label: "Most weeks", traits: { guests: 4 } },
          { value: "5", label: "Most days — my flat is the meeting point", traits: { guests: 5 } },
        ],
      },
      {
        id: "overnight_guests",
        kind: "single",
        prompt: "How do you feel about overnight guests?",
        required: true,
        options: [
          { value: "1", label: "Not in a shared flat", traits: { guests: 1 } },
          { value: "2", label: "Rarely, with notice", traits: { guests: 2 } },
          { value: "3", label: "Fine with a heads-up", traits: { guests: 3 } },
          { value: "4", label: "Often — I'd want the same freedom", traits: { guests: 4 } },
          { value: "5", label: "Very often, no notice needed", traits: { guests: 5 } },
        ],
      },
      {
        id: "noise",
        kind: "single",
        prompt: "How much noise can you live with?",
        required: true,
        options: [
          { value: "1", label: "I need it quiet to focus", traits: { social: 1 } },
          { value: "2", label: "Low music is fine", traits: { social: 2 } },
          { value: "3", label: "Normal conversation and TV", traits: { social: 3 } },
          { value: "4", label: "Lively is fine", traits: { social: 4 } },
          { value: "5", label: "The louder the better", traits: { social: 5 } },
        ],
      },
      {
        id: "quiet_hours",
        kind: "single",
        prompt: "When should the flat be quiet?",
        required: true,
        options: [
          { value: "1", label: "From 9pm — I'm up early", traits: { sleep: 1 } },
          { value: "2", label: "From 10pm", traits: { sleep: 2 } },
          { value: "3", label: "From midnight", traits: { sleep: 3 } },
          { value: "4", label: "Only after 2am", traits: { sleep: 4 } },
          { value: "5", label: "No fixed quiet hours", traits: { sleep: 5 } },
        ],
      },
      {
        id: "conflict",
        kind: "single",
        prompt: "When a flatmate does something that bothers you…",
        required: true,
        options: [
          { value: "1", label: "I let it go", traits: { routine: 2 } },
          { value: "2", label: "I drop a hint", traits: { routine: 2 } },
          { value: "3", label: "I bring it up within a day", traits: { routine: 4 } },
          { value: "4", label: "I suggest a flat meeting", traits: { routine: 5 } },
        ],
      },
      {
        id: "borrowing",
        kind: "single",
        prompt: "How should personal items be treated?",
        required: true,
        options: [
          { value: "ask", label: "Ask every time" },
          { value: "basics", label: "Basics are open, ask for the rest" },
          { value: "open", label: "What's mine is ours" },
        ],
      },
      {
        id: "study",
        kind: "single",
        prompt: "Where do you study best?",
        required: true,
        options: [
          { value: "home-alone", label: "At home, alone", traits: { social: 1 } },
          { value: "home-company", label: "At home with someone around", traits: { social: 4 } },
          { value: "library", label: "In the library", traits: { social: 2 } },
          { value: "campus", label: "On campus, between classes", traits: { social: 3 } },
        ],
      },
      {
        id: "weekends",
        kind: "single",
        prompt: "Most weekends you are…",
        required: true,
        options: [
          { value: "1", label: "Home, resting", traits: { social: 1 } },
          { value: "2", label: "Home with one or two friends", traits: { social: 2 } },
          { value: "3", label: "Out part of the time", traits: { social: 3 } },
          { value: "4", label: "Out most of the time", traits: { social: 4 } },
          { value: "5", label: "Out every weekend, usually in a group", traits: { social: 5 } },
        ],
      },
      {
        id: "friendship",
        kind: "single",
        prompt: "What do you want from a roommate?",
        required: true,
        options: [
          { value: "1", label: "Just to split rent and keep things calm", traits: { social: 1 } },
          { value: "2", label: "Friendly, but with our own lives", traits: { social: 2 } },
          { value: "3", label: "Someone to cook or watch TV with sometimes", traits: { social: 3 } },
          { value: "4", label: "A friend to do things with most weeks", traits: { social: 4 } },
          { value: "5", label: "A close friend — we do almost everything together", traits: { social: 5 } },
        ],
      },
      {
        id: "interests",
        kind: "multi",
        prompt: "Pick the things you actually enjoy",
        help: "Choose up to six. Used to suggest conversation starters, never published.",
        required: true,
        maxSelections: 6,
        options: [
          { value: "music", label: "Music" },
          { value: "football", label: "Football" },
          { value: "gaming", label: "Gaming" },
          { value: "cooking", label: "Cooking" },
          { value: "reading", label: "Reading" },
          { value: "fitness", label: "Gym / fitness" },
          { value: "faith", label: "Faith / community" },
          { value: "movies", label: "Movies & series" },
          { value: "art", label: "Art / design" },
          { value: "tech", label: "Tech & startups" },
          { value: "volunteering", label: "Volunteering" },
          { value: "going-out", label: "Going out" },
        ],
      },
      {
        id: "deal_breakers",
        kind: "multi",
        prompt: "Anything you can't live with?",
        help: "Optional. We only use this to avoid matches that would clearly not work.",
        required: false,
        maxSelections: 4,
        options: [
          { value: "smoking", label: "Smoking indoors" },
          { value: "parties", label: "Loud parties" },
          { value: "overnight-guests", label: "Overnight guests" },
          { value: "pets", label: "Pets in the flat" },
          { value: "mess", label: "Untidy shared spaces" },
          { value: "borrowing", label: "Borrowing without asking" },
          { value: "late-noise", label: "Late-night noise" },
        ],
      },
    ],
  },
  {
    id: "trust",
    title: "About you & consent",
    description:
      "A few words in your own voice, and the consents that let us verify you. Verification is instant; submissions are monitored.",
    questions: [
      {
        id: "about_you",
        kind: "text",
        prompt: "Introduce yourself",
        help: "What you study, how you spend a normal week, and what living with you is like. 40–400 characters.",
        required: true,
        minLength: 40,
        maxLength: 400,
        placeholder:
          "I'm a 300 level Law student at UNILAG. I'm usually in the library until 8pm, cook on Sundays, and keep shared spaces tidy…",
      },
      {
        id: "why_roommate",
        kind: "text",
        prompt: "Why are you looking for a roommate?",
        help: "20–300 characters. Be specific — vague answers get reviewed more slowly.",
        required: true,
        minLength: 20,
        maxLength: 300,
        placeholder: "My current place is too far from campus and I'd like to split rent closer to Akoka…",
      },
      {
        id: "emergency_contact",
        kind: "text",
        prompt: "Emergency contact",
        help: "Optional. A name and phone number we could use in an emergency. Kept private.",
        required: false,
        minLength: 3,
        maxLength: 120,
        placeholder: "Ada O. · +234 802 000 0000",
      },
    ],
  },
];

export const consentItems: { key: keyof VerificationConsents; label: string }[] = [
  {
    key: "accurate",
    label:
      "The details I've given are mine and accurate, and I'm a student or recent graduate looking for shared housing.",
  },
  {
    key: "monitored",
    label:
      "I understand verification is instant but monitored, and QUARTERS can suspend or block my roommate access if my activity looks suspicious.",
  },
  {
    key: "respectful",
    label: "I'll treat other students with respect and won't use their details outside QUARTERS.",
  },
];

/* -------------------------------------------------------------------------- */
/* Draft helpers                                                              */
/* -------------------------------------------------------------------------- */

export function emptyVerificationDraft(prefill: Partial<VerificationIdentity> = {}): VerificationDraft {
  return {
    identity: {
      fullName: "",
      phone: "",
      institution: "",
      studyLevel: "",
      city: "",
      neighbourhood: "",
      gender: "",
      schoolEmail: "",
      ...prefill,
    },
    answers: {},
    consents: { accurate: false, monitored: false, respectful: false },
  };
}

function isAnswerValue(value: unknown): value is VerificationAnswerValue {
  if (typeof value === "string") return true;
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Rebuilds a draft from a stored row so a verified student can edit answers. */
export function draftFromVerification(row: RoommateVerificationRow): VerificationDraft {
  const answers: VerificationAnswers = {};
  if (row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)) {
    for (const [key, value] of Object.entries(row.answers)) {
      if (isAnswerValue(value)) answers[key] = value;
    }
  }

  return {
    identity: {
      fullName: row.full_name,
      phone: row.phone,
      institution: row.institution,
      studyLevel: row.study_level,
      city: row.city,
      neighbourhood: row.neighbourhood ?? "",
      gender: row.gender ?? "",
      schoolEmail: row.school_email ?? "",
    },
    answers,
    consents: { accurate: true, monitored: true, respectful: true },
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type VerificationErrors = Record<string, string>;

const phonePattern = /^\+?[0-9][0-9 ()-]{6,19}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateIdentity(identity: VerificationIdentity): VerificationErrors {
  const errors: VerificationErrors = {};

  const fullName = identity.fullName.trim();
  if (fullName.length < 2 || fullName.length > 80) {
    errors.fullName = "Enter your full name (2–80 characters).";
  }

  const phone = identity.phone.trim();
  if (!phonePattern.test(phone)) {
    errors.phone = "Enter a reachable phone number, e.g. +234 801 234 5678.";
  }

  const institution = identity.institution.trim();
  if (institution.length < 2 || institution.length > 120) {
    errors.institution = "Enter your school or institution (2–120 characters).";
  }

  if (!studyLevelOptions.some((option) => option.value === identity.studyLevel)) {
    errors.studyLevel = "Choose your current level of study.";
  }

  const city = identity.city.trim();
  if (city.length < 2 || city.length > 80) {
    errors.city = "Enter your city (2–80 characters).";
  }

  const neighbourhood = identity.neighbourhood.trim();
  if (neighbourhood.length > 80) {
    errors.neighbourhood = "Keep the area to 80 characters or fewer.";
  }

  if (
    identity.gender !== "" &&
    !genderOptions.some((option) => option.value === identity.gender)
  ) {
    errors.gender = "Choose one of the listed options.";
  }

  const schoolEmail = identity.schoolEmail.trim();
  if (schoolEmail.length > 0 && (schoolEmail.length > 120 || !emailPattern.test(schoolEmail))) {
    errors.schoolEmail = "Enter a valid school email address, or leave it blank.";
  }

  return errors;
}

function validateQuestion(question: VerificationQuestion, answers: VerificationAnswers) {
  const value = answers[question.id];

  if (question.kind === "single") {
    if (typeof value !== "string" || !value) {
      return question.required ? "Choose an answer." : undefined;
    }
    if (!question.options.some((option) => option.value === value)) {
      return "Choose one of the listed options.";
    }
    return undefined;
  }

  if (question.kind === "multi") {
    const selected = Array.isArray(value) ? value : [];
    if (selected.length === 0) {
      return question.required ? "Choose at least one option." : undefined;
    }
    if (selected.length > question.maxSelections) {
      return `Choose at most ${question.maxSelections}.`;
    }
    if (selected.some((entry) => !question.options.some((option) => option.value === entry))) {
      return "Choose only from the listed options.";
    }
    return undefined;
  }

  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return question.required ? "This answer is required." : undefined;
  }
  if (text.length < question.minLength) {
    return `Write at least ${question.minLength} characters.`;
  }
  if (text.length > question.maxLength) {
    return `Keep this to ${question.maxLength} characters or fewer.`;
  }
  return undefined;
}

export function validateVerificationStep(
  stepId: VerificationStepId,
  draft: VerificationDraft,
): VerificationErrors {
  const step = verificationSteps.find((entry) => entry.id === stepId);
  if (!step) return {};

  if (stepId === "identity") return validateIdentity(draft.identity);

  const errors: VerificationErrors = {};
  for (const question of step.questions) {
    const message = validateQuestion(question, draft.answers);
    if (message) errors[question.id] = message;
  }
  return errors;
}

export function validateVerification(draft: VerificationDraft): VerificationErrors {
  const errors: VerificationErrors = {};

  for (const step of verificationSteps) {
    Object.assign(errors, validateVerificationStep(step.id, draft));
  }

  for (const item of consentItems) {
    if (!draft.consents[item.key]) {
      errors[`consent_${item.key}`] = "This consent is required before verification.";
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Traits and compatibility                                                   */
/* -------------------------------------------------------------------------- */

function clampScore(value: number): number {
  return Math.round(Math.min(5, Math.max(1, value)) * 100) / 100;
}

/**
 * Derives the five 1-5 traits by averaging every option the student chose that
 * speaks to a trait. Unanswered traits (or a draft with no trait data) fall back
 * to a neutral 3.
 */
export function deriveTraitScores(answers: VerificationAnswers): TraitScores {
  const totals: Record<TraitKey, { sum: number; count: number }> = {
    tidy: { sum: 0, count: 0 },
    sleep: { sum: 0, count: 0 },
    social: { sum: 0, count: 0 },
    guests: { sum: 0, count: 0 },
    routine: { sum: 0, count: 0 },
  };

  for (const step of verificationSteps) {
    for (const question of step.questions) {
      if (question.kind !== "single") continue;
      const value = answers[question.id];
      if (typeof value !== "string") continue;
      const option = question.options.find((entry) => entry.value === value);
      if (!option?.traits) continue;

      for (const key of traitKeys) {
        const score = option.traits[key];
        if (typeof score === "number") {
          totals[key].sum += score;
          totals[key].count += 1;
        }
      }
    }
  }

  const scores = {} as TraitScores;
  for (const key of traitKeys) {
    const { sum, count } = totals[key];
    scores[key] = count > 0 ? clampScore(sum / count) : 3;
  }
  return scores;
}

export function traitScoresFromVerification(row: RoommateVerificationRow): TraitScores {
  return {
    tidy: row.tidy_score,
    sleep: row.sleep_score,
    social: row.social_score,
    guests: row.guest_score,
    routine: row.routine_score,
  };
}

export function traitScoresFromProfile(
  row: Pick<
    RoommateProfileRow,
    "tidy_score" | "sleep_score" | "social_score" | "guest_score" | "routine_score"
  >,
): TraitScores | null {
  const values = [
    row.tidy_score,
    row.sleep_score,
    row.social_score,
    row.guest_score,
    row.routine_score,
  ];
  if (values.some((value) => value == null)) return null;
  return {
    tidy: row.tidy_score as number,
    sleep: row.sleep_score as number,
    social: row.social_score as number,
    guests: row.guest_score as number,
    routine: row.routine_score as number,
  };
}

/**
 * 0-100 fit across the shared traits: perfect agreement is 100, opposite ends of
 * every scale is 0. Requires at least three traits on both sides; otherwise the
 * profile has not verified and there is nothing honest to show.
 */
export function compatibilityScore(
  mine: TraitSource | null,
  theirs: TraitSource | null,
): number | null {
  if (!mine || !theirs) return null;

  const differences: number[] = [];
  for (const key of traitKeys) {
    const a = mine[key];
    const b = theirs[key];
    if (typeof a !== "number" || typeof b !== "number") continue;
    differences.push(Math.abs(a - b) / 4);
  }
  if (differences.length < 3) return null;

  const distance = differences.reduce((total, value) => total + value, 0) / differences.length;
  return Math.round((1 - distance) * 100);
}

export type CompatibilityVerdict = {
  label: string;
  tone: "positive" | "neutral" | "caution";
};

export function compatibilityVerdict(score: number): CompatibilityVerdict {
  if (score >= 85) return { label: "Strong fit", tone: "positive" };
  if (score >= 70) return { label: "Good fit", tone: "positive" };
  if (score >= 55) return { label: "Worth a chat", tone: "neutral" };
  return { label: "Different rhythms", tone: "caution" };
}

export type CompatibilityRow = {
  key: TraitKey;
  label: string;
  mine: number;
  theirs: number;
  mineLabel: string;
  theirsLabel: string;
};

export function compatibilityBreakdown(
  mine: TraitSource | null,
  theirs: TraitSource | null,
): CompatibilityRow[] {
  if (!mine || !theirs) return [];

  return traitKeys.flatMap((key) => {
    const a = mine[key];
    const b = theirs[key];
    if (typeof a !== "number" || typeof b !== "number") return [];
    return [
      {
        key,
        label: traitMeta[key].label,
        mine: a,
        theirs: b,
        mineLabel: traitBandLabel(key, a),
        theirsLabel: traitBandLabel(key, b),
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Supabase access                                                            */
/* -------------------------------------------------------------------------- */

/** RLS limits this to the caller's own row (or an administrator's view). */
export const ROOMMATE_VERIFICATION_COLUMNS = "*";

export function mapVerificationError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Roommate verification is not enabled on this database yet. The verification migration has not been applied.";
  }
  if (error.code === "23505") {
    return "You already have a verification. Reload the page and try again.";
  }
  if (error.code === "23514") {
    return "Some answers do not meet the verification rules. Check your details and try again.";
  }
  if (error.code === "23503") {
    return "That account could not be linked to a verification. Sign in again.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "You are not allowed to change this verification. Sign in again.";
  }
  return "Could not save your verification. Please try again.";
}

export async function loadMyVerification(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ verification: RoommateVerificationRow | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_verifications")
    .select(ROOMMATE_VERIFICATION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { verification: null, error: mapVerificationError(error) };
  }
  return { verification: data ?? null, error: null };
}

function contentFromDraft(draft: VerificationDraft) {
  const traits = deriveTraitScores(draft.answers);
  return {
    full_name: draft.identity.fullName.trim(),
    phone: draft.identity.phone.trim(),
    institution: draft.identity.institution.trim(),
    study_level: draft.identity.studyLevel as StudyLevel,
    city: draft.identity.city.trim(),
    neighbourhood: draft.identity.neighbourhood.trim() || null,
    gender: draft.identity.gender === "" ? null : draft.identity.gender,
    school_email: draft.identity.schoolEmail.trim() || null,
    answers: draft.answers,
    tidy_score: traits.tidy,
    sleep_score: traits.sleep,
    social_score: traits.social,
    guest_score: traits.guests,
    routine_score: traits.routine,
  };
}

/**
 * Creates or updates the caller's verification. Standing columns are never sent,
 * so a suspended or blocked student cannot restore their own access by editing
 * answers.
 */
export async function submitMyVerification(
  client: TypedSupabaseClient,
  userId: string,
  draft: VerificationDraft,
  existingId: string | null,
): Promise<{ verification: RoommateVerificationRow | null; error: string | null }> {
  const validation = validateVerification(draft);
  if (Object.keys(validation).length > 0) {
    return { verification: null, error: "Some answers still need attention." };
  }

  const content = contentFromDraft(draft);
  const query = existingId
    ? client
        .from("roommate_verifications")
        .update(content)
        .eq("id", existingId)
        .select(ROOMMATE_VERIFICATION_COLUMNS)
        .single()
    : client
        .from("roommate_verifications")
        .insert({ ...content, user_id: userId })
        .select(ROOMMATE_VERIFICATION_COLUMNS)
        .single();

  const { data, error } = await query;

  if (error) {
    return { verification: null, error: mapVerificationError(error) };
  }
  return { verification: data, error: null };
}

export type RoommateStanding = "unverified" | "verified" | "suspended" | "blocked";

export function standingOf(row: RoommateVerificationRow | null): RoommateStanding {
  return row ? row.status : "unverified";
}

export function standingNotice(row: RoommateVerificationRow): string | null {
  if (row.status === "suspended") {
    return (
      row.suspension_reason ??
      "Your roommate access is suspended while a moderator reviews your verification."
    );
  }
  if (row.status === "blocked") {
    return (
      row.blocked_reason ??
      "Your roommate access has been blocked after a moderation review."
    );
  }
  return null;
}
