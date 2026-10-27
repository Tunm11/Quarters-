import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadListingMessages,
  markListingMessagesRead,
  sendListingMessage,
  type ListingMessage,
} from "@/listings/listing-messages";
import { supabase } from "@/lib/supabase";

/** How long a burst of thread changes is coalesced before one refresh runs. */
const REFRESH_DEBOUNCE_MS = 120;

/**
 * One listing conversation, kept live while it is open.
 *
 * Loads the thread, marks the other side's messages as read so "Seen" means
 * something, sends replies, and subscribes to the rows on Supabase Realtime so a
 * new message or receipt arrives without a refresh. The channel is scoped to the
 * listing and the handler ignores changes from other students' threads, since a
 * provider has one conversation per student on the same room.
 */
export function useListingChat({
  enabled,
  listingId,
  studentId,
  viewerId,
}: {
  enabled: boolean;
  listingId: string;
  /** Thread key: the student who opened the conversation. */
  studentId: string;
  viewerId: string | null;
}) {
  const [messages, setMessages] = useState<ListingMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const client = supabase;
      if (!client || !viewerId) return;

      const request = requestId.current + 1;
      requestId.current = request;
      if (!silent) setLoading(true);
      setError(null);

      const result = await loadListingMessages(client, { listingId, studentId });
      if (request !== requestId.current) return;

      setMessages(result.messages);
      setError(result.error);
      setLoading(false);

      // Opening the thread is what makes the other side's copy show "Seen".
      if (!result.error) {
        await markListingMessagesRead(client, { listingId, studentId, readerId: viewerId });
      }
    },
    [listingId, studentId, viewerId],
  );

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !client?.channel) return;

    let timer: number | null = null;
    const channel = client
      .channel(`listing-chat-${listingId}-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "listing_messages",
          filter: `listing_id=eq.${listingId}`,
        },
        (payload) => {
          const row = payload.new as { student_id?: string } | undefined;
          if (row?.student_id && row.student_id !== studentId) return;

          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            void reload({ silent: true });
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [enabled, listingId, reload, studentId]);

  const send = useCallback(
    async (input: {
      body: string;
      sharedListingId?: string | null;
      imagePath?: string | null;
    }): Promise<string | null> => {
      const client = supabase;
      if (!client || !viewerId) return "Sign in to send a message.";

      setSending(true);
      const result = await sendListingMessage(client, {
        listingId,
        studentId,
        senderId: viewerId,
        body: input.body,
        sharedListingId: input.sharedListingId ?? null,
        imagePath: input.imagePath ?? null,
      });
      setSending(false);

      if (result.error) return result.error;
      if (result.message) {
        // Show it straight away; the realtime event confirms it for the other side.
        setMessages((current) => [...current, result.message as ListingMessage]);
        void reload({ silent: true });
      }
      return null;
    },
    [listingId, reload, studentId, viewerId],
  );

  return { messages, loading, error, sending, send, reload };
}
