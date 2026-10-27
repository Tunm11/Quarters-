import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * How long a burst of thread changes is coalesced before one refresh runs. A
 * send and the read receipt it triggers arrive together, and reloading twice
 * would only add flicker.
 */
const REFRESH_DEBOUNCE_MS = 120;

/**
 * Keeps an open chat thread live.
 *
 * Subscribes to this thread's rows on Supabase Realtime and calls `onChange`
 * whenever either participant writes a message or the other side's read receipt
 * lands, so a reply no longer waits for the tab to regain focus. The
 * subscription is torn down when the chat closes, the profile changes, or the
 * component unmounts.
 *
 * Environments without Realtime (a client that cannot open a channel, or a
 * database where the realtime migration has not been applied) simply never
 * fire: the screen stays on the existing focus-refresh fallback.
 */
export function useRoommateMessagesChannel({
  profileId,
  enabled,
  onChange,
}: {
  profileId: string;
  enabled: boolean;
  onChange: () => void;
}) {
  // The latest callback without resubscribing every time the thread re-renders.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !profileId || !client?.channel) return;

    let timer: number | null = null;
    const channel = client
      .channel(`roommate-chat-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roommate_messages",
          filter: `profile_id=eq.${profileId}`,
        },
        () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            onChangeRef.current();
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [enabled, profileId]);
}
