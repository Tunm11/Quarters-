import type { PostgrestError } from "@supabase/supabase-js";
import type { ListingRow } from "@/lib/database.types";
import { cachedSignedUrls } from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Public listing read model.
 *
 * RLS already limits these rows to published listings from approved providers
 * with visible administration. The explicit `publication_status` filter keeps
 * the intent readable even if a future policy changes.
 */

export type PublicListing = Pick<
  ListingRow,
  | "id"
  | "title"
  | "description"
  | "accommodation_type"
  | "institution"
  | "city"
  | "neighbourhood"
  | "rent_amount"
  | "rent_period"
  | "availability_status"
  | "bedrooms"
  | "bathrooms"
  | "furnishing_status"
  | "facilities"
  | "first_published_at"
  | "created_at"
  | "verified_at"
  | "inspected_at"
> & {
  /**
   * Short-lived signed URL for the cover photograph, resolved from the private
   * listing-images bucket. Null when the listing has no photo or signing
   * failed; the card then shows its neutral placeholder.
   */
  cover_image_url: string | null;
  /**
   * Every signed photograph for the listing, cover first. A listing is a
   * catalogue, not one picture: the card browses these in place.
   */
  photo_urls: string[];
};

export type ListingCategory = "all" | "private" | "shared" | "hostel";

/** One annual rent band, e.g. "₦400k–₦700k". */
export type RentBand = {
  min: number;
  max: number | null;
};

/**
 * The filters chosen in the Explore filter sheet. Every field is optional:
 * an empty value means "no opinion" for that group.
 *
 * Within a group options are OR-ed (a private or a shared room); across groups
 * they are AND-ed. Selected facilities must all be present, which is what makes
 * "Wi-Fi + 24/7 power" narrow the list rather than widen it.
 */
export type ListingFilters = {
  budget: RentBand | null;
  types: ListingRow["accommodation_type"][];
  bedrooms: number[];
  facilities: string[];
};

export const emptyListingFilters: ListingFilters = {
  budget: null,
  types: [],
  bedrooms: [],
  facilities: [],
};

export function countActiveListingFilters(filters: ListingFilters): number {
  return (
    (filters.budget ? 1 : 0) +
    filters.types.length +
    filters.bedrooms.length +
    filters.facilities.length
  );
}

/** "₦850k" / "₦1.2m" — the compact rent used in filter labels. */
export function formatRentShort(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.round(amount / 100_000) / 10;
    return `₦${millions}m`;
  }
  return `₦${Math.round(amount / 1000)}k`;
}

function matchesRentBand(
  listing: Pick<PublicListing, "rent_amount">,
  band: RentBand,
): boolean {
  if (listing.rent_amount == null) return false;
  if (listing.rent_amount < band.min) return false;
  return band.max == null || listing.rent_amount <= band.max;
}

export const PUBLIC_LISTING_COLUMNS =
  "id, title, description, accommodation_type, institution, city, neighbourhood, rent_amount, rent_period, availability_status, bedrooms, bathrooms, furnishing_status, facilities, first_published_at, created_at, verified_at, inspected_at";

export const accommodationTypeLabels: Record<
  ListingRow["accommodation_type"],
  string
> = {
  self_contained: "Self-contained",
  private_room: "Private room",
  shared_room: "Shared room",
  hostel: "Hostel",
  apartment: "Apartment",
};

export const availabilityLabels: Record<
  ListingRow["availability_status"],
  string
> = {
  available: "Available now",
  limited: "Limited spots",
  unavailable: "Currently unavailable",
};

const categoryTypes: Record<
  Exclude<ListingCategory, "all">,
  ListingRow["accommodation_type"]
> = {
  private: "private_room",
  shared: "shared_room",
  hostel: "hostel",
};

const rentFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function formatListingLocation(
  listing: Pick<PublicListing, "neighbourhood" | "city">,
): string {
  return [listing.neighbourhood, listing.city].filter(Boolean).join(", ");
}

/**
 * Rent is let by the year or per academic session, so the stored "term" value
 * is shown to readers as "session" rather than the database enum name.
 */
export function formatListingRent(
  listing: Pick<PublicListing, "rent_amount" | "rent_period">,
): string | null {
  if (listing.rent_amount == null) return null;
  const amount = rentFormatter.format(listing.rent_amount);
  if (!listing.rent_period) return amount;
  const term = listing.rent_period === "term" ? "session" : listing.rent_period;
  return `${amount} / ${term}`;
}

export function filterPublicListings(
  listings: PublicListing[],
  {
    query,
    category,
    filters = emptyListingFilters,
  }: {
    query: string;
    category: ListingCategory;
    filters?: ListingFilters;
  },
): PublicListing[] {
  const normalizedQuery = query.trim().toLowerCase();
  const type = category === "all" ? null : categoryTypes[category];

  return listings.filter((listing) => {
    if (type && listing.accommodation_type !== type) return false;
    if (filters.budget && !matchesRentBand(listing, filters.budget)) return false;
    if (
      filters.types.length > 0 &&
      !filters.types.includes(listing.accommodation_type)
    ) {
      return false;
    }
    if (
      filters.bedrooms.length > 0 &&
      (listing.bedrooms == null || !filters.bedrooms.includes(listing.bedrooms))
    ) {
      return false;
    }
    if (
      filters.facilities.length > 0 &&
      !filters.facilities.every((facility) => listing.facilities.includes(facility))
    ) {
      return false;
    }
    if (!normalizedQuery) return true;

    const haystack = [
      listing.title,
      listing.city,
      listing.neighbourhood,
      listing.institution,
      accommodationTypeLabels[listing.accommodation_type],
      ...listing.facilities,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

/**
 * How many rooms one catalogue page holds. The catalogue is read page by page
 * rather than in one gulp, so a large catalogue is not downloaded (and does not
 * block the first paint) just to show the newest rooms.
 */
export const PUBLIC_LISTING_PAGE_SIZE = 24;

export type LoadPublicListingsOptions = {
  /** Rows to skip from the top of the newest-first catalogue. */
  offset?: number;
  pageSize?: number;
};

export type LoadPublicListingsResult = {
  listings: PublicListing[];
  error: string | null;
  /**
   * Every published room the caller may read, not just this page. Taken from
   * the response count, so it reflects the same RLS-filtered set the page came
   * from; it falls back to the rows read so far when the server omits a count.
   */
  total: number;
  /** True while rooms remain past this page. */
  hasMore: boolean;
};

/**
 * Appends a page to the rooms already on screen, with one card per listing.
 *
 * Pages are read by position, so a room published between two reads can appear
 * in both pages. Keeping the first copy holds React keys — and the reader's
 * place in the list — stable.
 */
export function mergePublicListings(
  current: PublicListing[],
  incoming: PublicListing[],
): PublicListing[] {
  const seen = new Set(current.map((listing) => listing.id));
  const merged = [...current];

  for (const listing of incoming) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);
    merged.push(listing);
  }

  return merged.length === current.length ? current : merged;
}

export function mapPublicListingsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "The listings table is not available. The listing migration may not be applied to this Supabase project.";
  }
  return "Could not load rooms from Supabase. Please try again.";
}

/**
 * Resolves signed photo URLs for every listing, cover first.
 *
 * Photographs live in the private listing-images bucket, so reads go through
 * Storage RLS and short-lived signed URLs rather than public object URLs.
 * Images are supplementary: any image query or signing failure simply leaves
 * the listing with fewer (or no) photos so the catalogue renders honestly.
 */
async function attachCoverImages(
  client: TypedSupabaseClient,
  listings: PublicListing[],
): Promise<PublicListing[]> {
  if (listings.length === 0) return listings;

  const { data: images, error: imagesError } = await client
    .from("listing_images")
    .select("listing_id, storage_path, is_cover, position")
    .in(
      "listing_id",
      listings.map((listing) => listing.id),
    )
    .order("is_cover", { ascending: false })
    .order("position", { ascending: true });

  if (imagesError || !images || images.length === 0) return listings;

  // Ordered per listing (the query sorts cover first, then position), so the
  // first signed URL is always the cover.
  const pathsByListing = new Map<string, string[]>();
  for (const image of images) {
    const paths = pathsByListing.get(image.listing_id) ?? [];
    paths.push(image.storage_path);
    pathsByListing.set(image.listing_id, paths);
  }

  const paths = [...new Set([...pathsByListing.values()].flat())];
  // Reuse one signature per photo, so reopening a list serves the images from
  // the browser cache rather than downloading them again.
  const urlByPath = await cachedSignedUrls(client, "listing-images", paths);

  return listings.map((listing) => {
    const photoUrls = (pathsByListing.get(listing.id) ?? [])
      .map((path) => urlByPath.get(path))
      .filter((url): url is string => Boolean(url));

    return {
      ...listing,
      cover_image_url: photoUrls[0] ?? null,
      photo_urls: photoUrls,
    };
  });
}

/**
 * Loads public summaries for specific listings, keyed by id. Used by the chat
 * when a message carries a property card; ids that are hidden or unpublished
 * simply do not resolve.
 */
export async function loadListingsByIds(
  client: TypedSupabaseClient,
  listingIds: string[],
): Promise<Map<string, PublicListing>> {
  if (listingIds.length === 0) return new Map();

  const { data, error } = await client
    .from("listings")
    .select(PUBLIC_LISTING_COLUMNS)
    .in("id", listingIds)
    .eq("publication_status", "published");

  if (error || !data) return new Map();

  const listings: PublicListing[] = data.map((listing) => ({
    ...listing,
    cover_image_url: null,
    photo_urls: [],
  }));

  const withImages = await attachCoverImages(client, listings);
  return new Map(withImages.map((listing) => [listing.id, listing]));
}

/**
 * Reads one page of the public catalogue, newest publication first.
 *
 * The order is total — publication time, then id — so a page boundary always
 * falls in the same place and paging never repeats or skips a room. The count
 * is requested with the page so the screen can say how much of the catalogue is
 * on screen instead of implying the page is the whole catalogue.
 */
export async function loadPublicListings(
  client: TypedSupabaseClient,
  {
    offset = 0,
    pageSize = PUBLIC_LISTING_PAGE_SIZE,
  }: LoadPublicListingsOptions = {},
): Promise<LoadPublicListingsResult> {
  const from = Math.max(0, Math.trunc(offset));
  const size = Math.max(1, Math.trunc(pageSize));

  const { data, error, count } = await client
    .from("listings")
    .select(PUBLIC_LISTING_COLUMNS, { count: "exact" })
    .eq("publication_status", "published")
    .order("first_published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + size - 1);

  if (error) {
    return {
      listings: [],
      error: mapPublicListingsError(error),
      total: 0,
      hasMore: false,
    };
  }

  const rows = data ?? [];
  const listings: PublicListing[] = rows.map((listing) => ({
    ...listing,
    cover_image_url: null,
    photo_urls: [],
  }));

  const total = count ?? from + rows.length;

  return {
    listings: await attachCoverImages(client, listings),
    error: null,
    total,
    // An empty page always ends the catalogue, even if the count disagrees, so
    // a repeated read can never spin a "load more" into a loop.
    hasMore: rows.length > 0 && from + rows.length < total,
  };
}
