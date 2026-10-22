import type { PostgrestError, User } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export const PROFILES_MIGRATION_MISSING_MESSAGE =
  "Your profile table is not available. The Stage 1 profiles migration may not be applied to this Supabase project, or its grants may be missing.";

export type ProfileResult =
  | { profile: ProfileRow; error: null }
  | { profile: null; error: string };

export function isMissingProfilesTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

export function mapProfileError(error: PostgrestError): string {
  if (isMissingProfilesTable(error)) {
    return PROFILES_MIGRATION_MISSING_MESSAGE;
  }
  if (error.code === "42501") {
    return "Your account is not allowed to change that profile.";
  }
  if (error.code === "23514") {
    return "That display name does not meet the profile rules (2-60 characters).";
  }
  if (error.code === "23503") {
    return "That profile is not linked to a valid account.";
  }
  return "Could not load your profile from Supabase. Please try again.";
}

/** Uses the sign-up metadata when it is present and valid; otherwise null. */
export function deriveDisplayName(user: User): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const raw = metadata?.display_name;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return null;
  }
  return trimmed;
}

async function selectProfile(
  client: TypedSupabaseClient,
  userId: string,
): Promise<ProfileResult> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: mapProfileError(error) };
  }
  if (!data) {
    return { profile: null, error: "Your profile could not be found." };
  }
  return { profile: data, error: null };
}

/**
 * Returns the signed-in user's profile, creating it on first use.
 *
 * This runs only after Supabase has established a session, so it also works
 * when email confirmation is enabled: unconfirmed accounts never hold a session
 * and therefore never get a profile row. A duplicate insert (two tabs, or React
 * StrictMode running effects twice) is resolved by re-reading the row.
 */
export async function ensureProfile(
  client: TypedSupabaseClient,
  user: User,
): Promise<ProfileResult> {
  const existing = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing.error) {
    return { profile: null, error: mapProfileError(existing.error) };
  }
  if (existing.data) {
    return { profile: existing.data, error: null };
  }

  const { data, error } = await client
    .from("profiles")
    .insert({ id: user.id, display_name: deriveDisplayName(user) })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return selectProfile(client, user.id);
    }
    return { profile: null, error: mapProfileError(error) };
  }
  if (!data) {
    return { profile: null, error: "Supabase did not return the new profile." };
  }
  return { profile: data, error: null };
}

export async function updateDisplayName(
  client: TypedSupabaseClient,
  userId: string,
  displayName: string | null,
): Promise<ProfileResult> {
  const { data, error } = await client
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    return { profile: null, error: mapProfileError(error) };
  }
  if (!data) {
    return { profile: null, error: "Supabase did not confirm the profile update." };
  }
  return { profile: data, error: null };
}
