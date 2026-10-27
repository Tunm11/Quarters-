import { describe, expect, it } from "vitest";
import {
  buildCampusOptions,
  UNSTATED_CAMPUS,
  groupListingsByCampus,
  listingSortLabel,
  sortPublicListings,
  type ListingSortId,
} from "@/listings/listing-sort";
import type { PublicListing } from "@/listings/public-listings";

function listing(overrides: Partial<PublicListing> & { id: string }): PublicListing {
  return {
    title: `Room ${overrides.id}`,
    description: null,
    accommodation_type: "private_room",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Akoka",
    rent_amount: 500000,
    rent_period: "year",
    availability_status: "available",
    bedrooms: 1,
    bathrooms: 1,
    furnishing_status: null,
    facilities: [],
    first_published_at: "2026-10-20T09:00:00+00:00",
    created_at: "2026-10-20T09:00:00+00:00",
    cover_image_url: null,
    photo_urls: [],
    verified_at: null,
    inspected_at: null,
    ...overrides,
  };
}

const cheapest = listing({
  id: "cheap",
  rent_amount: 250000,
  first_published_at: "2026-10-18T09:00:00+00:00",
});
const mid = listing({
  id: "mid",
  rent_amount: 550000,
  first_published_at: "2026-10-19T09:00:00+00:00",
});
const priciest = listing({
  id: "pricey",
  rent_amount: 900000,
  institution: "Lagos State University",
  first_published_at: "2026-10-17T09:00:00+00:00",
});
const noRent = listing({
  id: "unknown-rent",
  rent_amount: null,
  institution: null,
  neighbourhood: null,
  first_published_at: "2026-10-16T09:00:00+00:00",
});

const catalogue = [cheapest, mid, priciest, noRent];
const ids = (listings: PublicListing[]) => listings.map((entry) => entry.id);

describe("sortPublicListings", () => {
  it("orders newest first by publication date", () => {
    expect(ids(sortPublicListings(catalogue, { sort: "newest" }))).toEqual([
      "mid",
      "cheap",
      "pricey",
      "unknown-rent",
    ]);
  });

  it("falls back to created_at when a room has never been published before", () => {
    const draft = listing({
      id: "just-created",
      first_published_at: null,
      created_at: "2026-10-25T09:00:00+00:00",
    });
    expect(ids(sortPublicListings([cheapest, draft], { sort: "newest" }))).toEqual([
      "just-created",
      "cheap",
    ]);
  });

  it("sorts price low to high and keeps rooms with no stated rent last", () => {
    expect(ids(sortPublicListings(catalogue, { sort: "price-asc" }))).toEqual([
      "cheap",
      "mid",
      "pricey",
      "unknown-rent",
    ]);
  });

  it("sorts price high to low and still keeps rooms with no stated rent last", () => {
    expect(ids(sortPublicListings(catalogue, { sort: "price-desc" }))).toEqual([
      "pricey",
      "mid",
      "cheap",
      "unknown-rent",
    ]);
  });

  it("ranks rooms that name the chosen campus first, keeping newest within each part", () => {
    const result = sortPublicListings(catalogue, {
      sort: "closest",
      campus: "University of Lagos",
    });
    expect(ids(result)).toEqual(["mid", "cheap", "pricey", "unknown-rent"]);
  });

  it("matches the campus case- and space-insensitively", () => {
    const result = sortPublicListings(catalogue, {
      sort: "closest",
      campus: "  university of lagos ",
    });
    expect(ids(result).slice(0, 2)).toEqual(["mid", "cheap"]);
  });

  it("falls back to newest when closest is chosen without a campus", () => {
    // Lagos State University reorders the list, so this proves the campus is
    // what changes the sequence rather than the newest-first tiebreak.
    const withCampus = sortPublicListings(catalogue, {
      sort: "closest",
      campus: "Lagos State University",
    });
    const withoutCampus = sortPublicListings(catalogue, { sort: "closest" });
    expect(ids(withoutCampus)).toEqual(ids(sortPublicListings(catalogue, { sort: "newest" })));
    expect(ids(withoutCampus)).not.toEqual(ids(withCampus));
  });

  it("leaves the caller's array untouched", () => {
    const input = [...catalogue];
    sortPublicListings(input, { sort: "price-asc" });
    expect(ids(input)).toEqual(["cheap", "mid", "pricey", "unknown-rent"]);
  });

  it("labels every sort id", () => {
    const ids: ListingSortId[] = ["newest", "price-asc", "price-desc", "closest"];
    for (const id of ids) expect(listingSortLabel(id)).not.toBe("");
  });
});

describe("buildCampusOptions", () => {
  it("counts the campuses published rooms actually name", () => {
    expect(buildCampusOptions(catalogue)).toEqual([
      { name: "University of Lagos", count: 2 },
      { name: "Lagos State University", count: 1 },
    ]);
  });

  it("offers nothing when no room names a campus", () => {
    expect(buildCampusOptions([noRent])).toEqual([]);
  });
});

describe("groupListingsByCampus", () => {
  it("groups rooms by campus and closes with the rooms that name none", () => {
    const groups = groupListingsByCampus(catalogue);
    expect(groups.map((group) => group.name)).toEqual([
      "University of Lagos",
      "Lagos State University",
      UNSTATED_CAMPUS,
    ]);
    expect(groups[2].unstated).toBe(true);
    expect(ids(groups[0].listings)).toEqual(["cheap", "mid"]);
  });

  it("lists the areas in each group and the cheapest stated rent", () => {
    const yaba = listing({ id: "yaba", neighbourhood: "Yaba", rent_amount: 400000 });
    const groups = groupListingsByCampus([cheapest, yaba, noRent]);
    const unilag = groups[0];
    expect(unilag.neighbourhoods).toEqual(["Akoka", "Yaba"]);
    expect(unilag.minRent).toBe(250000);
    // A room without an area or a rent never contributes a guessed one.
    const unstated = groups.find((group) => group.unstated);
    expect(unstated?.neighbourhoods).toEqual([]);
    expect(unstated?.minRent).toBeNull();
  });

  it("moves the student's own campus to the top", () => {
    const groups = groupListingsByCampus(catalogue, { campus: "Lagos State University" });
    expect(groups[0].name).toBe("Lagos State University");
    expect(groups.at(-1)?.unstated).toBe(true);
  });
});
