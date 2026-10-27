import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Reviews are read straight from the table, but written through
 * `save_listing_review`: the eligibility rule and the reviewer's identity are
 * decided in the database, never by the client.
 */
export type ReviewBasis = "visit" | "reservation";

export type ListingReview = {
  id: string;
  rating: number;
  body: string;
  basis: ReviewBasis;
  created_at: string;
};

export type ReviewStarCount = {
  stars: number;
  count: number;
};

export type ListingReviewSummary = {
  total: number;
  average: number | null;
  distribution: ReviewStarCount[];
};

/** How many reviews are shown before "see all" would be needed. */
export const REVIEW_PAGE_SIZE = 12;
export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 1500;

export const reviewBasisLabels: Record<ReviewBasis, string> = {
  visit: "Visited",
  reservation: "Reserved a room",
};

const emptySummary: ListingReviewSummary = {
  total: 0,
  average: null,
  distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
};

export function mapReviewError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Reviews are not available yet. Apply the listing-reviews migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Reviews are open to students who visited or reserved a room here.";
  }
  return "Could not save your review. Please try again.";
}

/** Null when the draft is valid, otherwise the message to show. */
export function validateReview({
  rating,
  body,
}: {
  rating: number;
  body: string;
}): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "Choose a rating from 1 to 5 stars.";
  }
  const trimmed = body.trim();
  if (trimmed.length < REVIEW_BODY_MIN) {
    return `Write at least ${REVIEW_BODY_MIN} characters so it is useful to other students.`;
  }
  if (trimmed.length > REVIEW_BODY_MAX) {
    return `Keep your review under ${REVIEW_BODY_MAX} characters.`;
  }
  return null;
}

/** `4.5`, or `4` for a whole-number average. */
export function formatAverageScore(average: number | null): string | null {
  if (average == null) return null;
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

export function formatReviewDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
  }).format(new Date(isoDate));
}

/** Everything the reviews section needs, in one round of queries. */
export async function loadListingReviews(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ reviews: ListingReview[]; summary: ListingReviewSummary; error: string | null }> {
  const [listResult, summaryResult] = await Promise.all([
    client
      .from("listing_reviews")
      .select("id, rating, body, basis, created_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(REVIEW_PAGE_SIZE),
    client.rpc("listing_review_summary", { target_listing_id: listingId }),
  ]);

  if (listResult.error) {
    return { reviews: [], summary: emptySummary, error: mapReviewError(listResult.error) };
  }
  if (summaryResult.error) {
    // The reviews themselves are still worth showing without the aggregate.
    return {
      reviews: (listResult.data ?? []) as ListingReview[],
      summary: emptySummary,
      error: null,
    };
  }

  const row = (summaryResult.data ?? [])[0];
  const summary: ListingReviewSummary = row
    ? {
        total: row.total ?? 0,
        average: row.average ?? null,
        distribution: [
          { stars: 5, count: row.five ?? 0 },
          { stars: 4, count: row.four ?? 0 },
          { stars: 3, count: row.three ?? 0 },
          { stars: 2, count: row.two ?? 0 },
          { stars: 1, count: row.one ?? 0 },
        ],
      }
    : emptySummary;

  return {
    reviews: (listResult.data ?? []) as ListingReview[],
    summary,
    error: null,
  };
}

/**
 * The evidence the signed-in caller has for reviewing this listing, or null.
 * The same rule guards the write, so the button never appears to someone the
 * database would refuse.
 */
export async function loadReviewBasis(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<ReviewBasis | null> {
  const { data, error } = await client.rpc("listing_review_basis", {
    target_listing_id: listingId,
  });
  if (error || !data) return null;
  return data as ReviewBasis;
}

/** The caller's own review, so a correction opens prefilled. */
export async function loadMyReview(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<ListingReview | null> {
  const { data, error } = await client.rpc("my_listing_review", {
    target_listing_id: listingId,
  });
  if (error) return null;

  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    basis: row.basis as ReviewBasis,
    created_at: row.created_at,
  };
}

export async function saveListingReview(
  client: TypedSupabaseClient,
  {
    listingId,
    rating,
    body,
    basis,
  }: {
    listingId: string;
    rating: number;
    body: string;
    basis: ReviewBasis;
  },
): Promise<{ error: string | null }> {
  const validation = validateReview({ rating, body });
  if (validation) return { error: validation };

  const { error } = await client.rpc("save_listing_review", {
    target_listing_id: listingId,
    p_rating: rating,
    p_body: body.trim(),
    p_basis: basis,
  });

  if (error) {
    // The RPC raises its own explanation; show that rather than a generic one.
    if (error.code === "42501" && error.message) {
      return { error: error.message };
    }
    return { error: mapReviewError(error) };
  }

  return { error: null };
}
