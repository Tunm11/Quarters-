import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";
import { loadListingsByIds, type PublicListing } from "@/listings/public-listings";

export function mapSavedListingsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Saved rooms are not available yet. Apply the saved-listings migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to keep a shortlist of rooms.";
  }
  return "Could not update your saved rooms. Please try again.";
}

/**
 * The caller's shortlist, newest first. RLS already limits the table to the
 * caller; the explicit filter keeps the query honest and lets the planner use
 * the (user_id, created_at) index.
 */
export async function loadSavedListingIds(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await client
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ids: [], error: mapSavedListingsError(error) };
  }

  return { ids: (data ?? []).map((row) => row.listing_id), error: null };
}

/** Saves a room. Saving an already-saved room is a no-op, not an error. */
export async function saveListing(
  client: TypedSupabaseClient,
  { userId, listingId }: { userId: string; listingId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("saved_listings")
    .insert({ user_id: userId, listing_id: listingId });

  if (error && error.code !== "23505") {
    return { error: mapSavedListingsError(error) };
  }

  return { error: null };
}

/** Removes a room from the shortlist. Removing a missing row is fine. */
export async function unsaveListing(
  client: TypedSupabaseClient,
  { userId, listingId }: { userId: string; listingId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("saved_listings")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  if (error) {
    return { error: mapSavedListingsError(error) };
  }

  return { error: null };
}

/** One saved room: the public summary, plus the folder it was filed into. */
export type SavedRoomSummary = {
  listings: PublicListing[];
  /**
   * Filing for each resolved room, keyed by listing id. A listing missing from
   * the map was not resolved (it is no longer published) and is not in
   * `listings` either. `null` means the room sits in Unsorted.
   */
  collectionByListing: Map<string, string | null>;
  error: string | null;
};

/**
 * The shortlist as full public summaries, in the order the rooms were saved,
 * with the folder each one sits in. Rooms that are no longer published are
 * skipped by the listing read model, so the Saved tab never shows a card that
 * cannot be opened.
 */
export async function loadSavedListings(
  client: TypedSupabaseClient,
  userId: string,
): Promise<SavedRoomSummary> {
  const { data, error } = await client
    .from("saved_listings")
    .select("listing_id, collection_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      listings: [],
      collectionByListing: new Map(),
      error: mapSavedListingsError(error),
    };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { listings: [], collectionByListing: new Map(), error: null };
  }

  const byId = await loadListingsByIds(
    client,
    rows.map((row) => row.listing_id),
  );

  const listings: PublicListing[] = [];
  const collectionByListing = new Map<string, string | null>();
  for (const row of rows) {
    const listing = byId.get(row.listing_id);
    if (!listing) continue;
    listings.push(listing);
    collectionByListing.set(row.listing_id, row.collection_id);
  }

  return { listings, collectionByListing, error: null };
}
