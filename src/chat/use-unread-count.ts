import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { countUnreadMessages } from "@/chat/unread";
import { supabase } from "@/lib/supabase";

/** How long a burst of new messages is coalesced before one recount runs. */
const REFRESH_DEBOUNCE_MS = 200;

/**
 * The number shown on the messages icon: unread replies across roommate and room
 * conversations. Recounts on mount, when the tab regains focus, and whenever
 * either messages table changes for this user (Realtime, RLS-scoped).
 */
export function useUnreadCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setCount(0);
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;

    const result = await countUnreadMessages(client, userId);
    if (request !== requestId.current) return;
    setCount(result.error ? 0 : result.count);
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    function handleFocus() {
      void reload();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [reload, userId]);

  useEffect(() => {
    const client = supabase;
    if (!userId || !client?.channel) return;

    let timer: number | null = null;
    const channel = client
      .channel("chat-unread-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roommate_messages" },
        () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            void reload();
          }, REFRESH_DEBOUNCE_MS);
        },
      )
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
  }, [reload, userId]);

  return count;
}
