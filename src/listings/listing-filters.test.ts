import { describe, expect, it } from "vitest";
import { buildListingFilterOptions } from "@/listings/listing-filters";
import type { PublicListing } from "@/listings/public-listings";

const base: PublicListing = {
  id: "listing-1",
  title: "Sunlit self-contained in Akoka",
  description: "A bright self-contained studio near the campus gate.",
  accommodation_type: "self_contained",
  institution: "University of Lagos",
  city: "Lagos",
  neighbourhood: "Akoka",
  rent_amount: 850000,
  rent_period: "year",
  availability_status: "available",
  bedrooms: 1,
  bathrooms: 1,
  furnishing_status: "furnished",
  facilities: ["Wi-Fi", "Water"],
  first_published_at: null,
  created_at: "2026-10-24T09:00:00+00:00",
  cover_image_url: null,
  photo_urls: [],
  verified_at: null,
  inspected_at: null,
};

const hostel: PublicListing = {
  ...base,
  id: "listing-2",
  accommodation_type: "hostel",
  rent_amount: 300000,
  bedrooms: null,
  facilities: ["Wi-Fi", "Security"],
};

const shared: PublicListing = {
  ...base,
  id: "listing-3",
  accommodation_type: "shared_room",
  rent_amount: 550000,
  bedrooms: 2,
  facilities: ["Water"],
};

describe("buildListingFilterOptions", () => {
  it("offers nothing while the catalogue is empty", () => {
    expect(buildListingFilterOptions([])).toEqual({
      budget: [],
      types: [],
      bedrooms: [],
      facilities: [],
    });
  });

  it("derives rent bands from the published rents, with counts", () => {
    const { budget } = buildListingFilterOptions([base, hostel, shared]);

    expect(budget.length).toBeGreaterThan(0);
    // Every band matches at least one room, and together they cover the set.
    expect(budget.reduce((total, band) => total + band.count, 0)).toBe(3);
    for (const band of budget) {
      expect(band.count).toBeGreaterThan(0);
    }
    // The bands start at zero and never overlap, so a room belongs to one only.
    expect(budget[0].band.min).toBe(0);
    for (let index = 1; index < budget.length; index += 1) {
      expect(budget[index].band.min).toBe((budget[index - 1].band.max ?? 0) + 1);
    }
  });

  it("collapses to a single band when every room costs the same", () => {
    const { budget } = buildListingFilterOptions([base, { ...hostel, rent_amount: 850000 }]);

    expect(budget).toHaveLength(1);
    expect(budget[0].count).toBe(2);
  });

  it("lists property types and bedrooms that actually appear", () => {
    const options = buildListingFilterOptions([base, hostel, shared]);

    expect(options.types.map((option) => option.id)).toEqual([
      "self_contained",
      "hostel",
      "shared_room",
    ]);
    expect(options.bedrooms.map((option) => option.label)).toEqual([
      "1 bedroom",
      "2 bedrooms",
    ]);
    // The hostel has no bedroom count, so it is not offered as a bedroom option.
    expect(options.bedrooms.flatMap((option) => option.value)).not.toContain(null);
  });

  it("ranks facilities by how many rooms have them", () => {
    const options = buildListingFilterOptions([base, hostel, shared]);

    // Most common first; ties are alphabetical, so both two-room facilities lead.
    expect(options.facilities.slice(0, 2).map((option) => option.count)).toEqual([
      2, 2,
    ]);
    expect(options.facilities.map((option) => option.id).sort()).toEqual([
      "Security",
      "Water",
      "Wi-Fi",
    ]);
  });
});
