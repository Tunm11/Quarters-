import type { PublicListing } from "@/listings/public-listings";

/**
 * What the offline copies hold, as plain JSON.
 *
 * A Map does not survive JSON, so the shortlist's filing is stored as pairs and
 * rebuilt on read. Every other list is already a flat row, so the rows cached
 * offline are the same rows the screens render online — no separate renderer and
 * no invented placeholders.
 */

export type SavedRoomsSnapshot = {
  listings: PublicListing[];
  /** `[listingId, collectionId | null]` pairs, in shortlist order. */
  filing: [string, string | null][];
};

export function encodeSavedRooms(
  listings: PublicListing[],
  collectionByListing: Map<string, string | null>,
): SavedRoomsSnapshot {
  return {
    listings,
    filing: listings.map((listing) => [
      listing.id,
      collectionByListing.get(listing.id) ?? null,
    ]),
  };
}

export function decodeSavedRooms(snapshot: Partial<SavedRoomsSnapshot> | null): {
  listings: PublicListing[];
  collectionByListing: Map<string, string | null>;
} {
  const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
  const collectionByListing = new Map<string, string | null>();

  for (const pair of snapshot?.filing ?? []) {
    if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
    collectionByListing.set(pair[0], pair[1] ?? null);
  }

  return { listings, collectionByListing };
}

/** A cached list, or an empty one when the stored shape is not a list. */
export function decodeList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** The single line a screen shows above content it read from the cache. */
export function offlineCopyNotice(savedAt: string): string {
  return `Offline copy, last read ${savedAt}. Changes are not sent until you are back online.`;
}
