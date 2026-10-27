import type { PublicListing } from "@/listings/public-listings";

/**
 * Ordering for the Explore results.
 *
 * Sorting runs in the browser over the rows already loaded (RLS decides
 * visibility; the catalogue is read a page at a time), so switching order never
 * re-queries Supabase and every sequence is derived from published data only.
 * The order therefore covers the rooms on screen, and the catalogue footer says
 * so while more pages remain.
 *
 * "Closest" is deliberately campus-based rather than metre-based: the listings
 * table stores the campus a room is near, not coordinates, so the closest order
 * ranks rooms that name the chosen campus first and leaves the rest in newest
 * order. Nothing is geocoded or invented along the way.
 */
export type ListingSortId = "newest" | "price-asc" | "price-desc" | "closest";

export type ListingSortOption = {
  id: ListingSortId;
  label: string;
  description: string;
  /** The order only means something once a campus has been chosen. */
  needsCampus: boolean;
};

export const listingSortOptions: ListingSortOption[] = [
  {
    id: "newest",
    label: "Newest first",
    description: "Rooms published most recently.",
    needsCampus: false,
  },
  {
    id: "price-asc",
    label: "Price: low to high",
    description: "Cheapest known rent first.",
    needsCampus: false,
  },
  {
    id: "price-desc",
    label: "Price: high to low",
    description: "Highest known rent first.",
    needsCampus: false,
  },
  {
    id: "closest",
    label: "Closest to my campus",
    description: "Rooms that name your campus first.",
    needsCampus: true,
  },
];

export const defaultListingSort: ListingSortId = "newest";

export function listingSortLabel(id: ListingSortId): string {
  return listingSortOptions.find((option) => option.id === id)?.label ?? "Newest first";
}

/** When a listing went live: its first publication, else its creation. */
function publishedTime(listing: PublicListing): number {
  const value = listing.first_published_at ?? listing.created_at;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/** Campus names are free text, so they are compared case- and space-insensitively. */
function normalizeCampus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function sortPublicListings(
  listings: PublicListing[],
  { sort, campus = null }: { sort: ListingSortId; campus?: string | null },
): PublicListing[] {
  // The original index is the tiebreaker everywhere, so an order is stable and
  // equal rooms keep the sequence the catalogue returned.
  const rows = listings.map((listing, index) => ({ listing, index }));

  const newestFirst = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    publishedTime(b.listing) - publishedTime(a.listing) || a.index - b.index;

  const byRent =
    (direction: 1 | -1) => (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      const left = a.listing.rent_amount;
      const right = b.listing.rent_amount;
      // A room that states no rent cannot take part in a price order, so it sits
      // at the end in both directions rather than reading as free or infinite.
      if (left == null || right == null) {
        if (left == null && right == null) return newestFirst(a, b);
        return left == null ? 1 : -1;
      }
      return (left - right) * direction || newestFirst(a, b);
    };

  const target = normalizeCampus(campus);
  const byCampus = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    const leftNames = normalizeCampus(a.listing.institution) === target;
    const rightNames = normalizeCampus(b.listing.institution) === target;
    if (leftNames !== rightNames) return leftNames ? -1 : 1;
    return newestFirst(a, b);
  };

  const comparator =
    sort === "price-asc"
      ? byRent(1)
      : sort === "price-desc"
        ? byRent(-1)
        : // Without a campus the closest order has nothing to rank against, so it
          // falls back to newest instead of implying a distance it cannot know.
          sort === "closest" && target
          ? byCampus
          : newestFirst;

  return rows.sort(comparator).map((row) => row.listing);
}

export type CampusOption = {
  name: string;
  count: number;
};

/** The campuses named by published rooms, so no campus is ever offered in the abstract. */
export function buildCampusOptions(listings: PublicListing[]): CampusOption[] {
  const byKey = new Map<string, CampusOption>();
  for (const listing of listings) {
    const name = (listing.institution ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { name, count: 1 });
  }

  return [...byKey.values()].sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name),
  );
}

/** The trailing group for rooms whose provider named no campus. */
export const UNSTATED_CAMPUS = "Campus not stated";

export type CampusGroup = {
  name: string;
  /** True for the group of rooms with no campus stated. */
  unstated: boolean;
  listings: PublicListing[];
  /** Distinct neighbourhoods in the group, in the order the rooms were loaded. */
  neighbourhoods: string[];
  /** Cheapest rent stated in the group, or null when none is. */
  minRent: number | null;
};

/**
 * Groups results by the campus each room names, for the near-campus view.
 *
 * The student's own campus leads, then the fullest campus, then A–Z; rooms that
 * name no campus close the list in their own honest group.
 */
export function groupListingsByCampus(
  listings: PublicListing[],
  { campus = null }: { campus?: string | null } = {},
): CampusGroup[] {
  const groups = new Map<string, CampusGroup>();

  for (const listing of listings) {
    const name = (listing.institution ?? "").trim();
    const key = name.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        name: name || UNSTATED_CAMPUS,
        unstated: name.length === 0,
        listings: [],
        neighbourhoods: [],
        minRent: null,
      };
      groups.set(key, group);
    }

    group.listings.push(listing);

    const area = (listing.neighbourhood ?? "").trim();
    if (area && !group.neighbourhoods.includes(area)) group.neighbourhoods.push(area);

    if (listing.rent_amount != null) {
      group.minRent =
        group.minRent == null
          ? listing.rent_amount
          : Math.min(group.minRent, listing.rent_amount);
    }
  }

  const target = normalizeCampus(campus);
  return [...groups.values()].sort((left, right) => {
    if (left.unstated !== right.unstated) return left.unstated ? 1 : -1;
    const leftMine = target.length > 0 && normalizeCampus(left.name) === target;
    const rightMine = target.length > 0 && normalizeCampus(right.name) === target;
    if (leftMine !== rightMine) return leftMine ? -1 : 1;
    return right.listings.length - left.listings.length || left.name.localeCompare(right.name);
  });
}
