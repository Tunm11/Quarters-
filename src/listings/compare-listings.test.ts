import { describe, expect, it } from "vitest";
import {
  buildComparison,
  MAX_COMPARE,
  toggleCompared,
} from "@/listings/compare-listings";
import type { PublicListing } from "@/listings/public-listings";

function listing(overrides: Partial<PublicListing>): PublicListing {
  return {
    id: "listing-1",
    title: "A room",
    description: null,
    accommodation_type: "private_room",
    institution: null,
    city: "Lagos",
    neighbourhood: null,
    rent_amount: null,
    rent_period: null,
    availability_status: "available",
    bedrooms: null,
    bathrooms: null,
    furnishing_status: null,
    facilities: [],
    first_published_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:00:00Z",
    cover_image_url: null,
    photo_urls: [],
    ...overrides,
  } as PublicListing;
}

describe("buildComparison", () => {
  it("gives every row one value per compared room", () => {
    const comparison = buildComparison([
      listing({
        id: "a",
        accommodation_type: "self_contained",
        neighbourhood: "Akoka",
        rent_amount: 850000,
        rent_period: "year",
        bedrooms: 1,
        facilities: ["Wi-Fi", "Water"],
      }),
      listing({ id: "b", accommodation_type: "shared_room" }),
    ]);

    for (const row of comparison.rows) {
      expect(row.values).toHaveLength(2);
    }

    const rent = comparison.rows.find((row) => row.key === "rent");
    expect(rent?.values[0]).toMatch(/850,000/);
    expect(rent?.values[0]).toMatch(/year/);
    expect(rent?.values[1]).toBeNull();

    const type = comparison.rows.find((row) => row.key === "type");
    expect(type?.values).toEqual(["Self-contained", "Shared room"]);

    const amenities = comparison.rows.find((row) => row.key === "amenities");
    expect(amenities?.values).toEqual(["Wi-Fi, Water", null]);
  });

  it("marks the cheapest known rent and ignores rooms with no rent", () => {
    const comparison = buildComparison([
      listing({ id: "a", rent_amount: 900000 }),
      listing({ id: "b", rent_amount: null }),
      listing({ id: "c", rent_amount: 550000 }),
    ]);

    expect(comparison.cheapestIndex).toBe(2);
  });

  it("has no cheapest room when nobody stated a rent", () => {
    const comparison = buildComparison([listing({ id: "a" }), listing({ id: "b" })]);

    expect(comparison.cheapestIndex).toBeNull();
  });
});

describe("toggleCompared", () => {
  it("adds a room, then removes it", () => {
    expect(toggleCompared([], "a")).toEqual(["a"]);
    expect(toggleCompared(["a"], "a")).toEqual([]);
  });

  it("keeps the oldest selection when the cap is reached", () => {
    const full = ["a", "b", "c", "d"].slice(0, MAX_COMPARE);

    expect(toggleCompared(full, "e")).toEqual(full);
  });
});
