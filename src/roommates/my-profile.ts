import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** The owner-editable columns of `roommate_profiles`. */
export type MyRoommateProfile = {
  id: string;
  display_name: string;
  headline: string | null;
  institution: string | null;
  city: string;
  neighbourhood: string | null;
  budget_amount: number | null;
  move_in_date: string | null;
  bio: string | null;
  is_discoverable: boolean;
};

/** Form state: every field is a string, exactly as typed. */
export type MyRoommateProfileDraft = {
  displayName: string;
  headline: string;
  institution: string;
  city: string;
  neighbourhood: string;
  budget: string;
  moveInDate: string;
  bio: string;
  isDiscoverable: boolean;
};

export type MyProfileField =
  | "displayName"
  | "headline"
  | "institution"
  | "city"
  | "neighbourhood"
  | "budget"
  | "bio";
export type MyProfileFieldErrors = Partial<Record<MyProfileField, string>>;

export const MY_PROFILE_COLUMNS =
  "id, display_name, headline, institution, city, neighbourhood, budget_amount, move_in_date, bio, is_discoverable";

const LIMITS = {
  displayName: [2, 60],
  headline: [1, 80],
  institution: [1, 120],
  neighbourhood: [1, 80],
  bio: [1, 600],
} as const;

export function draftFromProfile(profile: MyRoommateProfile | null): MyRoommateProfileDraft {
  return {
    displayName: profile?.display_name ?? "",
    headline: profile?.headline ?? "",
    institution: profile?.institution ?? "",
    city: profile?.city ?? "Lagos",
    neighbourhood: profile?.neighbourhood ?? "",
    budget: profile?.budget_amount != null ? String(Math.round(profile.budget_amount)) : "",
    moveInDate: profile?.move_in_date ?? "",
    bio: profile?.bio ?? "",
    isDiscoverable: profile?.is_discoverable ?? true,
  };
}

function checkLength(
  value: string,
  [min, max]: readonly [number, number],
  label: string,
  required = false,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? `Enter your ${label.toLowerCase()}.` : undefined;
  }
  if (trimmed.length < min) return `${label} is too short.`;
  if (trimmed.length > max) return `Keep ${label.toLowerCase()} under ${max} characters.`;
  return undefined;
}

export function validateMyProfile(
  draft: MyRoommateProfileDraft,
): MyProfileFieldErrors {
  const errors: MyProfileFieldErrors = {};

  const displayName = checkLength(draft.displayName, LIMITS.displayName, "Display name", true);
  if (displayName) errors.displayName = displayName;

  const city = checkLength(draft.city, [2, 80], "City", true);
  if (city) errors.city = city;

  for (const [field, value, label] of [
    ["headline", draft.headline, "Headline"],
    ["institution", draft.institution, "School"],
    ["neighbourhood", draft.neighbourhood, "Area"],
    ["bio", draft.bio, "Bio"],
  ] as const) {
    const error = checkLength(value, LIMITS[field], label);
    if (error) errors[field] = error;
  }

  if (draft.budget.trim()) {
    const amount = Number(draft.budget.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.budget = "Enter a yearly budget above zero.";
    }
  }

  return errors;
}

export function mapMyProfileError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Roommate profiles are not available yet. The roommate migration may not be applied.";
  }
  if (error.code === "42501") {
    return "Only verified students can publish a roommate profile. Complete your verification first.";
  }
  if (error.code === "PGRST301") {
    return "Sign in to edit your roommate profile.";
  }
  if (error.code === "23505") {
    return "You already have a roommate profile.";
  }
  if (error.code === "23514") {
    return "Some details are outside the allowed range. Check the lengths and budget.";
  }
  return "Could not save your profile. Please try again.";
}

/**
 * The caller's own profile. `user_id` is filtered explicitly because the
 * discoverable-row policy also lets this user read other students' profiles.
 */
export async function loadMyRoommateProfile(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ profile: MyRoommateProfile | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_profiles")
    .select(MY_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: mapMyProfileError(error) };
  }
  return { profile: data ?? null, error: null };
}

function draftToRow(draft: MyRoommateProfileDraft) {
  const budget = draft.budget.trim()
    ? Number(draft.budget.replace(/[^\d.]/g, ""))
    : null;

  return {
    display_name: draft.displayName.trim(),
    headline: draft.headline.trim() || null,
    institution: draft.institution.trim() || null,
    city: draft.city.trim(),
    neighbourhood: draft.neighbourhood.trim() || null,
    budget_amount: budget,
    move_in_date: draft.moveInDate || null,
    bio: draft.bio.trim() || null,
    is_discoverable: draft.isDiscoverable,
  };
}

/**
 * Updates the existing row, or creates one for this account the first time.
 * RLS enforces `user_id = auth.uid()` either way.
 */
export async function saveMyRoommateProfile(
  client: TypedSupabaseClient,
  userId: string,
  profileId: string | null,
  draft: MyRoommateProfileDraft,
): Promise<{ profile: MyRoommateProfile | null; error: string | null }> {
  const row = draftToRow(draft);

  const query = profileId
    ? client
        .from("roommate_profiles")
        .update(row)
        .eq("id", profileId)
        .eq("user_id", userId)
    : client.from("roommate_profiles").insert({ ...row, user_id: userId });

  const { data, error } = await query.select(MY_PROFILE_COLUMNS).maybeSingle();

  if (error) {
    return { profile: null, error: mapMyProfileError(error) };
  }
  return { profile: data ?? null, error: null };
}
