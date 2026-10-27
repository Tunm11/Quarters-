import {
  accommodationTypeLabels,
  availabilityLabels,
  formatListingLocation,
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";

/**
 * Side-by-side comparison of shortlisted rooms.
 *
 * Pure so the numbers and the missing values can be tested without rendering:
 * every row has exactly one entry per compared room (aligned by index), and a
 * fact the lister did not state renders as null rather than as a guess.
 */

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

export type ComparisonRow = {
  key: string;
  label: string;
  /** One entry per compared room, aligned with the listings passed in. */
  values: (string | null)[];
};

export type Comparison = {
  rows: ComparisonRow[];
  /**
   * Index of the cheapest known rent among the compared rooms, or null when no
   * room states one. Used to highlight the row cell, not to rank the rooms.
   */
  cheapestIndex: number | null;
};

const furnishingLabels: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

const listedFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
});

/** Adds or removes a room from the current selection, capped at MAX_COMPARE. */
export function toggleCompared(ids: string[], listingId: string): string[] {
  if (ids.includes(listingId)) {
    return ids.filter((id) => id !== listingId);
  }
  if (ids.length >= MAX_COMPARE) return ids;
  return [...ids, listingId];
}

function cheapestIndex(listings: PublicListing[]): number | null {
  let index: number | null = null;
  listings.forEach((listing, position) => {
    if (listing.rent_amount == null) return;
    if (index === null || listing.rent_amount < listings[index].rent_amount!) {
      index = position;
    }
  });
  return index;
}

function listedAt(listing: PublicListing): string | null {
  const value = listing.first_published_at ?? listing.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : listedFormatter.format(date);
}

export function buildComparison(listings: PublicListing[]): Comparison {
  const rows: ComparisonRow[] = [
    {
      key: "rent",
      label: "Rent",
      values: listings.map((listing) => formatListingRent(listing)),
    },
    {
      key: "type",
      label: "Room type",
      values: listings.map(
        (listing) => accommodationTypeLabels[listing.accommodation_type] ?? null,
      ),
    },
    {
      key: "area",
      label: "Area",
      values: listings.map((listing) => formatListingLocation(listing) || null),
    },
    {
      key: "institution",
      label: "Nearest campus",
      values: listings.map((listing) => listing.institution ?? null),
    },
    {
      key: "availability",
      label: "Availability",
      values: listings.map(
        (listing) => availabilityLabels[listing.availability_status] ?? null,
      ),
    },
    {
      key: "bedrooms",
      label: "Bedrooms",
      values: listings.map((listing) =>
        listing.bedrooms == null ? null : String(listing.bedrooms),
      ),
    },
    {
      key: "bathrooms",
      label: "Bathrooms",
      values: listings.map((listing) =>
        listing.bathrooms == null ? null : String(listing.bathrooms),
      ),
    },
    {
      key: "furnishing",
      label: "Furnishing",
      values: listings.map((listing) =>
        listing.furnishing_status
          ? (furnishingLabels[listing.furnishing_status] ?? null)
          : null,
      ),
    },
    {
      key: "amenities",
      label: "Amenities",
      values: listings.map((listing) =>
        listing.facilities.length > 0 ? listing.facilities.join(", ") : null,
      ),
    },
    {
      key: "listed",
      label: "Listed",
      values: listings.map(listedAt),
    },
  ];

  return { rows, cheapestIndex: cheapestIndex(listings) };
}
