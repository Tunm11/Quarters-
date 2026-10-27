import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSavedSearch,
  deleteSavedSearch,
  loadSavedSearches,
  updateSavedSearch,
  type SavedSearch,
  type SavedSearchCriteria,
} from "@/listings/saved-searches";
import { supabase } from "@/lib/supabase";

export type SavedSearchesStatus = "loading" | "ready" | "error";

/**
 * The account's saved searches.
 *
 * Writes are reflected locally from the row Supabase returns, so the list never
 * shows a search that was not stored. The alert switch is optimistic because it
 * is a one-tap control: it flips immediately and reverts if the write fails.
 *
 * Pass `load: false` from a screen that only saves searches (Explore): it then
 * never fetches the list, and `status` starts settled.
 */
export function useSavedSearches({
  userId,
  load = true,
}: {
  userId: string | null;
  load?: boolean;
}) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [status, setStatus] = useState<SavedSearchesStatus>(load ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId || !load) {
      setSearches([]);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");

    const result = await loadSavedSearches(client, userId);
    if (request !== requestId.current) return;

    if (result.error) {
      setSearches([]);
      setError(result.error);
      setStatus("error");
      return;
    }
    setSearches(result.searches);
    setError(null);
    setStatus("ready");
  }, [load, userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const create = useCallback(
    async ({
      name,
      criteria,
      notify,
    }: {
      name: string;
      criteria: SavedSearchCriteria;
      notify: boolean;
    }): Promise<{ search: SavedSearch | null; error: string | null }> => {
      const client = supabase;
      if (!client || !userId) {
        return { search: null, error: "Sign in to save searches." };
      }

      const result = await createSavedSearch(client, {
        userId,
        name,
        criteria,
        notify,
      });
      if (result.error || !result.search) return result;

      setSearches((current) => [result.search!, ...current]);
      setStatus("ready");
      setError(null);
      return result;
    },
    [userId],
  );

  const rename = useCallback(
    async (searchId: string, name: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to change saved searches.";

      const result = await updateSavedSearch(client, { searchId, name });
      if (result.error || !result.search) {
        return result.error ?? "Could not rename that search.";
      }

      const renamed = result.search;
      setSearches((current) =>
        current.map((search) => (search.id === renamed.id ? renamed : search)),
      );
      return null;
    },
    [userId],
  );

  const setNotify = useCallback(
    async (searchId: string, notify: boolean): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to change saved-search alerts.";

      const previous = searches.find((search) => search.id === searchId)?.notify;
      setSearches((current) =>
        current.map((search) => (search.id === searchId ? { ...search, notify } : search)),
      );
      setBusyId(searchId);

      const result = await updateSavedSearch(client, { searchId, notify });
      setBusyId(null);

      if (result.error || !result.search) {
        // Put the switch back: the write did not happen.
        setSearches((current) =>
          current.map((search) =>
            search.id === searchId && previous !== undefined
              ? { ...search, notify: previous }
              : search,
          ),
        );
        setError(result.error ?? "Could not change that search's alerts.");
        return result.error ?? "Could not change that search's alerts.";
      }

      setError(null);
      return null;
    },
    [searches, userId],
  );

  const remove = useCallback(
    async (searchId: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to remove saved searches.";

      const previous = searches;
      setSearches((current) => current.filter((search) => search.id !== searchId));
      setBusyId(searchId);

      const result = await deleteSavedSearch(client, searchId);
      setBusyId(null);

      if (result.error) {
        setSearches(previous);
        setError(result.error);
        return result.error;
      }

      setError(null);
      return null;
    },
    [searches, userId],
  );

  return {
    searches,
    status,
    error,
    busyId,
    reload,
    create,
    rename,
    setNotify,
    remove,
  };
}
