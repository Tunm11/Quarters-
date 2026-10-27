import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadPublicListings,
  mergePublicListings,
  type PublicListing,
} from "@/listings/public-listings";
import { supabase } from "@/lib/supabase";

export type PublicListingsStatus = "loading" | "ready" | "error";

type CatalogueState = {
  /** Every page loaded so far, newest first. */
  listings: PublicListing[];
  status: PublicListingsStatus;
  /** Failure of the first page: nothing is on screen. */
  error: string | null;
  /** Failure of a later page: the loaded rooms are kept. */
  moreError: string | null;
  /** Published rooms the caller may read, from the last page read. */
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
};

const initialState: CatalogueState = {
  listings: [],
  status: "loading",
  error: null,
  moreError: null,
  total: 0,
  hasMore: false,
  loadingMore: false,
};

/**
 * Loads the public catalogue page by page.
 *
 * The query itself is protected by the listings RLS policy, so this hook does
 * not decide visibility. It adds request-state handling, ignores late responses
 * after a remount or a reload, and keeps the rooms already on screen when a
 * later page fails, so a dropped request never empties the list.
 */
export function usePublicListings() {
  const [state, setState] = useState<CatalogueState>(initialState);

  const requestId = useRef(0);
  const loadedCount = useRef(0);
  const hasMoreRef = useRef(false);
  // A page on the wire. The scroll sentinel can ask for the next page while the
  // previous one is still loading, so this is the single-flight guard.
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!supabase) {
      setState({
        ...initialState,
        status: "error",
        error: "Rooms are unavailable because Supabase is not configured.",
      });
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    loadedCount.current = 0;
    hasMoreRef.current = false;
    inFlight.current = false;
    setState({ ...initialState, status: "loading" });

    const result = await loadPublicListings(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setState({ ...initialState, status: "error", error: result.error });
      return;
    }

    loadedCount.current = result.listings.length;
    hasMoreRef.current = result.hasMore;
    setState({
      listings: result.listings,
      status: "ready",
      error: null,
      moreError: null,
      total: result.total,
      hasMore: result.hasMore,
      loadingMore: false,
    });
  }, []);

  const loadMore = useCallback(async () => {
    const client = supabase;
    if (!client || inFlight.current || !hasMoreRef.current) return;

    const request = requestId.current;
    inFlight.current = true;
    setState((current) => ({ ...current, loadingMore: true, moreError: null }));

    const result = await loadPublicListings(client, {
      offset: loadedCount.current,
    });

    // A reload or remount replaced the catalogue while this page was in flight,
    // so these rows belong to a list the screen has already left.
    if (request !== requestId.current) return;

    inFlight.current = false;

    if (result.error) {
      setState((current) => ({
        ...current,
        loadingMore: false,
        moreError: result.error,
      }));
      return;
    }

    loadedCount.current += result.listings.length;
    hasMoreRef.current = result.hasMore;
    setState((current) => ({
      ...current,
      listings: mergePublicListings(current.listings, result.listings),
      total: result.total,
      hasMore: result.hasMore,
      loadingMore: false,
      moreError: null,
    }));
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
      inFlight.current = false;
    };
  }, [reload]);

  return { ...state, reload, loadMore };
}
