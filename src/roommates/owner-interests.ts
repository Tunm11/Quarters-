import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type InterestStatus = "pending" | "accepted" | "declined" | "withdrawn";
export type InterestDecision = "accepted" | "declined";

/**
 * An interest sent to one of the viewer's own roommate profiles, with only the
 * sender information the database is willing to share (display name plus their
 * public roommate profile, if they have one).
 */
export type OwnerInterest = {
  id: string;
  profile_id: string;
  status: InterestStatus;
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_detail: string | null;
};

export function mapOwnerInterestsError(error: PostgrestError): string {
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202"
  ) {
    return "Interested students are not enabled on this database yet. Apply the roommate interest migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see who is interested.";
  }
  return "Could not load interested students. Please try again.";
}

/**
 * Reads interests addressed to profiles the caller owns. The RPC is the only
 * path to the sender's name: `public.profiles` is private and stays that way.
 */
export async function loadOwnerInterests(
  client: TypedSupabaseClient,
): Promise<{ interests: OwnerInterest[]; error: string | null }> {
  const { data, error } = await client.rpc("roommate_interests_for_owner");

  if (error) {
    return { interests: [], error: mapOwnerInterestsError(error) };
  }

  const interests = (data ?? []).map((row) => {
    const detail = [row.sender_headline, row.sender_city]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" · ");

    return {
      id: row.id,
      profile_id: row.profile_id,
      status: row.status,
      created_at: row.created_at,
      sender_id: row.sender_id,
      sender_name: row.sender_display_name?.trim() || "A student",
      sender_detail: detail || null,
    } satisfies OwnerInterest;
  });

  return { interests, error: null };
}

/**
 * Accepting is what creates the sender's connection, so this is the one write
 * the receiving side performs. RLS re-checks ownership and that the row is
 * still pending.
 */
export async function decideInterest(
  client: TypedSupabaseClient,
  interestId: string,
  decision: InterestDecision,
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("roommate_interests")
    .update({ status: decision })
    .eq("id", interestId);

  if (error) {
    return { error: mapOwnerInterestsError(error) };
  }
  return { error: null };
}
