import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Which conversation the indicator belongs to. */
export type TypingScope = "room" | "roommate" | "group";

/** How long one signal keeps someone "typing" without a repeat. */
const TYPING_TTL_MS = 5000;
/** At most one signal this often while the viewer keeps typing. */
const TYPING_THROTTLE_MS = 2000;

/**
 * "Someone is typing…" for one conversation.
 *
 * Typing is ephemeral, so nothing is written to the database: each participant
 * broadcasts on a channel named after the conversation, and a signal is dropped
 * after a few seconds. Chat surfaces call `notifyTyping()` from the composer as
 * the draft changes and `stopTyping()` when a message is sent.
 *
 * A client without Realtime (or a test double) simply never reports anyone.
 */
export function useTypingIndicator({
  kind,
  conversationId,
  viewerId,
  enabled = true,
}: {
  kind: TypingScope;
  conversationId: string;
  viewerId: string | null;
  enabled?: boolean;
}) {
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    const client = supabase;
    if (!enabled || !viewerId || !conversationId || !client?.channel) return;

    seen.current = new Map();
    setTypingIds([]);

    const publish = () => setTypingIds([...seen.current.keys()]);

    const mark = (payload: unknown) => {
      const id =
        typeof payload === "object" && payload !== null
          ? String((payload as { user_id?: unknown }).user_id ?? "")
          : "";
      if (!id || id === viewerId) return;
      seen.current.set(id, Date.now());
      publish();
    };

    const clear = (payload: unknown) => {
      const id =
        typeof payload === "object" && payload !== null
          ? String((payload as { user_id?: unknown }).user_id ?? "")
          : "";
      if (!id) return;
      seen.current.delete(id);
      publish();
    };

    const channel = client
      .channel(`typing:${kind}:${conversationId}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "typing" }, (message) => mark(message.payload))
      .on("broadcast", { event: "stop" }, (message) => clear(message.payload))
      .subscribe();

    channelRef.current = channel;

    const timer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, at] of seen.current) {
        if (now - at > TYPING_TTL_MS) {
          seen.current.delete(id);
          changed = true;
        }
      }
      if (changed) publish();
    }, 1000);

    return () => {
      window.clearInterval(timer);
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [conversationId, enabled, kind, viewerId]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !viewerId) return;

    const now = Date.now();
    if (now - lastSent.current < TYPING_THROTTLE_MS) return;
    lastSent.current = now;

    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: viewerId },
    });
  }, [viewerId]);

  const stopTyping = useCallback(() => {
    lastSent.current = 0;
    const channel = channelRef.current;
    if (!channel || !viewerId) return;

    void channel.send({
      type: "broadcast",
      event: "stop",
      payload: { user_id: viewerId },
    });
  }, [viewerId]);

  return { typingIds, notifyTyping, stopTyping };
}

/** What the thread shows while other people are typing. */
export function typingLabel(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "Someone is typing…";
  return `${count} people are typing…`;
}
