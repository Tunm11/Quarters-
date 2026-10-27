import { describe, expect, it, vi } from "vitest";
import {
  countSavedSearchMatches,
  createSavedSearch,
  criteriaFromSavedSearch,
  hasSearchCriteria,
  savedSearchCriteriaFromParams,
  savedSearchParams,
  suggestSavedSearchName,
  summarizeSavedSearch,
  updateSavedSearch,
  type SavedSearch,
} from "@/listings/saved-searches";
import type { PublicListing } from "@/listings/public-listings";
import type { TypedSupabaseClient } from "@/lib/supabase";

const search: SavedSearch = {
  id: "search-1",
  name: "Akoka under ₦800k",
  query: "akoka",
  category: "private",
  budget_min: 0,
  budget_max: 800000,
  types: ["private_room"],
  bedrooms: [1],
  facilities: ["Wi-Fi"],
  notify: true,
  created_at: "2026-10-26T08:00:00Z",
};

const listing = {
  id: "listing-1",
  title: "Sunlit room in Akoka",
  description: null,
  accommodation_type: "private_room",
  institution: "University of Lagos",
  city: "Lagos",
  neighbourhood: "Akoka",
  rent_amount: 750000,
  rent_period: "year",
  availability_status: "available",
  bedrooms: 1,
  bathrooms: 1,
  furnishing_status: null,
  facilities: ["Wi-Fi", "Water"],
  first_published_at: "2026-10-25T08:00:00Z",
  created_at: "2026-10-25T08:00:00Z",
  cover_image_url: null,
  photo_urls: [],
} as unknown as PublicListing;

describe("criteriaFromSavedSearch", () => {
  it("reads the stored columns back as a search", () => {
    expect(criteriaFromSavedSearch(search)).toEqual({
      query: "akoka",
      category: "private",
      filters: {
        budget: { min: 0, max: 800000 },
        types: ["private_room"],
        bedrooms: [1],
        facilities: ["Wi-Fi"],
      },
    });
  });

  it("treats a search with no bounds as having no budget filter", () => {
    const criteria = criteriaFromSavedSearch({
      ...search,
      budget_min: null,
      budget_max: null,
    });

    expect(criteria.filters.budget).toBeNull();
  });

  it("keeps an open-ended band open-ended", () => {
    const criteria = criteriaFromSavedSearch({
      ...search,
      budget_min: 700001,
      budget_max: null,
    });

    expect(criteria.filters.budget).toEqual({ min: 700001, max: null });
  });
});

describe("summarizeSavedSearch", () => {
  it("lists the parts of a search in reading order", () => {
    expect(summarizeSavedSearch(criteriaFromSavedSearch(search))).toBe(
      "“akoka” · Private rooms · Under ₦800k · Private room · 1 bedroom · Wi-Fi",
    );
  });

  it("says so when a search narrows nothing", () => {
    const criteria = criteriaFromSavedSearch({
      ...search,
      query: "",
      category: "all",
      budget_min: null,
      budget_max: null,
      types: [],
      bedrooms: [],
      facilities: [],
    });

    expect(summarizeSavedSearch(criteria)).toBe("Every published room");
    expect(hasSearchCriteria(criteria)).toBe(false);
  });

  it("names a search from its first few parts", () => {
    expect(suggestSavedSearchName(criteriaFromSavedSearch(search))).toBe(
      "“akoka” · Private rooms · Under ₦800k",
    );
    expect(suggestSavedSearchName({ query: "", category: "all", filters: { budget: null, types: [], bedrooms: [], facilities: [] } })).toBe(
      "All rooms",
    );
  });

  it("knows a search that narrows anything", () => {
    expect(hasSearchCriteria(criteriaFromSavedSearch(search))).toBe(true);
    expect(
      hasSearchCriteria({ query: "  ", category: "all", filters: { budget: null, types: [], bedrooms: [], facilities: [] } }),
    ).toBe(false);
  });
});

describe("sharing a search through the URL", () => {
  it("round-trips every part of a search", () => {
    const criteria = criteriaFromSavedSearch(search);
    const params = savedSearchParams(criteria);

    expect(savedSearchCriteriaFromParams(params)).toEqual(criteria);
  });

  it("keeps facility names that contain a separator", () => {
    const criteria = {
      query: "",
      category: "all" as const,
      filters: {
        budget: null,
        types: [],
        bedrooms: [],
        facilities: ["Water, 24/7", "Wi-Fi"],
      },
    };

    expect(savedSearchCriteriaFromParams(savedSearchParams(criteria))).toEqual(criteria);
  });

  it("ignores anything it cannot trust", () => {
    const params = new URLSearchParams({
      category: "castle",
      types: "private_room,not_a_type",
      bedrooms: "1,1,-2,900,2.5",
      min: "abc",
      max: "400000",
    });

    const criteria = savedSearchCriteriaFromParams(params);

    expect(criteria.category).toBe("all");
    expect(criteria.filters.types).toEqual(["private_room"]);
    // Only whole counts a listing could actually have survive, deduplicated.
    expect(criteria.filters.bedrooms).toEqual([1]);
    // A maximum with no readable minimum is an open low end, not a dropped budget.
    expect(criteria.filters.budget).toEqual({ min: 0, max: 400000 });
  });

  it("carries nothing when the URL has no search", () => {
    const criteria = savedSearchCriteriaFromParams(new URLSearchParams());

    expect(criteria).toEqual({
      query: "",
      category: "all",
      filters: { budget: null, types: [], bedrooms: [], facilities: [] },
    });
  });
});

describe("countSavedSearchMatches", () => {
  it("counts the rooms the search narrows to", () => {
    const criteria = criteriaFromSavedSearch(search);

    expect(countSavedSearchMatches(criteria, [listing])).toBe(1);
    expect(
      countSavedSearchMatches(criteria, [
        listing,
        { ...listing, id: "listing-2", accommodation_type: "shared_room" },
        { ...listing, id: "listing-3", rent_amount: 900000 },
        { ...listing, id: "listing-4", facilities: ["Water"] },
      ]),
    ).toBe(1);
  });
});

describe("createSavedSearch", () => {
  it("writes the criteria as columns, not as a blob", async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: vi.fn().mockResolvedValue({ data: search, error: null }),
      }),
    }));
    const client = { from: () => ({ insert }) } as unknown as TypedSupabaseClient;

    const result = await createSavedSearch(client, {
      userId: "user-1",
      name: "  Akoka   under ₦800k  ",
      criteria: criteriaFromSavedSearch(search),
      notify: true,
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Akoka under ₦800k",
      query: "akoka",
      category: "private",
      budget_min: 0,
      budget_max: 800000,
      types: ["private_room"],
      bedrooms: [1],
      facilities: ["Wi-Fi"],
      notify: true,
    });
    expect(result.search).toEqual(search);
  });

  it("asks for a name before writing anything", async () => {
    const insert = vi.fn();
    const client = { from: () => ({ insert }) } as unknown as TypedSupabaseClient;

    const result = await createSavedSearch(client, {
      userId: "user-1",
      name: "   ",
      criteria: criteriaFromSavedSearch(search),
      notify: true,
    });

    expect(insert).not.toHaveBeenCalled();
    expect(result.error).toMatch(/name first/);
  });

  it("explains a missing migration instead of throwing", async () => {
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "42P01", message: "missing" },
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await createSavedSearch(client, {
      userId: "user-1",
      name: "Akoka",
      criteria: criteriaFromSavedSearch(search),
      notify: true,
    });

    expect(result.search).toBeNull();
    expect(result.error).toMatch(/not available yet/);
  });
});

describe("updateSavedSearch", () => {
  it("sends only the switch when alerting is toggled", async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ...search, notify: false },
            error: null,
          }),
        }),
      }),
    }));
    const client = { from: () => ({ update }) } as unknown as TypedSupabaseClient;

    const result = await updateSavedSearch(client, {
      searchId: "search-1",
      notify: false,
    });

    expect(update).toHaveBeenCalledWith({ notify: false });
    expect(result.search?.notify).toBe(false);
  });

  it("reports a search that no longer exists", async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await updateSavedSearch(client, {
      searchId: "search-1",
      name: "Renamed",
    });

    expect(result.search).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });
});
