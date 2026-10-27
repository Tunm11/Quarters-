import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import {
  loadStudentListingChatThreads,
  type StudentListingChatThread,
} from "@/listings/listing-messages";
import { supabase } from "@/lib/supabase";
import {
  OFFLINE_NAMES,
  readSnapshot,
  writeSnapshot,
} from "@/offline/offline-store";
import { decodeList } from "@/offline/snapshots";
import { useOnlineStatus } from "@/offline/use-online-status";

export type StudentListingThreadsStatus = "loading" | "ready" | "error";

/** How long a burst of changes is coalesced before one refresh runs. */
const REFRESH_DEBOUNCE_MS = 150;

/**
 * The signed-in student's room conversations, kept live. The channel carries the
 * listing_messages rows RLS lets this user read, so a provider's reply refreshes
 * the inbox without a manual reload.
 */
export function useStudentListingChatThreads({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<StudentListingChatThread[]>([]);
  const [status, setStatus] = useState<StudentListingThreadsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  /** Set only while the rows on screen came from the offline copy. */
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const requestId = useRef(0);
  const online = useOnlineStatus();

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setThreads([]);
      setError(null);
      setStatus("ready");
      setOfflineSavedAt(null);
      return;
    }

    if (!online) {
      const cached = readSnapshot<unknown>(
        OFFLINE_NAMES.roomThreads,
        user?.id ?? "anonymous",
      );
      setThreads(decodeList<StudentListingChatThread>(cached?.data));
      setOfflineSavedAt(user ? (cached?.savedAt ?? null) : null);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;

    const result = await loadStudentListingChatThreads(client);
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
    setOfflineSavedAt(null);
    if (user) writeSnapshot(OFFLINE_NAMES.roomThreads, user.id, result.threads);
  }, [online, user]);

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
      .channel("listing-chat-student-inbox")
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

  return { threads, status, error, offlineSavedAt, reload };
}
