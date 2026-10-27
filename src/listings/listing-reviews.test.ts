import { describe, expect, it, vi, type Mock } from "vitest";
import {
  formatAverageScore,
  loadListingReviews,
  loadMyReview,
  loadReviewBasis,
  saveListingReview,
  validateReview,
  type ListingReview,
} from "@/listings/listing-reviews";
import type { TypedSupabaseClient } from "@/lib/supabase";

const review: ListingReview = {
  id: "review-1",
  rating: 4,
  body: "The room was exactly as described and the agent answered every question.",
  basis: "visit",
  created_at: "2026-10-20T09:00:00+00:00",
};

function client({
  reviews = [review] as ListingReview[],
  summary = [
    { total: 3, average: 4.33, five: 1, four: 2, three: 0, two: 0, one: 0 },
  ] as unknown[],
  listError = null as { code: string; message: string } | null,
  rpc = vi.fn(async () => ({ data: summary, error: null })) as Mock,
}: {
  reviews?: ListingReview[];
  summary?: unknown[];
  listError?: { code: string; message: string } | null;
  rpc?: Mock;
} = {}) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: reviews, error: listError }),
  };

  return {
    from: () => query,
    rpc,
  } as unknown as TypedSupabaseClient & { rpc: typeof rpc };
}

describe("validateReview", () => {
  it("requires a whole star rating", () => {
    expect(validateReview({ rating: 0, body: "A valid body of text here." })).toMatch(/1 to 5/);
    expect(validateReview({ rating: 6, body: "A valid body of text here." })).toMatch(/1 to 5/);
    expect(validateReview({ rating: 3.5, body: "A valid body of text here." })).toMatch(/1 to 5/);
  });

  it("requires enough words to be useful", () => {
    expect(validateReview({ rating: 5, body: "Great" })).toMatch(/at least 20/);
    expect(validateReview({ rating: 5, body: "   " })).toMatch(/at least 20/);
  });

  it("accepts a real review", () => {
    expect(
      validateReview({
        rating: 4,
        body: "  The room matched the listing and the agent was easy to reach.  ",
      }),
    ).toBeNull();
  });

  it("caps the length", () => {
    expect(validateReview({ rating: 4, body: "x".repeat(1501) })).toMatch(/under 1500/);
  });
});

describe("loadListingReviews", () => {
  it("returns the reviews with a mapped star distribution", async () => {
    const result = await loadListingReviews(client(), "listing-1");

    expect(result.error).toBeNull();
    expect(result.reviews).toHaveLength(1);
    expect(result.summary.total).toBe(3);
    expect(result.summary.average).toBe(4.33);
    expect(result.summary.distribution[0]).toEqual({ stars: 5, count: 1 });
    expect(result.summary.distribution[1]).toEqual({ stars: 4, count: 2 });
  });

  it("keeps the reviews when only the aggregate fails", async () => {
    const result = await loadListingReviews(
      client({
        summary: [],
        rpc: vi.fn(async () => ({ data: null, error: { code: "42883", message: "missing" } })),
      }),
      "listing-1",
    );

    expect(result.error).toBeNull();
    expect(result.reviews).toHaveLength(1);
    expect(result.summary.total).toBe(0);
  });

  it("explains a missing migration instead of throwing", async () => {
    const result = await loadListingReviews(
      client({ reviews: [], listError: { code: "42P01", message: "no table" } }),
      "listing-1",
    );

    expect(result.reviews).toEqual([]);
    expect(result.error).toMatch(/not available yet/);
  });
});

describe("saveListingReview", () => {
  it("sends the trimmed body and the reviewer's basis", async () => {
    const rpc = vi.fn(async () => ({ data: "review-1", error: null }));
    const result = await saveListingReview(client({ rpc }), {
      listingId: "listing-1",
      rating: 5,
      body: "  A genuinely useful review of the property.  ",
      basis: "reservation",
    });

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("save_listing_review", {
      target_listing_id: "listing-1",
      p_rating: 5,
      p_body: "A genuinely useful review of the property.",
      p_basis: "reservation",
    });
  });

  it("refuses locally before touching the database", async () => {
    const rpc = vi.fn();
    const result = await saveListingReview(client({ rpc }), {
      listingId: "listing-1",
      rating: 0,
      body: "Too short",
      basis: "visit",
    });

    expect(result.error).toMatch(/1 to 5/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the database's own refusal", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "42501",
        message: "Reviews are open to students who visited or reserved a room here.",
      },
    }));

    const result = await saveListingReview(client({ rpc }), {
      listingId: "listing-1",
      rating: 5,
      body: "A review that the database will refuse outright.",
      basis: "visit",
    });

    expect(result.error).toMatch(/visited or reserved/);
  });
});

describe("loadReviewBasis and loadMyReview", () => {
  it("returns the caller's evidence", async () => {
    const basis = await loadReviewBasis(
      client({ rpc: vi.fn(async () => ({ data: "reservation", error: null })) }),
      "listing-1",
    );

    expect(basis).toBe("reservation");
  });

  it("returns null when the helper refuses", async () => {
    const basis = await loadReviewBasis(
      client({ rpc: vi.fn(async () => ({ data: null, error: { code: "42501" } })) }),
      "listing-1",
    );

    expect(basis).toBeNull();
  });

  it("maps the caller's own review", async () => {
    const mine = await loadMyReview(
      client({
        rpc: vi.fn(async () => ({
          data: [
            {
              id: "review-9",
              rating: 3,
              body: "A corrected review of the room I reserved.",
              basis: "reservation",
              created_at: "2026-10-01T08:00:00+00:00",
              updated_at: "2026-10-02T08:00:00+00:00",
            },
          ],
          error: null,
        })),
      }),
      "listing-1",
    );

    expect(mine?.id).toBe("review-9");
    expect(mine?.rating).toBe(3);
  });

  it("returns null when the caller has not reviewed", async () => {
    const mine = await loadMyReview(
      client({ rpc: vi.fn(async () => ({ data: [], error: null })) }),
      "listing-1",
    );

    expect(mine).toBeNull();
  });
});

describe("formatAverageScore", () => {
  it("shows whole numbers plainly and halves to one decimal", () => {
    expect(formatAverageScore(4)).toBe("4");
    expect(formatAverageScore(4.33)).toBe("4.3");
    expect(formatAverageScore(null)).toBeNull();
  });
});
