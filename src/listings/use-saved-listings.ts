import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadSavedListingIds,
  loadSavedListings,
  saveListing,
  unsaveListing,
} from "@/listings/saved-listings";
import {
  createSavedCollection,
  deleteSavedCollection,
  fileListingInCollection,
  loadSavedCollections,
  renameSavedCollection,
  type SavedCollection,
} from "@/listings/saved-collections";
import type { PublicListing } from "@/listings/public-listings";
import { supabase } from "@/lib/supabase";
import {
  OFFLINE_NAMES,
  readSnapshot,
  writeSnapshot,
} from "@/offline/offline-store";
import {
  decodeSavedRooms,
  encodeSavedRooms,
  type SavedRoomsSnapshot,
} from "@/offline/snapshots";
import { useOnlineStatus } from "@/offline/use-online-status";

export type SavedListingsStatus = "loading" | "ready" | "error";

/**
 * Which rooms the viewer has saved — enough for a bookmark control anywhere in
 * the catalogue. Toggling is optimistic: the icon flips immediately and reverts
 * with an error if the write fails.
 */
export function useSavedListingIds({ userId }: { userId: string | null }) {
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<SavedListingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const idSet = useMemo(() => new Set(ids), [ids]);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setIds([]);
      setStatus("ready");
      setError(null);
      return;
    }

    setStatus("loading");
    const result = await loadSavedListingIds(client, userId);
    if (result.error) {
      setIds([]);
      setError(result.error);
      setStatus("error");
      return;
    }
    setIds(result.ids);
    setError(null);
    setStatus("ready");
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    async (listingId: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to save rooms.";

      const wasSaved = idSet.has(listingId);
      setIds((current) =>
        wasSaved
          ? current.filter((id) => id !== listingId)
          : [listingId, ...current],
      );
      setError(null);

      const result = wasSaved
        ? await unsaveListing(client, { userId, listingId })
        : await saveListing(client, { userId, listingId });

      if (result.error) {
        // Put the icon back where it was; the write did not happen.
        setIds((current) =>
          wasSaved
            ? [listingId, ...current.filter((id) => id !== listingId)]
            : current.filter((id) => id !== listingId),
        );
        setError(result.error);
        return result.error;
      }

      return null;
    },
    [idSet, userId],
  );

  return { ids, idSet, status, error, toggle, reload };
}

/**
 * The Saved tab: the viewer's shortlist as full public summaries, with the
 * collection each room sits in. Removing or filing a room updates the list
 * immediately, so the tab stays honest while the request is in flight.
 */
export function useSavedRooms({ userId }: { userId: string | null }) {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [collectionByListing, setCollectionByListing] = useState<
    Map<string, string | null>
  >(() => new Map());
  const [status, setStatus] = useState<SavedListingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  /** Set only when the list on screen came from the offline copy. */
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const requestId = useRef(0);
  const online = useOnlineStatus();

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setListings([]);
      setCollectionByListing(new Map());
      setStatus("ready");
      setError(null);
      setOfflineSavedAt(null);
      return;
    }

    // Offline: read the last good copy rather than failing the screen. No
    // loading state, because the copy is local and appears immediately.
    if (!online) {
      const cached = readSnapshot<SavedRoomsSnapshot>(
        OFFLINE_NAMES.savedRooms,
        userId,
      );
      if (!cached) {
        setListings([]);
        setCollectionByListing(new Map());
        setOfflineSavedAt(null);
        setError(
          "You are offline and this device has no saved copy of your shortlist yet. It will open once you reconnect.",
        );
        setStatus("error");
        return;
      }

      const decoded = decodeSavedRooms(cached.data);
      setListings(decoded.listings);
      setCollectionByListing(decoded.collectionByListing);
      setOfflineSavedAt(cached.savedAt);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");

    const result = await loadSavedListings(client, userId);
    if (request !== requestId.current) return;

    if (result.error) {
      setListings([]);
      setCollectionByListing(new Map());
      setOfflineSavedAt(null);
      setError(result.error);
      setStatus("error");
      return;
    }
    setListings(result.listings);
    setCollectionByListing(result.collectionByListing);
    setError(null);
    setStatus("ready");
    setOfflineSavedAt(null);
    writeSnapshot(
      OFFLINE_NAMES.savedRooms,
      userId,
      encodeSavedRooms(result.listings, result.collectionByListing),
    );
  }, [online, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = useCallback(
    async (listingId: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to update your saved rooms.";
      if (!online) {
        return "You are offline, so this room stays saved. Remove it once you reconnect.";
      }

      setListings((current) =>
        current.filter((listing) => listing.id !== listingId),
      );
      const result = await unsaveListing(client, { userId, listingId });
      if (result.error) {
        setError(result.error);
        void reload();
        return result.error;
      }
      return null;
    },
    [online, reload, userId],
  );

  /** Files a saved room into a collection, or back to Unsorted with `null`. */
  const move = useCallback(
    async (
      listingId: string,
      collectionId: string | null,
    ): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to organise your shortlist.";
      if (!online) {
        return "You are offline, so this room keeps its folder. File it again once you reconnect.";
      }

      setCollectionByListing((current) => {
        const next = new Map(current);
        next.set(listingId, collectionId);
        return next;
      });

      const result = await fileListingInCollection(client, {
        userId,
        listingId,
        collectionId,
      });
      if (result.error) {
        setError(result.error);
        void reload();
        return result.error;
      }
      return null;
    },
    [online, reload, userId],
  );

  return {
    listings,
    collectionByListing,
    status,
    error,
    /** ISO time of the read behind the cached copy, or null when reading live. */
    offlineSavedAt,
    remove,
    move,
    reload,
  };
}

/**
 * The viewer's shortlist collections. Creating, renaming and deleting are all
 * reflected locally from the row the write returns, so the chips never show a
 * folder that does not exist.
 */
export function useSavedCollections({ userId }: { userId: string | null }) {
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [status, setStatus] = useState<SavedListingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setCollections([]);
      setStatus("ready");
      setError(null);
      return;
    }

    setStatus("loading");
    const result = await loadSavedCollections(client, userId);
    if (result.error) {
      setCollections([]);
      setError(result.error);
      setStatus("error");
      return;
    }
    setCollections(result.collections);
    setError(null);
    setStatus("ready");
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (name: string): Promise<SavedCollection | null> => {
      const client = supabase;
      if (!client || !userId) return null;

      setError(null);
      const result = await createSavedCollection(client, { userId, name });
      if (result.error || !result.collection) {
        setError(result.error ?? "Could not create that collection.");
        return null;
      }
      setCollections((current) => [...current, result.collection!]);
      return result.collection;
    },
    [userId],
  );

  const rename = useCallback(
    async (collectionId: string, name: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to organise your shortlist.";

      setError(null);
      const result = await renameSavedCollection(client, { collectionId, name });
      if (result.error || !result.collection) {
        setError(result.error ?? "Could not rename that collection.");
        return result.error;
      }
      const renamed = result.collection;
      setCollections((current) =>
        current.map((collection) =>
          collection.id === renamed.id ? renamed : collection,
        ),
      );
      return null;
    },
    [userId],
  );

  const remove = useCallback(
    async (collectionId: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to organise your shortlist.";

      setError(null);
      const result = await deleteSavedCollection(client, collectionId);
      if (result.error) {
        setError(result.error);
        return result.error;
      }
      setCollections((current) =>
        current.filter((collection) => collection.id !== collectionId),
      );
      return null;
    },
    [userId],
  );

  return { collections, status, error, create, rename, remove, reload };
}
