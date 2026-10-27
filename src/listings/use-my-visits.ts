import { useCallback, useEffect, useRef, useState } from "react";
import { loadMyVisits, type MyVisit } from "@/listings/my-visits";
import { cancelViewingRequest } from "@/listings/viewing-requests";
import { supabase } from "@/lib/supabase";

export type MyVisitsStatus = "loading" | "ready" | "error";

/**
 * The visitor's own visit requests, with cancellation.
 *
 * Cancelling updates the row in place, so the card moves from "Coming up" to
 * the history without a reload; the database's 24-hour cutoff is still the
 * authority, and its refusal is shown on the card.
 */
export function useMyVisits({ enabled }: { enabled: boolean }) {
  const [visits, setVisits] = useState<MyVisit[]>([]);
  const [status, setStatus] = useState<MyVisitsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setVisits([]);
      setStatus("ready");
      setError(null);
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");

    const result = await loadMyVisits(client);
    if (request !== requestId.current) return;

    if (result.error) {
      setVisits([]);
      setError(result.error);
      setStatus("error");
      return;
    }
    setVisits(result.visits);
    setError(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setVisits([]);
      setStatus("ready");
      setError(null);
      return;
    }
    void reload();
  }, [enabled, reload]);

  const cancel = useCallback(
    async (visitId: string): Promise<string | null> => {
      const client = supabase;
      if (!client || !enabled) return "Sign in to cancel your visit.";

      setCancellingId(visitId);
      setError(null);
      const result = await cancelViewingRequest(client, visitId);
      setCancellingId(null);

      if (result.error) {
        setError(result.error);
        return result.error;
      }

      setVisits((current) =>
        current.map((visit) =>
          visit.request.id === visitId
            ? { ...visit, request: { ...visit.request, status: "cancelled" } }
            : visit,
        ),
      );
      return null;
    },
    [enabled],
  );

  return { visits, status, error, cancellingId, cancel, reload };
}
