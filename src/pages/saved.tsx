import {
  BellRing,
  Bookmark,
  Check,
  Compass,
  FolderOpen,
  GitCompare,
  RefreshCw,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { OfflineCopyNotice } from "@/components/feedback/offline-banner";
import { SavedSearchList } from "@/components/listings/saved-search-list";
import { ShareShortlistSheet } from "@/components/listings/share-shortlist-sheet";
import { ShortlistCollectionsSheet } from "@/components/listings/shortlist-collections-sheet";
import { ShortlistCompareSheet } from "@/components/listings/shortlist-compare-sheet";
import { Button, buttonClasses } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { MAX_COMPARE, MIN_COMPARE, toggleCompared } from "@/listings/compare-listings";
import { PublicListingCard } from "@/listings/public-listing-card";
import {
  useSavedCollections,
  useSavedRooms,
} from "@/listings/use-saved-listings";
import { useSavedSearches } from "@/listings/use-saved-searches";

/** Which slice of the shortlist the tab is showing. */
type ShortlistFilter = "all" | "none" | string;

/** The two things the Saved screen holds: rooms, and the searches watching. */
type SavedView = "rooms" | "searches";

/**
 * The shortlist: every room the viewer bookmarked, newest first, filed into
 * collections, comparable side by side, and sendable to a connected roommate.
 * The bookmark on each card removes a room, and the control under each card
 * files it into a collection.
 *
 * The route is behind RequireAuth, so `user` is present whenever it renders; the
 * null guard only covers the instant before the profile resolves.
 */
export default function SavedPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const {
    listings,
    collectionByListing,
    status,
    error,
    offlineSavedAt,
    remove,
    move,
    reload,
  } = useSavedRooms({ userId });
  const {
    collections,
    status: collectionsStatus,
    error: collectionsError,
    create: createCollection,
    rename: renameCollection,
    remove: removeCollection,
  } = useSavedCollections({ userId });
  const {
    searches,
    status: searchesStatus,
    error: searchesError,
    busyId: searchesBusyId,
    reload: reloadSearches,
    rename: renameSearch,
    setNotify: setSearchNotify,
    remove: removeSearch,
  } = useSavedSearches({ userId });

  // The view lives in the URL so a saved search's "View results" link can come
  // back here, and so the searches list can be linked to directly.
  const [params, setParams] = useSearchParams();
  const view: SavedView = params.get("tab") === "searches" ? "searches" : "rooms";

  const [activeCollection, setActiveCollection] = useState<ShortlistFilter>("all");
  const [compareMode, setCompareMode] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const loading = status === "loading";

  const counts = useMemo(() => {
    const byCollection = new Map<string, number>();
    let unsorted = 0;
    for (const listing of listings) {
      const collectionId = collectionByListing.get(listing.id) ?? null;
      if (collectionId) {
        byCollection.set(collectionId, (byCollection.get(collectionId) ?? 0) + 1);
      } else {
        unsorted += 1;
      }
    }
    return { byCollection, unsorted };
  }, [collectionByListing, listings]);

  const visibleListings = useMemo(() => {
    if (activeCollection === "all") return listings;
    if (activeCollection === "none") {
      return listings.filter(
        (listing) => (collectionByListing.get(listing.id) ?? null) === null,
      );
    }
    return listings.filter(
      (listing) => collectionByListing.get(listing.id) === activeCollection,
    );
  }, [activeCollection, collectionByListing, listings]);

  // A collection deleted while it was open falls back to the whole shortlist.
  useEffect(() => {
    if (activeCollection === "all" || activeCollection === "none") return;
    if (collections.some((collection) => collection.id === activeCollection)) return;
    setActiveCollection("all");
  }, [activeCollection, collections]);

  const comparedListings = useMemo(
    () => visibleListings.filter((listing) => compared.includes(listing.id)),
    [compared, visibleListings],
  );

  const activeCollectionName =
    collections.find((collection) => collection.id === activeCollection)?.name ??
    null;

  function toggleCompareMode() {
    setCompareMode((current) => !current);
    setCompared([]);
  }

  function showView(next: SavedView) {
    setParams(
      (current) => {
        const nextParams = new URLSearchParams(current);
        if (next === "searches") nextParams.set("tab", "searches");
        else nextParams.delete("tab");
        return nextParams;
      },
      { replace: true },
    );
  }

  const views: { id: SavedView; label: string; icon: typeof Bookmark }[] = [
    { id: "rooms", label: "Saved rooms", icon: Bookmark },
    { id: "searches", label: "Saved searches", icon: BellRing },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <SectionHeading
        id="saved-heading"
        eyebrow={view === "searches" ? "Your alerts" : "Your shortlist"}
        title={view === "searches" ? "Saved searches" : "Saved rooms"}
        level={1}
        description={
          view === "searches"
            ? searches.length > 0
              ? `${searches.length} ${
                  searches.length === 1 ? "search" : "searches"
                } kept. Turn alerts on for the ones you want to hear about.`
              : "Searches you save on Explore collect here, each with its own new-room alert."
            : listings.length > 0
              ? `${listings.length} ${
                  listings.length === 1 ? "room" : "rooms"
                } kept for quick comparison.`
              : "Rooms you save collect here for quick comparison."
        }
        action={
          view === "rooms" && listings.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={compareMode ? "soft" : "secondary"}
                aria-pressed={compareMode}
                onClick={toggleCompareMode}
                icon={<GitCompare className="size-4" />}
              >
                {compareMode ? "Done comparing" : "Compare"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShareOpen(true)}
                icon={<Share2 className="size-4" />}
              >
                Share shortlist
              </Button>
            </div>
          ) : null
        }
      />

      {view === "rooms" && offlineSavedAt && (
        <OfflineCopyNotice savedAt={offlineSavedAt} />
      )}

      <div
        role="group"
        aria-label="What to show"
        className="inline-flex w-fit items-center rounded-pill border border-line bg-panel p-1"
      >
        {views.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const count = item.id === "rooms" ? listings.length : searches.length;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => showView(item.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft",
                active
                  ? "bg-accent text-accent-ink shadow-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {item.label}
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
        })}
      </div>

      {view === "searches" ? (
        <SavedSearchList
          searches={searches}
          status={searchesStatus}
          error={searchesError}
          busyId={searchesBusyId}
          onSetNotify={setSearchNotify}
          onRename={renameSearch}
          onRemove={removeSearch}
          onReload={() => void reloadSearches()}
        />
      ) : (
        <>
      {listings.length > 0 && (
        <div
          role="group"
          aria-label="Filter your shortlist by collection"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <FilterChip
            label={`All rooms (${listings.length})`}
            opensSheet={false}
            active={activeCollection === "all"}
            onClick={() => setActiveCollection("all")}
          />
          {collections.map((collection) => (
            <FilterChip
              key={collection.id}
              label={`${collection.name} (${counts.byCollection.get(collection.id) ?? 0})`}
              opensSheet={false}
              active={activeCollection === collection.id}
              onClick={() => setActiveCollection(collection.id)}
            />
          ))}
          {counts.unsorted > 0 && (
            <FilterChip
              label={`Unsorted (${counts.unsorted})`}
              opensSheet={false}
              active={activeCollection === "none"}
              onClick={() => setActiveCollection("none")}
            />
          )}
          <FilterChip
            label={collections.length === 0 ? "New collection" : "Collections"}
            icon={SlidersHorizontal}
            active={false}
            onClick={() => setCollectionsOpen(true)}
          />
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted">
            Loading your saved rooms…
          </p>
          <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <li
                key={key}
                className="overflow-hidden rounded-card border border-line bg-panel"
              >
                <Skeleton className="aspect-[4/3] rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === "error" && (
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
      )}

      {collectionsError && <InlineAlert>{collectionsError}</InlineAlert>}

      {status === "ready" && listings.length === 0 && (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          description="Tap the bookmark on any room while you browse and it lands here, ready to compare side by side."
          action={
            <Link to="/explore" className={buttonClasses({ size: "sm" })}>
              <Compass className="size-4" aria-hidden="true" />
              Explore rooms
            </Link>
          }
        />
      )}

      {status === "ready" &&
        listings.length > 0 &&
        visibleListings.length === 0 &&
        !compareMode && (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-panel p-5 shadow-panel">
            <p className="text-sm font-semibold text-foreground">
              Nothing filed here yet
            </p>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              {activeCollectionName
                ? `No saved room sits in ${activeCollectionName}. Use the collection control under a room to file it here.`
                : "Every saved room is already in a collection."}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveCollection("all")}
            >
              Show all rooms
            </Button>
          </div>
        )}

      {compareMode && visibleListings.length > 0 && (
        <section aria-labelledby="compare-pick-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="compare-pick-heading"
              className="text-sm font-semibold text-foreground"
            >
              Pick up to {MAX_COMPARE} rooms to compare
            </h2>
            <p className="text-[11px] text-subtle">
              {compared.length < MIN_COMPARE
                ? `Choose at least ${MIN_COMPARE}.`
                : `${compared.length} selected.`}
            </p>
          </div>

          <ul className="flex list-none flex-col gap-2">
            {visibleListings.map((listing) => {
              const selected = compared.includes(listing.id);
              return (
                <li key={listing.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCompared((current) => toggleCompared(current, listing.id))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-tile border p-2.5 text-left transition-colors",
                      selected
                        ? "border-accent/50 bg-accent/12"
                        : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    {listing.cover_image_url ? (
                      <img
                        src={listing.cover_image_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-12 shrink-0 rounded-[0.6rem] object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-12 shrink-0 rounded-[0.6rem] bg-sand-wash"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {listing.title}
                      </span>
                      <span className="truncate text-[11px] text-subtle">
                        {[listing.neighbourhood, listing.city]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-pill border transition-colors",
                        selected
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line-strong text-transparent",
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Button
            className="w-fit"
            disabled={compared.length < MIN_COMPARE}
            onClick={() => setCompareOpen(true)}
            icon={<GitCompare className="size-4" />}
          >
            Compare {compared.length > 0 ? compared.length : ""} rooms
          </Button>
        </section>
      )}

      {!compareMode && visibleListings.length > 0 && (
        <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleListings.map((listing) => {
            const collectionId = collectionByListing.get(listing.id) ?? null;
            return (
              <li key={listing.id} className="flex flex-col gap-2">
                <PublicListingCard
                  listing={listing}
                  saved
                  onToggleSave={() => void remove(listing.id)}
                />
                {collections.length > 0 && (
                  <div className="flex items-center gap-2 rounded-tile border border-line bg-panel px-2.5 py-1.5">
                    <FolderOpen
                      className="size-3.5 shrink-0 text-subtle"
                      aria-hidden="true"
                    />
                    <select
                      aria-label={`Collection for ${listing.title}`}
                      value={collectionId ?? ""}
                      onChange={(event) =>
                        void move(listing.id, event.target.value || null)
                      }
                      className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                    >
                      <option value="">Unsorted</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ShortlistCompareSheet
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        listings={comparedListings}
      />

      <ShareShortlistSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        listings={visibleListings}
        collectionName={activeCollectionName}
      />

      <ShortlistCollectionsSheet
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        collections={collections}
        status={collectionsStatus}
        error={collectionsError}
        onCreate={createCollection}
        onRename={renameCollection}
        onDelete={removeCollection}
      />
        </>
      )}
    </div>
  );
}
