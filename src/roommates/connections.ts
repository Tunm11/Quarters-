import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";
import {
  ROOMMATE_COLUMNS,
  withAvatarUrls,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";

/**
 * A roommate the viewer is actually connected to: an interest they sent that
 * the other student accepted. Pending and declined interests are not included.
 */
export type RoommateConnection = RoommateProfile & {
  connected_at: string;
  /**
   * The account behind the profile. Curated demo profiles have none, and those
   * can never join a real booking or group chat. Null when the profile is not
   * backed by an account.
   */
  user_id: string | null;
};

export function mapConnectionsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Connections are not available yet. The roommate migration may not be applied.";
  }
  return "Could not load your connections. Please try again.";
}

/**
 * Loads the caller's accepted connections and the public profile of each.
 *
 * RLS already limits `roommate_interests` to rows the caller sent, so the
 * `sender_id` filter only keeps the query explicit. Profiles that are no longer
 * discoverable are skipped by their own RLS instead of leaking a stale row.
 */
export async function loadRoommateConnections(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ connections: RoommateConnection[]; error: string | null }> {
  const { data, error } = await client
    .from("roommate_interests")
    .select("profile_id, updated_at")
    .eq("sender_id", userId)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false });

  if (error) {
    return { connections: [], error: mapConnectionsError(error) };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { connections: [], error: null };
  }

  const profileIds = [...new Set(rows.map((row) => row.profile_id))];
  const { data: profiles, error: profileError } = await client
    .from("roommate_profiles")
    .select(ROOMMATE_COLUMNS)
    .in("id", profileIds);

  if (profileError) {
    return { connections: [], error: mapConnectionsError(profileError) };
  }

  // The profile photo loader only needs profile columns, so the owning account
  // is fetched alongside instead of being folded into the public profile shape.
  const { data: owners, error: ownerError } = await client
    .from("roommate_profiles")
    .select("id, user_id")
    .in("id", profileIds);

  if (ownerError) {
    return { connections: [], error: mapConnectionsError(ownerError) };
  }

  const accountById = new Map(
    (owners ?? []).map((owner) => [owner.id, owner.user_id]),
  );

  const visible = await withAvatarUrls(client, profiles ?? []);
  const byId = new Map(visible.map((profile) => [profile.id, profile]));

  const connections = rows.flatMap((row) => {
    const profile = byId.get(row.profile_id);
    return profile
      ? [
          {
            ...profile,
            connected_at: row.updated_at,
            user_id: accountById.get(profile.id) ?? null,
          },
        ]
      : [];
  });

  return { connections, error: null };
}
