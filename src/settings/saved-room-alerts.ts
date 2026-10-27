import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

export const SAVED_ROOM_ALERTS_MIGRATION_MISSING_MESSAGE =
  "Saved-room alerts are not available yet. The saved-room alerts migration may not be applied to this Supabase project.";

/**
 * This preference is the one notification switch the database reads: the
 * saved-room triggers check `profiles.saved_room_alerts` before writing an
 * activity row. It therefore lives on the account, not in localStorage.
 */
export function mapSavedRoomAlertsError(error: PostgrestError): string {
  if (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return SAVED_ROOM_ALERTS_MIGRATION_MISSING_MESSAGE;
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to change saved-room alerts.";
  }
  return "Could not update your saved-room alerts. Please try again.";
}

/**
 * Reads the account switch. A missing profile row means the same as the column
 * default: alerts are on.
 */
export async function loadSavedRoomAlerts(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ enabled: boolean; error: string | null }> {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("saved_room_alerts")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return { enabled: true, error: mapSavedRoomAlertsError(error) };
    }
    return { enabled: data?.saved_room_alerts ?? true, error: null };
  } catch {
    return {
      enabled: true,
      error: "Could not load your saved-room alerts. Please try again.",
    };
  }
}

/** Writes the account switch. RLS limits the update to the caller's own row. */
export async function saveSavedRoomAlerts(
  client: TypedSupabaseClient,
  userId: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  try {
    const { error } = await client
      .from("profiles")
      .update({ saved_room_alerts: enabled })
      .eq("id", userId);

    if (error) return { error: mapSavedRoomAlertsError(error) };
    return { error: null };
  } catch {
    return {
      error: "Could not update your saved-room alerts. Please try again.",
    };
  }
}
