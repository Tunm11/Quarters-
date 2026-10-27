import type { PostgrestError } from "@supabase/supabase-js";
import type { SavedListingCollectionRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Named folders for the shortlist.
 *
 * A collection belongs to one account and is private to it; RLS already scopes
 * every query, and the explicit `user_id` filter keeps the intent readable.
 * A saved room sits in at most one folder, so a collection behaves like a
 * folder rather than a tag — deleting one returns its rooms to Unsorted.
 */
export type SavedCollection = Pick<
  SavedListingCollectionRow,
  "id" | "name" | "created_at"
>;

export const COLLECTION_NAME_MAX_LENGTH = 40;

export function normalizeCollectionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, COLLECTION_NAME_MAX_LENGTH);
}

export function mapCollectionsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Collections are not available yet. Apply the shortlist-collections migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to organise your shortlist.";
  }
  if (error.code === "23505") {
    return "You already have a collection with that name.";
  }
  if (error.code === "23514") {
    return `Keep a collection name to ${COLLECTION_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return "Could not update your collections. Please try again.";
}

/** The caller's collections, oldest first so the order is stable. */
export async function loadSavedCollections(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ collections: SavedCollection[]; error: string | null }> {
  const { data, error } = await client
    .from("saved_listing_collections")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    return { collections: [], error: mapCollectionsError(error) };
  }
  return { collections: data ?? [], error: null };
}

export async function createSavedCollection(
  client: TypedSupabaseClient,
  { userId, name }: { userId: string; name: string },
): Promise<{ collection: SavedCollection | null; error: string | null }> {
  const normalized = normalizeCollectionName(name);
  if (!normalized) {
    return { collection: null, error: "Name this collection first." };
  }

  const { data, error } = await client
    .from("saved_listing_collections")
    .insert({ user_id: userId, name: normalized })
    .select("id, name, created_at")
    .single();

  if (error) {
    return { collection: null, error: mapCollectionsError(error) };
  }
  return { collection: data, error: null };
}

/**
 * Renames a collection. RLS means a row belonging to someone else simply does
 * not resolve, which is reported as a missing collection rather than an error.
 */
export async function renameSavedCollection(
  client: TypedSupabaseClient,
  { collectionId, name }: { collectionId: string; name: string },
): Promise<{ collection: SavedCollection | null; error: string | null }> {
  const normalized = normalizeCollectionName(name);
  if (!normalized) {
    return { collection: null, error: "Name this collection first." };
  }

  const { data, error } = await client
    .from("saved_listing_collections")
    .update({ name: normalized })
    .eq("id", collectionId)
    .select("id, name, created_at")
    .maybeSingle();

  if (error) {
    return { collection: null, error: mapCollectionsError(error) };
  }
  if (!data) {
    return { collection: null, error: "That collection no longer exists." };
  }
  return { collection: data, error: null };
}

/** Deleting a collection keeps its rooms: they fall back to Unsorted. */
export async function deleteSavedCollection(
  client: TypedSupabaseClient,
  collectionId: string,
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("saved_listing_collections")
    .delete()
    .eq("id", collectionId);

  return { error: error ? mapCollectionsError(error) : null };
}

/** Files a saved room into a collection, or back to Unsorted with `null`. */
export async function fileListingInCollection(
  client: TypedSupabaseClient,
  {
    userId,
    listingId,
    collectionId,
  }: { userId: string; listingId: string; collectionId: string | null },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("saved_listings")
    .update({ collection_id: collectionId })
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  return { error: error ? mapFileListingError(error) : null };
}

function mapFileListingError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") {
    return "Collections are not available yet. Apply the shortlist-collections migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to organise your shortlist.";
  }
  if (error.code === "23503") {
    return "That collection no longer exists.";
  }
  return "Could not move this room. Please try again.";
}
