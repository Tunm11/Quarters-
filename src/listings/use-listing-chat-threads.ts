import { useCallback, useEffect, useRef, useState } from "react";
import { loadListingChatThreads, type ListingChatThread } from "@/listings/listing-messages";
import { supabase } from "@/lib/supabase";

export type ListingChatThreadsStatus = "loading" | "ready" | "error";

/** How long a burst of changes is coalesced before one refresh runs. */
const REFRESH_DEBOUNCE_MS = 150;

/**
 * A provider's listing conversations, kept live.
 *
 * The channel carries every listing_messages row the signed-in user may read —
 * RLS decides that, so a provider only receives their own threads and a student
 * only their own. Any change simply re-reads the inbox summary.
 */
export function useListingChatThreads({ enabled }: { enabled: boolean }) {
  const [threads, setThreads] = useState<ListingChatThread[]>([]);
  const [status, setStatus] = useState<ListingChatThreadsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setThreads([]);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;

    const result = await loadListingChatThreads(client);
    if (request !== requestId.current) return;

    if (result.error) {
      setThreads([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setThreads(result.threads);
    setError(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setThreads([]);
      setStatus("ready");
      setError(null);
      return;
    }
    setStatus("loading");
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !client?.channel) return;

    let timer: number | null = null;
    const channel = client
      .channel("listing-chat-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listing_messages" },
        () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            void reload();
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [enabled, reload]);

  return { threads, status, error, reload };
}
