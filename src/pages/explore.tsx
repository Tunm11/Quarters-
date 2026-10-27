import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpWideNarrow,
  BedDouble,
  BellRing,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorOpen,
  House,
  LayoutList,
  ListChecks,
  MapPin,
  MapPinned,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRoundSearch,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { NearCampusView } from "@/components/listings/near-campus-view";
import { SaveSearchSheet } from "@/components/listings/save-search-sheet";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonClasses } from "@/components/ui/button";
import { FacilityIconChip } from "@/components/ui/facility-icon";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconButton } from "@/components/ui/icon-button";
import { Photo } from "@/components/ui/photo";
import { Skeleton } from "@/components/ui/skeleton";
import { buildListingFilterOptions } from "@/listings/listing-filters";
import {
  buildCampusOptions,
  defaultListingSort,
  groupListingsByCampus,
  listingSortLabel,
  listingSortOptions,
  sortPublicListings,
  type ListingSortId,
} from "@/listings/listing-sort";
import {
  hasSearchCriteria,
  savedSearchCriteriaFromParams,
  savedSearchParams,
  type SavedSearchCriteria,
} from "@/listings/saved-searches";
import { useSavedListingIds } from "@/listings/use-saved-listings";
import { useSavedSearches } from "@/listings/use-saved-searches";
import {
  countActiveListingFilters,
  emptyListingFilters,
  filterPublicListings,
  formatListingLocation,
  formatListingRent,
  type ListingFilters,
  type PublicListing,
} from "@/listings/public-listings";
import { PublicListingCard } from "@/listings/public-listing-card";
import { usePublicListings } from "@/listings/use-public-listings";
import { cn } from "@/lib/cn";

type CategoryId = "all" | "private" | "shared" | "hostel";

type Category = {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
};

const categories: Category[] = [
  { id: "all", label: "All", icon: House },
  { id: "private", label: "Private", icon: DoorOpen },
  { id: "shared", label: "Shared", icon: Users },
  { id: "hostel", label: "Hostel", icon: Building2 },
];

type FilterGroupId = "budget" | "types" | "bedrooms" | "facilities";

type FilterGroup = {
  id: FilterGroupId;
  label: string;
  icon: LucideIcon;
};

const filterGroups: FilterGroup[] = [
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "types", label: "Property type", icon: Building2 },
  { id: "bedrooms", label: "Bedrooms", icon: BedDouble },
  { id: "facilities", label: "Facilities", icon: ListChecks },
];

/** Icon per sort, so the control shows the order the list is in. */
const sortIcons: Record<ListingSortId, LucideIcon> = {
  newest: Clock,
  "price-asc": ArrowDownWideNarrow,
  "price-desc": ArrowUpWideNarrow,
  closest: MapPin,
};

type ResultsView = "list" | "near";

const resultsViews: { id: ResultsView; label: string; icon: LucideIcon }[] = [
  { id: "list", label: "List", icon: LayoutList },
  { id: "near", label: "Near campus", icon: MapPinned },
];

/** How many rooms take turns in the featured panel, and for how long. */
const FEATURED_LIMIT = 4;
const FEATURED_INTERVAL_MS = 6500;

/**
 * The fallback photograph for an area tile: the cover of the newest published
 * room in that neighbourhood, used when the area has no bundled location photo
 * (for example a neighbourhood added later). Areas with neither keep their
 * gradient.
 */
function areaPhoto(
  areaName: string,
  listings: PublicListing[],
): string | null {
  const target = areaName.trim().toLowerCase();
  const match = listings.find(
    (listing) => (listing.neighbourhood ?? "").trim().toLowerCase() === target,
  );
  return match?.cover_image_url ?? null;
}

/**
 * The shortcuts on Explore. Each carries a bundled photograph of the
 * neighbourhood itself, so the tile reads as the place it opens rather than as
 * whichever room happens to be listed there. Credits live in
 * `public/areas/CREDITS.md`.
 */
const popularAreas = [
  {
    name: "Akoka",
    detail: "Lagos",
    photo: "/areas/akoka.jpg",
    gradient: "linear-gradient(155deg, #c9b99a 0%, #6d6047 100%)",
  },
  {
    name: "Yaba",
    detail: "Lagos",
    photo: "/areas/yaba.jpg",
    gradient: "linear-gradient(155deg, #b7b39c 0%, #5b5d3b 100%)",
  },
  {
    name: "Surulere",
    detail: "Lagos",
    photo: "/areas/surulere.jpg",
    gradient: "linear-gradient(155deg, #d6c7ac 0%, #8a6e4e 100%)",
  },
  {
    name: "Ikeja",
    detail: "Lagos",
    photo: "/areas/ikeja.jpg",
    gradient: "linear-gradient(155deg, #b9bc9a 0%, #4e5330 100%)",
  },
];

export default function ExplorePage() {
  // A search can arrive in the URL: that is how a saved search is reopened, and
  // how a filtered Explore screen is linked to someone else. It is read once, on
  // load, and then owned by the screen.
  const [searchParams] = useSearchParams();
  const [initialSearch] = useState(() => savedSearchCriteriaFromParams(searchParams));
  const [query, setQuery] = useState(initialSearch.query);
  const [category, setCategory] = useState<CategoryId>(initialSearch.category);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ListingFilters>(initialSearch.filters);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [savedSearchNotice, setSavedSearchNotice] = useState<string | null>(null);
  const [openFilterId, setOpenFilterId] = useState<FilterGroupId | null>(null);
  const [sort, setSort] = useState<ListingSortId>(defaultListingSort);
  const [campus, setCampus] = useState<string | null>(null);
  const [view, setView] = useState<ResultsView>("list");
  const [sortOpen, setSortOpen] = useState(false);
  const {
    listings,
    status,
    error,
    reload,
    loadMore,
    loadingMore,
    moreError,
    hasMore,
    total,
  } = usePublicListings();
  const { status: authStatus, user } = useAuth();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { idSet: savedIds, toggle: toggleSaved } = useSavedListingIds({
    userId: user?.id ?? null,
  });
  // Explore only writes saved searches; the list lives on Saved.
  const { create: createSavedSearch } = useSavedSearches({
    userId: user?.id ?? null,
    load: false,
  });

  // A signed-out visitor is sent to sign in and returned to Explore, rather
  // than being shown a bookmark that silently does nothing.
  function handleToggleSave(listingId: string) {
    if (authStatus !== "signedIn" || !user) {
      navigate(
        `/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`,
      );
      return;
    }
    void toggleSaved(listingId);
  }

  /**
   * Saving a search stores it against an account, because that is what lets the
   * alert reach every device. A signed-out visitor is sent to sign in and
   * returned to this exact search: the criteria travel in the URL.
   */
  function handleSaveSearch() {
    if (authStatus !== "signedIn" || !user) {
      const returnTo = `/explore?${savedSearchParams(currentCriteria).toString()}`;
      navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setSavedSearchNotice(null);
    setSaveSearchOpen(true);
  }

  const searchId = useId();
  const trimmedQuery = query.trim();
  // Options come from the published rooms themselves, so every choice the sheet
  // offers matches at least one listing.
  const filterOptions = useMemo(
    () => buildListingFilterOptions(listings),
    [listings],
  );
  const activeFilterCount = countActiveListingFilters(filters);
  const visibleListings = useMemo(
    () => filterPublicListings(listings, { query, category, filters }),
    [listings, query, category, filters],
  );
  // The search exactly as a saved-search row stores it: the query box, the
  // room-type shortcut and the filter sheet choices.
  const currentCriteria: SavedSearchCriteria = useMemo(
    () => ({ query, category, filters }),
    [query, category, filters],
  );
  const canSaveSearch = hasSearchCriteria(currentCriteria);
  // Sorting and the near-campus grouping run over the rows already loaded, so
  // changing the order never costs another Supabase round-trip.
  const orderedListings = useMemo(
    () => sortPublicListings(visibleListings, { sort, campus }),
    [visibleListings, sort, campus],
  );
  const campusOptions = useMemo(() => buildCampusOptions(listings), [listings]);
  // The catalogue arrives one page at a time, so the screen keeps asking for
  // the next page while the sentinel below the results is in view. The button
  // in the same footer is the keyboard-and-no-observer way to do the same.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const campusGroups = useMemo(
    () => groupListingsByCampus(orderedListings, { campus }),
    [orderedListings, campus],
  );
  // The featured panel rotates through the newest few matches on its own, so
  // several rooms get the spotlight without a manual carousel.
  const featuredPool = orderedListings.slice(0, FEATURED_LIMIT);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredPaused, setFeaturedPaused] = useState(false);
  const activeFeaturedIndex =
    featuredPool.length > 0 ? Math.min(featuredIndex, featuredPool.length - 1) : 0;
  const featured = featuredPool[activeFeaturedIndex] ?? null;
  const featuredRent = featured ? formatListingRent(featured) : null;
  const featuredLocation = featured ? formatListingLocation(featured) : "";
  const resultCountLabel = `${visibleListings.length} ${
    visibleListings.length === 1 ? "room" : "rooms"
  }`;
  const selectedCategory =
    categories.find((item) => item.id === category) ?? categories[0];
  const activeFilter =
    filterGroups.find((group) => group.id === openFilterId) ?? null;
  const ActiveFilterIcon = activeFilter?.icon;
  const SortIcon = sortIcons[sort];
  const sortLabel = listingSortLabel(sort);

  const emptyTitle = trimmedQuery
    ? `No rooms match “${trimmedQuery}” yet.`
    : activeFilterCount > 0
      ? "No rooms match these filters."
      : category === "all"
        ? "No rooms are published yet."
        : `No ${selectedCategory.label.toLowerCase()} rooms are published yet.`;

  const emptyDescription = trimmedQuery
    ? "No published room matches that search yet. Real rooms will appear here as approved providers publish them."
    : activeFilterCount > 0
      ? "Try a wider budget, another room type, or clear a filter to see the rest of the catalogue."
      : category === "all"
        ? "Approved providers are the only accounts that can publish. The first real room will appear here with its rent, location and photos."
        : `${selectedCategory.label} rooms will appear here once an approved provider publishes one. Nothing is invented while the catalogue is empty.`;
  // Search and filters run over the rooms already loaded, so an empty result is
  // only ever "nothing here yet", never "nothing in the catalogue" while pages
  // are still waiting to be read.
  const emptyDescriptionWithPages = hasMore
    ? `${emptyDescription} Only the ${listings.length} rooms loaded so far could be searched.`
    : emptyDescription;

  // A new search, filter or order starts the rotation from the top match again.
  useEffect(() => {
    setFeaturedIndex(0);
  }, [query, category, filters, sort, campus]);

  // Reading the next page as the reader reaches the end of the list. The effect
  // re-runs after every page, which both drops the observer once the catalogue
  // is exhausted and re-observes a sentinel that is still on screen. A failed
  // page turns auto-loading off until the reader asks again, so a broken request
  // is never retried in a loop.
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || status !== "ready" || !hasMore || moreError) return;
    // Without IntersectionObserver the footer's Load more button still works.
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, status, moreError, listings.length, loadMore]);

  useEffect(() => {
    if (featuredPaused || featuredPool.length < 2) return;

    const timer = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredPool.length);
    }, FEATURED_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [featuredPaused, featuredPool.length]);

  function openFilterGroup(id: FilterGroupId) {
    setFiltersOpen(false);
    setOpenFilterId(id);
  }

  function chooseBudget(option: (typeof filterOptions.budget)[number]) {
    setFilters((current) => ({
      ...current,
      budget: current.budget?.min === option.band.min ? null : option.band,
    }));
  }

  function toggleType(id: (typeof filterOptions.types)[number]["id"]) {
    setFilters((current) => ({
      ...current,
      types: current.types.includes(id)
        ? current.types.filter((value) => value !== id)
        : [...current.types, id],
    }));
  }

  function toggleBedrooms(value: number) {
    setFilters((current) => ({
      ...current,
      bedrooms: current.bedrooms.includes(value)
        ? current.bedrooms.filter((entry) => entry !== value)
        : [...current.bedrooms, value],
    }));
  }

  function toggleFacility(facility: string) {
    setFilters((current) => ({
      ...current,
      facilities: current.facilities.includes(facility)
        ? current.facilities.filter((entry) => entry !== facility)
        : [...current.facilities, facility],
    }));
  }

  function clearGroup(id: FilterGroupId) {
    setFilters((current) => ({
      ...current,
      ...(id === "budget" ? { budget: null } : {}),
      ...(id === "types" ? { types: [] } : {}),
      ...(id === "bedrooms" ? { bedrooms: [] } : {}),
      ...(id === "facilities" ? { facilities: [] } : {}),
    }));
  }

  function clearAllFilters() {
    setFilters(emptyListingFilters);
  }

  /** "All", "1 selected" or "2 selected" — the subtitle of a filter row. */
  function filterGroupSummary(id: FilterGroupId): string {
    const count =
      id === "budget"
        ? filters.budget
          ? 1
          : 0
        : id === "types"
          ? filters.types.length
          : id === "bedrooms"
            ? filters.bedrooms.length
            : filters.facilities.length;
    return count === 0 ? "All" : `${count} selected`;
  }

  function chooseArea(area: string) {
    setQuery(area);
    const results = document.getElementById("results");
    if (typeof results?.scrollIntoView === "function") {
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      {/* Greeting */}
      <header className="flex items-center justify-between gap-4">
        <h1
          id="explore-heading"
          className="min-w-0 text-xl leading-tight font-semibold tracking-tight text-balance sm:text-2xl"
        >
          Find your perfect place
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/roommates"
            aria-label="Find a roommate"
            title="Find a roommate"
            className="grid size-12 place-items-center rounded-full border border-line bg-panel text-foreground shadow-panel transition-colors hover:bg-panel-raised"
          >
            <UserRoundSearch className="size-5" aria-hidden="true" />
          </Link>
          <Link
            to="/saved"
            aria-label="Saved rooms"
            className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-panel text-foreground shadow-panel transition-colors hover:bg-panel-raised"
          >
            <Bookmark className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search accommodation
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id={searchId}
          type="text"
          placeholder="Search campus, area or room type"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          className="h-14 w-full rounded-[1.35rem] border border-line bg-panel pr-28 pl-12 text-sm text-foreground shadow-panel transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {query.length > 0 && (
            <IconButton label="Clear search" onClick={() => setQuery("")}>
              <X className="size-4" />
            </IconButton>
          )}
          <span className="h-6 w-px bg-line" aria-hidden="true" />
          <IconButton
            label={
              activeFilterCount > 0
                ? `Open filters (${activeFilterCount} active)`
                : "Open filters"
            }
            onClick={() => setFiltersOpen(true)}
            className="relative text-foreground"
          >
            <SlidersHorizontal className="size-5" />
            {activeFilterCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-pill bg-accent px-1 text-[9px] leading-[18px] font-semibold text-accent-ink"
              >
                {activeFilterCount}
              </span>
            )}
          </IconButton>
        </div>
      </div>

      {/* Saving the search itself, with the alert switch, lives in the sheet.
          The control appears as soon as the search narrows anything, so a
          search that matches nothing yet can still be saved and watched. */}
      {canSaveSearch && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSearch}
            className="inline-flex h-11 items-center gap-2 rounded-pill border border-line bg-panel px-4 text-xs font-medium text-foreground transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
          >
            <BellRing className="size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            Save this search
          </button>
          <Link
            to="/saved?tab=searches"
            className="text-xs font-medium text-subtle transition-colors hover:text-foreground"
          >
            Saved searches
          </Link>
        </div>
      )}

      {savedSearchNotice && (
        <InlineAlert tone="positive">
          {savedSearchNotice}{" "}
          <Link
            to="/saved?tab=searches"
            className="font-medium underline underline-offset-2"
          >
            See your searches
          </Link>
        </InlineAlert>
      )}

      {/* Featured room */}
      <section aria-labelledby="featured-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="featured-heading" className="text-lg font-semibold">
            Rooms near campus
          </h2>
        </div>

        {status === "loading" ? (
          <Skeleton className="aspect-[16/10] rounded-[2rem]" />
        ) : featured ? (
          <>
          <article
            key={featured.id}
            className="featured-enter relative overflow-hidden rounded-[2rem] border border-line bg-panel shadow-float"
            onMouseEnter={() => setFeaturedPaused(true)}
            onMouseLeave={() => setFeaturedPaused(false)}
            onFocusCapture={() => setFeaturedPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setFeaturedPaused(false);
              }
            }}
          >
            <div className="relative">
              {featured.cover_image_url ? (
                <Photo
                  src={featured.cover_image_url}
                  eager
                  className="aspect-[16/10] w-full object-cover"
                />
              ) : (
                <div className="grid aspect-[16/10] w-full place-items-center bg-sand-wash text-subtle">
                  <House
                    aria-hidden="true"
                    strokeWidth={1.25}
                    className="size-10"
                  />
                </div>
              )}
              <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center rounded-pill border border-white/25 bg-[#1f2110]/60 px-2.5 py-1 text-[10px] font-medium tracking-wide text-[#f6f3e8] backdrop-blur-sm">
                  Featured
                </span>
                {featuredRent && (
                  <span className="rounded-pill bg-[#f6f3e8] px-2.5 py-1 text-[11px] font-semibold text-[#33361d]">
                    {featuredRent}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4">
              {featuredLocation && (
                <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.16em] text-subtle uppercase">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  {featuredLocation}
                </p>
              )}
              <h3 className="text-base leading-snug font-semibold text-balance text-foreground">
                <Link
                  to={`/property/${featured.id}`}
                  className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent-soft"
                >
                  {featured.title}
                </Link>
              </h3>
              {featured.description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                  {featured.description}
                </p>
              )}
              {featured.facilities.length > 0 && (
                <ul
                  aria-label="Amenities"
                  className="mt-1 flex flex-wrap items-center gap-1.5"
                >
                  {featured.facilities.slice(0, 4).map((facility) => (
                    <li key={facility}>
                      <FacilityIconChip facility={facility} />
                    </li>
                  ))}
                  {featured.facilities.length > 4 && (
                    <li className="text-[11px] font-medium text-subtle">
                      +{featured.facilities.length - 4}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </article>

          {featuredPool.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Featured rooms"
                className="flex items-center gap-0.5"
              >
                {featuredPool.map((listing, index) => {
                  const active = index === activeFeaturedIndex;
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      aria-label={`Show ${listing.title}`}
                      aria-pressed={active}
                      onClick={() => setFeaturedIndex(index)}
                      className="grid size-6 place-items-center rounded-pill"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-1.5 rounded-pill transition-all duration-300",
                          active ? "w-5 bg-accent" : "w-1.5 bg-line-strong",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setFeaturedPaused((current) => !current)}
                className="text-[11px] font-medium text-subtle transition-colors hover:text-foreground"
              >
                {featuredPaused ? "Play rotation" : "Pause rotation"}
              </button>
            </div>
          )}
          </>
        ) : status === "ready" ? (
          <div className="rounded-card border border-line bg-panel p-6 text-center shadow-panel sm:p-8">
            <p className="text-sm font-medium">No rooms to feature yet.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              Featured rooms come from approved providers. As soon as one
              publishes, the newest room appears here.
            </p>
          </div>
        ) : null}
      </section>

      {/* Room types */}
      <div role="group" aria-label="Room types" className="grid grid-cols-4 gap-2">
        {categories.map((item) => {
          const Icon = item.icon;
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`${item.label} rooms`}
              aria-pressed={active}
              onClick={() => setCategory(item.id)}
              className={cn(
                "flex min-h-[4.6rem] flex-col items-center justify-center gap-2 rounded-[1.25rem] border px-1 py-3 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft",
                active
                  ? "border-accent bg-accent text-accent-ink shadow-accent"
                  : "border-line bg-panel text-muted hover:border-line-strong hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Popular areas */}
      <section aria-labelledby="areas-heading" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
              Explore
            </p>
            <h2 id="areas-heading" className="mt-1 text-lg font-semibold">
              Popular areas
            </h2>
          </div>
          <span className="text-xs text-subtle">Tap to search</span>
        </div>

        <div
          role="group"
          aria-label="Popular areas"
          className="-mx-5 flex min-w-0 gap-3 overflow-x-auto px-5 pb-1 overscroll-x-contain [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {popularAreas.map((area) => {
            const photo = area.photo ?? areaPhoto(area.name, listings);
            return (
              <button
                key={area.name}
                type="button"
                aria-label={`Search rooms in ${area.name}`}
                onClick={() => chooseArea(area.name)}
                className="group relative h-32 w-28 shrink-0 overflow-hidden rounded-[1.35rem] text-left shadow-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                style={{ backgroundImage: area.gradient }}
              >
                {photo && (
                  <Photo
                    src={photo}
                    className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 bg-gradient-to-t",
                    photo
                      ? "from-black/75 via-black/25 to-black/5"
                      : "from-black/60 via-black/10 to-transparent",
                  )}
                />
                <MapPin
                  aria-hidden="true"
                  className="absolute top-3 right-3 size-4 text-white/80"
                />
                <span className="absolute inset-x-3 bottom-3 flex flex-col text-white">
                  <span className="text-sm font-semibold">{area.name}</span>
                  <span className="text-[10px] text-white/75">{area.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Results */}
      <section
        id="results"
        aria-labelledby="results-heading"
        className="flex scroll-mt-24 flex-col gap-3"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
              Available now
            </p>
            <h2 id="results-heading" className="mt-1 text-lg font-semibold">
              Rooms near you
            </h2>
          </div>
          <Badge tone="outline">{resultCountLabel}</Badge>
        </div>

        {status === "ready" && listings.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSortOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-pill border border-line bg-panel px-3.5 text-xs font-medium text-foreground transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
            >
              <SortIcon
                className="size-4 shrink-0 text-accent-soft"
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">{sortLabel}</span>
              <ChevronDown
                className="size-3.5 shrink-0 text-subtle"
                aria-hidden="true"
              />
            </button>

            <div
              role="group"
              aria-label="Results view"
              className="inline-flex items-center rounded-pill border border-line bg-panel p-1"
            >
              {resultsViews.map((option) => {
                const Icon = option.icon;
                const active = view === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setView(option.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft",
                      active
                        ? "bg-accent text-accent-ink shadow-accent"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {campus && <Badge tone="accent">{`Near ${campus}`}</Badge>}
          </div>
        )}

        {status === "ready" && sort === "closest" && !campus && (
          <p className="text-[11px] leading-relaxed text-subtle">
            Pick your campus to order by closeness. QUARTERS ranks by the campus
            a room names, so it never invents a distance.
          </p>
        )}

        {status === "loading" ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm text-muted">
              Loading published rooms…
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-card border border-line bg-panel"
                >
                  <Skeleton className="aspect-[4/3] rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col gap-3">
            <InlineAlert>{error}</InlineAlert>
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => void reload()}
              icon={<RefreshCw className="size-4" />}
            >
              Try again
            </Button>
          </div>
        ) : orderedListings.length > 0 ? (
          view === "near" ? (
            <NearCampusView
              groups={campusGroups}
              campus={campus}
              onFocusCampus={chooseArea}
            />
          ) : (
            <ul className="grid list-none gap-4 sm:grid-cols-2">
              {orderedListings.map((listing) => (
                <li key={listing.id} className="flex">
                  <PublicListingCard
                    listing={listing}
                    saved={savedIds.has(listing.id)}
                    onToggleSave={handleToggleSave}
                  />
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="rounded-card border border-line bg-panel p-6 shadow-panel sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full border border-line bg-canvas-soft text-accent-soft"
              >
                <Search className="size-5" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold text-balance">
                  {emptyTitle}
                </h3>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
                  {emptyDescriptionWithPages}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  to="/how-it-works"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  How QUARTERS works
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                {trimmedQuery.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                    Reset search
                  </Button>
                )}
                {category !== "all" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCategory("all")}
                  >
                    Show all room types
                  </Button>
                )}
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Catalogue pagination: the rooms already read, the next page, and the
            sentinel the auto-load watches. */}
        {status === "ready" && (hasMore || loadingMore || moreError) && (
          <div className="flex flex-col items-center gap-3">
            {moreError && <InlineAlert className="w-full">{moreError}</InlineAlert>}

            {total > listings.length && (
              <p
                role="status"
                className="text-xs text-muted tabular-nums"
              >
                {`Showing ${listings.length} of ${total} published rooms`}
              </p>
            )}

            {hasMore && (
              <p className="max-w-sm text-center text-[11px] leading-relaxed text-subtle">
                Search, filters and sorting cover the rooms loaded so far.
              </p>
            )}

            <Button
              variant="secondary"
              size="sm"
              loading={loadingMore}
              icon={<Plus className="size-4" />}
              onClick={() => void loadMore()}
            >
              {moreError ? "Try again" : "Load more rooms"}
            </Button>

            <div
              ref={loadMoreRef}
              aria-hidden="true"
              className="h-px w-full"
            />
          </div>
        )}
      </section>

      {/* Filter index */}
      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" onClick={clearAllFilters} className="flex-1">
                Clear all
              </Button>
            )}
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              {`Show ${resultCountLabel}`}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {filterGroups.map((group) => {
            const Icon = group.icon;
            const summary = filterGroupSummary(group.id);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => openFilterGroup(group.id)}
                className="flex items-center gap-3 rounded-tile border border-line bg-panel-raised p-4 text-left transition-colors hover:border-line-strong"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {group.label}
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      summary === "All" ? "text-subtle" : "text-accent-soft",
                    )}
                  >
                    {summary === "All" && status !== "ready"
                      ? "No options yet"
                      : summary}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-subtle"
                  aria-hidden="true"
                />
              </button>
            );
          })}
          <p className="mt-1 text-[11px] leading-relaxed text-subtle">
            Options come from the rooms published right now and loaded so far,
            with how many of them each one matches.
          </p>
        </div>
      </BottomSheet>

      {/* Individual filter detail */}
      {activeFilter && ActiveFilterIcon && (
        <BottomSheet
          key={activeFilter.id}
          open
          onClose={() => setOpenFilterId(null)}
          title={activeFilter.label}
          footer={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => clearGroup(activeFilter.id)}
                className="flex-1"
              >
                Clear
              </Button>
              <Button className="flex-1" onClick={() => setOpenFilterId(null)}>
                Done
              </Button>
            </div>
          }
        >
          {renderFilterOptions(activeFilter.id)}
        </BottomSheet>
      )}

      {/* Sort order and the campus the closest order is measured against */}
      <BottomSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort rooms"
        footer={
          <Button className="w-full" onClick={() => setSortOpen(false)}>
            {`Show ${resultCountLabel}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <div
            role="radiogroup"
            aria-label="Sort rooms"
            className="flex flex-col gap-2"
          >
            {listingSortOptions.map((option) => {
              const Icon = sortIcons[option.id];
              const active = sort === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSort(option.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-tile border p-3.5 text-left transition-colors",
                    active
                      ? "border-accent/45 bg-accent/10"
                      : "border-line bg-panel-raised hover:border-line-strong",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-tile border",
                      active
                        ? "border-accent/40 bg-accent/12 text-accent-soft"
                        : "border-line bg-panel text-muted",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="text-xs text-muted">
                      {option.description}
                    </span>
                  </span>
                  {active && (
                    <Check
                      className="size-4 shrink-0 text-accent-soft"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <section
            aria-labelledby="sort-campus-heading"
            className="flex flex-col gap-2"
          >
            <h3
              id="sort-campus-heading"
              className="text-sm font-semibold text-foreground"
            >
              Your campus
            </h3>
            <p className="text-xs leading-relaxed text-muted">
              Closest orders by the campus a room names — listings do not carry
              coordinates yet, so QUARTERS never guesses a distance.
            </p>
            {campusOptions.length === 0 ? (
              <p className="text-xs leading-relaxed text-subtle">
                No published room names a campus yet.
              </p>
            ) : (
              <div
                role="group"
                aria-label="Your campus"
                className="flex flex-wrap gap-2"
              >
                {campusOptions.map((option) => (
                  <FilterChip
                    key={option.name}
                    label={`${option.name} (${option.count})`}
                    opensSheet={false}
                    active={campus === option.name}
                    onClick={() =>
                      setCampus((current) =>
                        current === option.name ? null : option.name,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </BottomSheet>

      <SaveSearchSheet
        open={saveSearchOpen}
        onClose={() => setSaveSearchOpen(false)}
        criteria={currentCriteria}
        matchCount={status === "ready" ? visibleListings.length : null}
        onCreate={createSavedSearch}
        onSaved={(search) =>
          setSavedSearchNotice(
            search.notify
              ? `“${search.name}” is saved — you will hear when a new room matches it.`
              : `“${search.name}” is saved. Alerts are off for it.`,
          )
        }
      />
    </div>
  );

  /** Body of one filter group: option chips with the number of matching rooms. */
  function renderFilterOptions(id: FilterGroupId) {
    const empty = (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm font-semibold text-foreground">No options yet</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Options appear here as soon as approved providers publish rooms with
          these details.
        </p>
      </div>
    );

    if (id === "budget") {
      if (filterOptions.budget.length === 0) return empty;
      return (
        <div role="group" aria-label="Budget" className="flex flex-wrap gap-2">
          {filterOptions.budget.map((option) => (
            <FilterOptionChip
              key={option.id}
              label={option.label}
              count={option.count}
              active={filters.budget?.min === option.band.min}
              onClick={() => chooseBudget(option)}
            />
          ))}
        </div>
      );
    }

    if (id === "types") {
      if (filterOptions.types.length === 0) return empty;
      return (
        <div role="group" aria-label="Property type" className="flex flex-wrap gap-2">
          {filterOptions.types.map((option) => (
            <FilterOptionChip
              key={option.id}
              label={option.label}
              count={option.count}
              active={filters.types.includes(option.id)}
              onClick={() => toggleType(option.id)}
            />
          ))}
        </div>
      );
    }

    if (id === "bedrooms") {
      if (filterOptions.bedrooms.length === 0) return empty;
      return (
        <div role="group" aria-label="Bedrooms" className="flex flex-wrap gap-2">
          {filterOptions.bedrooms.map((option) => (
            <FilterOptionChip
              key={option.id}
              label={option.label}
              count={option.count}
              active={filters.bedrooms.includes(option.value)}
              onClick={() => toggleBedrooms(option.value)}
            />
          ))}
        </div>
      );
    }

    if (filterOptions.facilities.length === 0) return empty;
    return (
      <div role="group" aria-label="Facilities" className="flex flex-wrap gap-2">
        {filterOptions.facilities.map((option) => (
          <FilterOptionChip
            key={option.id}
            label={option.label}
            count={option.count}
            active={filters.facilities.includes(option.id)}
            onClick={() => toggleFacility(option.id)}
          />
        ))}
      </div>
    );
  }
}

/** One choice inside a filter group, e.g. "Wi-Fi · 3". */
function FilterOptionChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent text-accent-ink shadow-accent"
          : "border-line bg-panel text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "text-[10px] tabular-nums",
          active ? "text-accent-ink/70" : "text-subtle",
        )}
      >
        {count}
      </span>
    </button>
  );
}
