import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

function isMissingTable(error: PostgrestError): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703"
  );
}

export function mapGroupVisitError(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return "Group visits are not enabled on this database yet. Apply the group visit migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Only members of this group can plan a viewing for it.";
  }
  return "Could not ask for a group visit. Please try again.";
}

/**
 * Whether this group has already asked to view this property together. RLS
 * limits the answer to groups the caller belongs to.
 */
export async function loadGroupVisitRequest(
  client: TypedSupabaseClient,
  { groupId, listingId }: { groupId: string; listingId: string },
): Promise<{ requested: boolean; error: string | null }> {
  const { data, error } = await client
    .from("listing_group_visits")
    .select("id")
    .eq("group_id", groupId)
    .eq("listing_id", listingId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { requested: false, error: mapGroupVisitError(error) };
  }
  return { requested: Boolean(data), error: null };
}

/**
 * Records that the group wants to view this property together, with the caller
 * as the member who asked. The database allows it only for a live public listing
 * and a group the caller belongs to; a repeat request is treated as success.
 */
export async function requestGroupVisit(
  client: TypedSupabaseClient,
  {
    groupId,
    listingId,
    userId,
  }: { groupId: string; listingId: string; userId: string },
): Promise<{ requested: boolean; error: string | null }> {
  const { error } = await client.from("listing_group_visits").insert({
    listing_id: listingId,
    group_id: groupId,
    requested_by: userId,
  });

  if (!error) {
    return { requested: true, error: null };
  }
  if (error.code === "23505") {
    return { requested: true, error: null };
  }
  return { requested: false, error: mapGroupVisitError(error) };
}
