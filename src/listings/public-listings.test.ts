import { describe, expect, it } from "vitest";
import {
  countActiveListingFilters,
  emptyListingFilters,
  filterPublicListings,
  formatListingLocation,
  formatListingRent,
  loadPublicListings,
  mergePublicListings,
  PUBLIC_LISTING_PAGE_SIZE,
  type PublicListing,
} from "@/listings/public-listings";
import type { TypedSupabaseClient } from "@/lib/supabase";

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
  title: "Student hostel bed in Ikeja",
  accommodation_type: "hostel",
  institution: "Lagos State University",
  neighbourhood: "Ikeja",
  rent_amount: 250000,
  facilities: ["Study room", "Security"],
};

describe("filterPublicListings", () => {
  it("returns every published listing for an empty all-category search", () => {
    expect(filterPublicListings([base, hostel], { query: "  ", category: "all" })).toHaveLength(2);
  });

  it("filters by room type", () => {
    const result = filterPublicListings([base, hostel], { query: "", category: "hostel" });
    expect(result.map((listing) => listing.id)).toEqual(["listing-2"]);
  });

  it("searches title, area, institution, type label and facilities", () => {
    for (const query of ["akoka", "University of Lagos", "Self-contained", "wi-fi"]) {
      const result = filterPublicListings([base, hostel], { query, category: "all" });
      expect(result.map((listing) => listing.id), query).toEqual(["listing-1"]);
    }
  });

  it("returns nothing when no listing matches", () => {
    expect(filterPublicListings([base, hostel], { query: "Lekki", category: "all" })).toEqual([]);
  });
});

describe("filterPublicListings with sheet filters", () => {
  const shared: PublicListing = {
    ...base,
    id: "listing-3",
    title: "Shared room in Gbagada",
    accommodation_type: "shared_room",
    neighbourhood: "Gbagada",
    rent_amount: 350000,
    bedrooms: 2,
    facilities: ["Wi-Fi", "Kitchen access"],
  };

  it("applies an annual rent band", () => {
    const result = filterPublicListings([base, hostel, shared], {
      query: "",
      category: "all",
      filters: { ...emptyListingFilters, budget: { min: 0, max: 400000 } },
    });
    expect(result.map((listing) => listing.id)).toEqual(["listing-2", "listing-3"]);
  });

  it("matches any chosen property type", () => {
    const result = filterPublicListings([base, hostel, shared], {
      query: "",
      category: "all",
      filters: { ...emptyListingFilters, types: ["hostel", "shared_room"] },
    });
    expect(result.map((listing) => listing.id)).toEqual(["listing-2", "listing-3"]);
  });

  it("requires every chosen facility", () => {
    const result = filterPublicListings([base, hostel, shared], {
      query: "",
      category: "all",
      filters: { ...emptyListingFilters, facilities: ["Wi-Fi"] },
    });
    expect(result.map((listing) => listing.id)).toEqual(["listing-1", "listing-3"]);

    const both = filterPublicListings([base, hostel, shared], {
      query: "",
      category: "all",
      filters: { ...emptyListingFilters, facilities: ["Wi-Fi", "Water"] },
    });
    expect(both.map((listing) => listing.id)).toEqual(["listing-1"]);
  });

  it("filters bedrooms and skips listings without a count", () => {
    const twoBed = filterPublicListings([base, hostel, shared], {
      query: "",
      category: "all",
      filters: { ...emptyListingFilters, bedrooms: [2] },
    });
    expect(twoBed.map((listing) => listing.id)).toEqual(["listing-3"]);
  });

  it("combines a filter with the category and the search text", () => {
    const result = filterPublicListings([base, hostel, shared], {
      query: "Gbagada",
      category: "shared",
      filters: { ...emptyListingFilters, budget: { min: 0, max: 400000 } },
    });
    expect(result.map((listing) => listing.id)).toEqual(["listing-3"]);
  });

  it("counts every active filter, including repeats within a group", () => {
    expect(countActiveListingFilters(emptyListingFilters)).toBe(0);
    expect(
      countActiveListingFilters({
        budget: { min: 0, max: 400000 },
        types: ["hostel", "shared_room"],
        bedrooms: [2],
        facilities: ["Wi-Fi"],
      }),
    ).toBe(5);
  });
});

/** A minimal PostgREST stand-in that records which page each read asked for. */
function fakeClient({
  rows = [] as Record<string, unknown>[],
  count = null as number | null,
  error = null as { code?: string; message: string } | null,
} = {}) {
  const reads: { table: string; range?: [number, number] }[] = [];

  const client = {
    from(table: string) {
      const read: { table: string; range?: [number, number] } = { table };
      reads.push(read);

      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          read.range = [from, to];
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: table === "listings" ? rows : [], error, count }),
      };

      return builder;
    },
  };

  return { client: client as unknown as TypedSupabaseClient, reads };
}

function listingRow(id: string): Record<string, unknown> {
  return {
    id,
    title: `Room ${id}`,
    description: null,
    accommodation_type: "self_contained",
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
    first_published_at: null,
    created_at: "2026-10-24T09:00:00+00:00",
  };
}

describe("loadPublicListings paging", () => {
  it("reads one page of the newest rooms and reports the catalogue size", async () => {
    const { client, reads } = fakeClient({ rows: [listingRow("a"), listingRow("b")], count: 60 });
    const result = await loadPublicListings(client);

    expect(reads[0]).toEqual({
      table: "listings",
      range: [0, PUBLIC_LISTING_PAGE_SIZE - 1],
    });
    expect(result.listings.map((listing) => listing.id)).toEqual(["a", "b"]);
    expect(result.total).toBe(60);
    expect(result.hasMore).toBe(true);
    expect(result.error).toBeNull();
  });

  it("continues from the rooms already read", async () => {
    const { client, reads } = fakeClient({ rows: [listingRow("y")], count: 60 });
    const result = await loadPublicListings(client, { offset: 24, pageSize: 10 });

    expect(reads[0].range).toEqual([24, 33]);
    expect(result.total).toBe(60);
    expect(result.hasMore).toBe(true);
  });

  it("ends the catalogue on the last page", async () => {
    const { client } = fakeClient({
      rows: [listingRow("a"), listingRow("b"), listingRow("c")],
      count: 3,
    });
    const result = await loadPublicListings(client);

    expect(result.hasMore).toBe(false);
  });

  it("treats an empty page as the end even when the count disagrees", async () => {
    const { client } = fakeClient({ rows: [], count: 60 });
    const result = await loadPublicListings(client, { offset: 48 });

    expect(result.listings).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(60);
  });

  it("falls back to the rows read when the server omits a count", async () => {
    const { client } = fakeClient({ rows: [listingRow("a"), listingRow("b")], count: null });
    const result = await loadPublicListings(client);

    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it("reports a failed page without inventing rooms", async () => {
    const { client } = fakeClient({ error: { code: "42P01", message: "missing" } });
    const result = await loadPublicListings(client);

    expect(result.listings).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.error).toMatch(/listings table is not available/);
  });
});

describe("mergePublicListings", () => {
  it("appends a page without repeating a room that shifted between reads", () => {
    expect(
      mergePublicListings([base], [base, hostel]).map((listing) => listing.id),
    ).toEqual(["listing-1", "listing-2"]);
  });

  it("keeps the loaded list when a page adds nothing new", () => {
    const loaded = [base];
    expect(mergePublicListings(loaded, [base])).toBe(loaded);
  });
});

describe("listing formatting", () => {
  it("joins the neighbourhood and city without inventing a location", () => {
    expect(formatListingLocation(base)).toBe("Akoka, Lagos");
    expect(formatListingLocation({ neighbourhood: null, city: "Lagos" })).toBe("Lagos");
  });

  it("formats rent as a yearly or per-session price", () => {
    expect(formatListingRent(base)).toBe("₦850,000 / year");
    expect(formatListingRent({ rent_amount: 250000, rent_period: "term" })).toBe(
      "₦250,000 / session",
    );
    expect(formatListingRent({ rent_amount: null, rent_period: null })).toBeNull();
  });
});
