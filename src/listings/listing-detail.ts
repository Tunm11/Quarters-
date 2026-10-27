import type { PostgrestError } from "@supabase/supabase-js";
import {
  mapPublicListingsError,
  type PublicListing,
} from "@/listings/public-listings";
import type { ListingRow, ProviderRow } from "@/lib/database.types";
import { cachedSignedUrls } from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type RentPeriod = NonNullable<ListingRow["rent_period"]>;

export type ListingPhoto = {
  path: string;
  /** Short-lived signed URL from the private bucket; null when signing fails. */
  url: string | null;
  alt: string | null;
};

export type ListingProvider = {
  id: string;
  display_name: string;
  kind: ProviderRow["kind"];
  /** When the provider was first approved / created, for the "on QUARTERS" line. */
  created_at: string;
};

export type PublicListingDetail = PublicListing & {
  property_rules: string[];
  /** Rooms or bed spaces. NULL when the provider has not stated it. */
  total_rooms: number | null;
  /** Rent session length in months (9, 12, ...) when the period alone is vague. */
  rent_session_months: number | null;
  /** One-off agency/commission fee, or null when the provider left it out. */
  agency_fee_amount: number | null;
  /** Refundable caution/security deposit. */
  caution_deposit_amount: number | null;
  /** Utilities cost per utilities_period, and how it is charged. */
  utilities_amount: number | null;
  utilities_period: RentPeriod | null;
  utilities_note: string | null;
  /** Earliest move-in date the provider states (YYYY-MM-DD). */
  available_from: string | null;
  /** When a moderator verified this listing's details, or null. */
  verified_at: string | null;
  /** When someone from QUARTERS inspected the property, or null. */
  inspected_at: string | null;
  photos: ListingPhoto[];
  provider: ListingProvider | null;
};

export const rentPeriodLabels: Record<RentPeriod, string> = {
  week: "week",
  month: "month",
  quarter: "quarter",
  term: "session",
  year: "year",
};

const rentAmountFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function formatRentAmount(amount: number): string {
  return rentAmountFormatter.format(amount);
}

/**
 * Human rent term. The period enum stops at "term"/"year", which cannot say
 * whether a session is 9 or 12 months, so a stored session length wins when it
 * is present.
 */
export function formatRentTerm(
  period: RentPeriod | null,
  sessionMonths: number | null,
): string | null {
  if (!period) return null;

  if (sessionMonths && (period === "term" || period === "year")) {
    return period === "term"
      ? `${sessionMonths}-month session`
      : `${sessionMonths} months`;
  }

  return rentPeriodLabels[period];
}

/** Compact term for the stat row: "9 mo", "Month", "Session", ... */
export function formatRentTermShort(
  period: RentPeriod | null,
  sessionMonths: number | null,
): string | null {
  if (!period) return null;
  if (sessionMonths) return `${sessionMonths} mo`;
  if (period === "quarter") return "3 mo";
  return period.charAt(0).toUpperCase() + period.slice(1);
}

/**
 * Loads one published listing with its photographs and provider.
 *
 * `select("*")` is deliberate: `total_rooms` and `rent_session_months` are
 * additive Phase 2D columns that may not exist on the database yet. PostgREST
 * simply omits absent columns, so the screen degrades to "not stated" instead
 * of failing before the migration is applied. Column grants still decide what
 * an anonymous reader can see.
 */
export async function loadPublicListingDetail(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ listing: PublicListingDetail | null; error: string | null }> {
  const { data, error } = await client
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("publication_status", "published")
    .maybeSingle();

  if (error) {
    return { listing: null, error: mapPublicListingsError(error as PostgrestError) };
  }
  if (!data) {
    return { listing: null, error: null };
  }

  const [photos, provider] = await Promise.all([
    loadListingPhotos(client, listingId),
    loadListingProvider(client, data.provider_id),
  ]);

  return {
    listing: {
      id: data.id,
      title: data.title,
      description: data.description,
      accommodation_type: data.accommodation_type,
      institution: data.institution,
      city: data.city,
      neighbourhood: data.neighbourhood,
      rent_amount: data.rent_amount,
      rent_period: data.rent_period,
      availability_status: data.availability_status,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      furnishing_status: data.furnishing_status,
      facilities: data.facilities,
      first_published_at: data.first_published_at,
      created_at: data.created_at,
      cover_image_url: photos[0]?.url ?? null,
      photo_urls: photos.map((photo) => photo.url).filter((url): url is string => Boolean(url)),
      property_rules: data.property_rules ?? [],
      total_rooms: data.total_rooms ?? null,
      rent_session_months: data.rent_session_months ?? null,
      agency_fee_amount: data.agency_fee_amount ?? null,
      caution_deposit_amount: data.caution_deposit_amount ?? null,
      utilities_amount: data.utilities_amount ?? null,
      utilities_period: data.utilities_period ?? null,
      utilities_note: data.utilities_note ?? null,
      available_from: data.available_from ?? null,
      verified_at: data.verified_at ?? null,
      inspected_at: data.inspected_at ?? null,
      photos,
      provider,
    },
    error: null,
  };
}

async function loadListingPhotos(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<ListingPhoto[]> {
  const { data: images, error } = await client
    .from("listing_images")
    .select("storage_path, alt_text, position, is_cover")
    .eq("listing_id", listingId)
    .order("is_cover", { ascending: false })
    .order("position", { ascending: true });

  if (error || !images || images.length === 0) return [];

  const urlByPath = await cachedSignedUrls(
    client,
    "listing-images",
    images.map((image) => image.storage_path),
  );

  return images.map((image) => ({
    path: image.storage_path,
    url: urlByPath.get(image.storage_path) ?? null,
    alt: image.alt_text,
  }));
}

async function loadListingProvider(
  client: TypedSupabaseClient,
  providerId: string,
): Promise<ListingProvider | null> {
  // RLS exposes approved providers only; a row that is no longer public simply
  // resolves to null and the screen shows no provider card.
  const { data } = await client
    .from("providers")
    .select("id, display_name, kind, created_at")
    .eq("id", providerId)
    .maybeSingle();

  return data ?? null;
}
