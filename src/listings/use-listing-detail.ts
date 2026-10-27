import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadPublicListingDetail,
  type PublicListingDetail,
} from "@/listings/listing-detail";
import { supabase } from "@/lib/supabase";

export type ListingDetailStatus = "loading" | "ready" | "error";

/**
 * Loads one published listing for the details screen.
 *
 * Visibility is decided by the listings RLS policy, not here: a draft, hidden or
 * unapproved listing resolves to no row and is reported as "not found".
 */
export function useListingDetail(listingId: string) {
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [status, setStatus] = useState<ListingDetailStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase) {
      setListing(null);
      setStatus("error");
      setError("This room is unavailable because Supabase is not configured.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadPublicListingDetail(supabase, listingId);
    if (request !== requestId.current) return;

    if (result.error) {
      setListing(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setListing(result.listing);
    setStatus("ready");
  }, [listingId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { listing, status, error, reload };
}
