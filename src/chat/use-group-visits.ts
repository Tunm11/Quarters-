import { useCallback, useEffect, useRef, useState } from "react";
import { loadGroupVisitRequest, requestGroupVisit } from "@/chat/group-visits";
import { supabase } from "@/lib/supabase";

/**
 * Group visits for the properties shared in one group thread.
 *
 * Every member sees the same state: whether the group has already asked to view
 * a property together, and any request they make is recorded against the group
 * so the lister sees the whole group rather than one student.
 */
export function useGroupVisits({
  enabled,
  groupId,
  listingIds,
  viewerId,
}: {
  enabled: boolean;
  groupId: string;
  /** Properties mentioned in the thread; loads one request per property. */
  listingIds: string[];
  viewerId: string | null;
}) {
  const [requested, setRequested] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // A stable key so the effect re-runs only when the set of properties changes.
  const key = [...new Set(listingIds)].sort().join(",");

  useEffect(() => {
    const client = supabase;
    if (!enabled || !groupId || !client || key === "") {
      setRequested(new Set());
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    const ids = key.split(",");

    let active = true;
    void Promise.all(
      ids.map((listingId) =>
        loadGroupVisitRequest(client, { groupId, listingId }),
      ),
    ).then((results) => {
      if (!active || request !== requestId.current) return;

      const next = new Set<string>();
      let firstError: string | null = null;
      results.forEach((result, index) => {
        if (result.requested) next.add(ids[index]);
        if (result.error && !firstError) firstError = result.error;
      });
      setRequested(next);
      setError(firstError);
    });

    return () => {
      active = false;
    };
  }, [enabled, groupId, key]);

  const request = useCallback(
    async (listingId: string) => {
      const client = supabase;
      if (!client || !viewerId) {
        setError("Sign in to plan a group visit.");
        return;
      }

      setPendingId(listingId);
      setError(null);
      const result = await requestGroupVisit(client, {
        groupId,
        listingId,
        userId: viewerId,
      });
      setPendingId(null);

      if (result.error) {
        setError(result.error);
        return;
      }
      setRequested((current) => new Set(current).add(listingId));
    },
    [groupId, viewerId],
  );

  return {
    requested,
    pendingId,
    error,
    request,
  };
}
