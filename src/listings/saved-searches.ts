import type { PostgrestError } from "@supabase/supabase-js";
import type { SavedSearchRow, SavedSearchUpdate } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";
import {
  accommodationTypeLabels,
  emptyListingFilters,
  filterPublicListings,
  formatRentShort,
  type ListingCategory,
  type ListingFilters,
  type PublicListing,
  type RentBand,
} from "@/listings/public-listings";

/**
 * Saved searches: the Explore query plus the filter-sheet choices, kept per
 * account with an optional alert for new matching rooms.
 *
 * The row is stored as columns rather than as a serialized blob because the
 * database's own publish trigger matches it in SQL; see
 * `supabase/migrations/20261025461000_add_saved_searches.sql`. Everything the
 * client does here mirrors that trigger's rules, so the "N rooms match now"
 * count and the alerts a student receives agree.
 */
export type SavedSearch = Pick<
  SavedSearchRow,
  | "id"
  | "name"
  | "query"
  | "category"
  | "budget_min"
  | "budget_max"
  | "types"
  | "bedrooms"
  | "facilities"
  | "notify"
  | "created_at"
>;

/** The search itself, independent of what it is called or whether it alerts. */
export type SavedSearchCriteria = {
  query: string;
  category: ListingCategory;
  filters: ListingFilters;
};

export const SAVED_SEARCH_NAME_MAX_LENGTH = 40;

const SAVED_SEARCH_COLUMNS =
  "id, name, query, category, budget_min, budget_max, types, bedrooms, facilities, notify, created_at";

const categoryLabels: Record<ListingCategory, string> = {
  all: "All rooms",
  private: "Private rooms",
  shared: "Shared rooms",
  hostel: "Hostels",
};

export const savedSearchCategories: ListingCategory[] = [
  "all",
  "private",
  "shared",
  "hostel",
];

export function savedSearchCategoryLabel(category: ListingCategory): string {
  return categoryLabels[category];
}

export function normalizeSavedSearchName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, SAVED_SEARCH_NAME_MAX_LENGTH);
}

export function mapSavedSearchesError(error: PostgrestError): string {
  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return "Saved searches are not available yet. The saved-searches migration may not be applied to this Supabase project.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to keep saved searches.";
  }
  if (error.code === "23514") {
    return `Keep the name to ${SAVED_SEARCH_NAME_MAX_LENGTH} characters or fewer, and describe the search as you built it.`;
  }
  return "Could not update your saved searches. Please try again.";
}

/** Reads one row as the search it describes. */
export function criteriaFromSavedSearch(search: SavedSearch): SavedSearchCriteria {
  const hasBudget = search.budget_min != null || search.budget_max != null;
  return {
    query: search.query,
    category: search.category,
    filters: {
      budget: hasBudget ? { min: search.budget_min ?? 0, max: search.budget_max } : null,
      types: search.types,
      bedrooms: search.bedrooms,
      facilities: search.facilities,
    },
  };
}

/** True when the search would narrow the catalogue at all. */
export function hasSearchCriteria(criteria: SavedSearchCriteria): boolean {
  return (
    criteria.query.trim().length > 0 ||
    criteria.category !== "all" ||
    criteria.filters.budget !== null ||
    criteria.filters.types.length > 0 ||
    criteria.filters.bedrooms.length > 0 ||
    criteria.filters.facilities.length > 0
  );
}

/**
 * The parts of a search in reading order, e.g. `"akoka" · Private rooms ·
 * Under ₦700k · Wi-Fi`. Used for the row in the Saved tab and for the name
 * suggested when a search is first saved.
 */
export function describeSavedSearch(criteria: SavedSearchCriteria): string[] {
  const parts: string[] = [];
  const query = criteria.query.trim();
  if (query) parts.push(`“${query}”`);
  if (criteria.category !== "all") parts.push(categoryLabels[criteria.category]);

  const budget = criteria.filters.budget;
  if (budget) {
    parts.push(
      budget.max == null
        ? `Above ${formatRentShort(budget.min)}`
        : budget.min === 0
          ? `Under ${formatRentShort(budget.max + 1)}`
          : `${formatRentShort(budget.min - 1)}–${formatRentShort(budget.max)}`,
    );
  }

  for (const type of criteria.filters.types) {
    parts.push(accommodationTypeLabels[type]);
  }
  for (const bedrooms of criteria.filters.bedrooms) {
    parts.push(`${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`);
  }
  for (const facility of criteria.filters.facilities) {
    parts.push(facility);
  }

  return parts;
}

export function summarizeSavedSearch(criteria: SavedSearchCriteria): string {
  const parts = describeSavedSearch(criteria);
  return parts.length > 0 ? parts.join(" · ") : "Every published room";
}

/** The name offered when a search is first saved. */
export function suggestSavedSearchName(criteria: SavedSearchCriteria): string {
  const parts = describeSavedSearch(criteria);
  if (parts.length === 0) return "All rooms";
  return normalizeSavedSearchName(parts.slice(0, 3).join(" · "));
}

/** How many of the rooms on screen this search matches right now. */
export function countSavedSearchMatches(
  criteria: SavedSearchCriteria,
  listings: PublicListing[],
): number {
  return filterPublicListings(listings, {
    query: criteria.query,
    category: criteria.category,
    filters: criteria.filters,
  }).length;
}

// ---------------------------------------------------------------------------
// Sharing a search through the URL
//
// Explore reads these on load, which is how "View results" reopens a saved
// search and how a filtered listing can be linked to someone else. Only the
// search itself is carried; the sort order and campus stay per visit.
// ---------------------------------------------------------------------------

const TYPES_PARAM = "types";
const BEDROOMS_PARAM = "bedrooms";
const FACILITY_PARAM = "f";

export function hasExploreSearchParams(params: URLSearchParams): boolean {
  return [...params.keys()].some((key) =>
    ["q", "category", "min", "max", TYPES_PARAM, BEDROOMS_PARAM, FACILITY_PARAM].includes(
      key,
    ),
  );
}

export function savedSearchParams(criteria: SavedSearchCriteria): URLSearchParams {
  const params = new URLSearchParams();
  const query = criteria.query.trim();
  if (query) params.set("q", query);
  if (criteria.category !== "all") params.set("category", criteria.category);

  const budget = criteria.filters.budget;
  if (budget) {
    params.set("min", String(budget.min));
    if (budget.max != null) params.set("max", String(budget.max));
  }

  if (criteria.filters.types.length > 0) {
    params.set(TYPES_PARAM, criteria.filters.types.join(","));
  }
  if (criteria.filters.bedrooms.length > 0) {
    params.set(BEDROOMS_PARAM, criteria.filters.bedrooms.join(","));
  }
  // One parameter per facility: a facility name is free text and may contain
  // any separator a joined list would use.
  for (const facility of criteria.filters.facilities) {
    params.append(FACILITY_PARAM, facility);
  }

  return params;
}

function parseTypes(raw: string | null): ListingFilters["types"] {
  if (!raw) return [];
  const allowed = new Set(Object.keys(accommodationTypeLabels));
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ListingFilters["types"][number] => allowed.has(value));
}

function parseNumbers(values: string[], max: number): number[] {
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) continue;
    seen.add(parsed);
  }
  return [...seen].sort((left, right) => left - right);
}

/** Reads a search back off the URL, ignoring anything it cannot trust. */
export function savedSearchCriteriaFromParams(
  params: URLSearchParams,
): SavedSearchCriteria {
  const categoryParam = params.get("category");
  const category: ListingCategory = savedSearchCategories.includes(
    categoryParam as ListingCategory,
  )
    ? (categoryParam as ListingCategory)
    : "all";

  const min = Number(params.get("min"));
  const max = Number(params.get("max"));
  const hasMin = params.has("min") && Number.isFinite(min);
  const hasMax = params.has("max") && Number.isFinite(max);
  let budget: RentBand | null = null;
  if (hasMin || hasMax) {
    const bandMin = hasMin ? Math.max(0, Math.trunc(min)) : 0;
    budget = {
      min: bandMin,
      max: hasMax ? Math.max(bandMin, Math.trunc(max)) : null,
    };
  }

  return {
    query: (params.get("q") ?? "").slice(0, 80),
    category,
    filters: {
      budget,
      types: parseTypes(params.get(TYPES_PARAM)),
      bedrooms: parseNumbers(params.get(BEDROOMS_PARAM)?.split(",") ?? [], 50),
      facilities: params
        .getAll(FACILITY_PARAM)
        .map((facility) => facility.trim())
        .filter(Boolean)
        .slice(0, 30),
    },
  };
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export const emptySavedSearchCriteria: SavedSearchCriteria = {
  query: "",
  category: "all",
  filters: emptyListingFilters,
};

/** The columns a search occupies, shared by the insert and the criteria patch. */
function toCriteriaColumns(criteria: SavedSearchCriteria) {
  return {
    query: criteria.query.trim(),
    category: criteria.category,
    budget_min: criteria.filters.budget?.min ?? null,
    budget_max: criteria.filters.budget?.max ?? null,
    types: criteria.filters.types,
    bedrooms: criteria.filters.bedrooms,
    facilities: criteria.filters.facilities,
  };
}

/** The caller's saved searches, newest first. RLS scopes the rows to them. */
export async function loadSavedSearches(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ searches: SavedSearch[]; error: string | null }> {
  const { data, error } = await client
    .from("saved_searches")
    .select(SAVED_SEARCH_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { searches: [], error: mapSavedSearchesError(error) };
  }
  return { searches: (data ?? []) as SavedSearch[], error: null };
}

export async function createSavedSearch(
  client: TypedSupabaseClient,
  {
    userId,
    name,
    criteria,
    notify,
  }: {
    userId: string;
    name: string;
    criteria: SavedSearchCriteria;
    notify: boolean;
  },
): Promise<{ search: SavedSearch | null; error: string | null }> {
  const normalized = normalizeSavedSearchName(name);
  if (!normalized) {
    return { search: null, error: "Give this search a name first." };
  }

  const { data, error } = await client
    .from("saved_searches")
    .insert({
      user_id: userId,
      name: normalized,
      ...toCriteriaColumns(criteria),
      notify,
    })
    .select(SAVED_SEARCH_COLUMNS)
    .single();

  if (error) {
    return { search: null, error: mapSavedSearchesError(error) };
  }
  return { search: data as SavedSearch, error: null };
}

/**
 * Renames a search, flips its alert switch, or replaces the criteria it holds.
 * RLS means a row belonging to someone else simply does not resolve, which is
 * reported as a missing search rather than as an error.
 */
export async function updateSavedSearch(
  client: TypedSupabaseClient,
  {
    searchId,
    name,
    criteria,
    notify,
  }: {
    searchId: string;
    name?: string;
    criteria?: SavedSearchCriteria;
    notify?: boolean;
  },
): Promise<{ search: SavedSearch | null; error: string | null }> {
  const patch: SavedSearchUpdate = {};
  if (name !== undefined) {
    const normalized = normalizeSavedSearchName(name);
    if (!normalized) {
      return { search: null, error: "Give this search a name first." };
    }
    patch.name = normalized;
  }
  if (criteria) Object.assign(patch, toCriteriaColumns(criteria));
  if (notify !== undefined) patch.notify = notify;

  if (Object.keys(patch).length === 0) {
    return { search: null, error: "Nothing to change." };
  }

  const { data, error } = await client
    .from("saved_searches")
    .update(patch)
    .eq("id", searchId)
    .select(SAVED_SEARCH_COLUMNS)
    .maybeSingle();

  if (error) {
    return { search: null, error: mapSavedSearchesError(error) };
  }
  if (!data) {
    return { search: null, error: "That saved search no longer exists." };
  }
  return { search: data as SavedSearch, error: null };
}

export async function deleteSavedSearch(
  client: TypedSupabaseClient,
  searchId: string,
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("saved_searches")
    .delete()
    .eq("id", searchId);

  return { error: error ? mapSavedSearchesError(error) : null };
}
