import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadChatGroupReaders,
  loadGroupMessages,
  markGroupMessagesRead,
  sendGroupMessage,
  type ChatGroupMessage,
  type ChatGroupReader,
} from "@/chat/groups";
import { supabase } from "@/lib/supabase";

/** How long a burst of group changes is coalesced before one refresh runs. */
const REFRESH_DEBOUNCE_MS = 120;

/**
 * One group conversation, kept live while it is open.
 *
 * Loads the thread, moves the viewer's read cursor so the unread badge clears,
 * sends replies, and subscribes to that group's rows on Supabase Realtime so a
 * member's message arrives without a refresh.
 */
export function useGroupChat({
  enabled,
  groupId,
  viewerId,
}: {
  enabled: boolean;
  groupId: string;
  viewerId: string | null;
}) {
  const [messages, setMessages] = useState<ChatGroupMessage[]>([]);
  const [readers, setReaders] = useState<ChatGroupReader[]>([]);
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

      const [result, readerResult] = await Promise.all([
        loadGroupMessages(client, groupId),
        loadChatGroupReaders(client, groupId),
      ]);
      if (request !== requestId.current) return;

      setMessages(result.messages);
      setReaders(readerResult.readers);
      setError(result.error);
      setLoading(false);

      // Opening the group is what clears its unread badge.
      if (!result.error) {
        await markGroupMessagesRead(client, { groupId, userId: viewerId });
      }
    },
    [groupId, viewerId],
  );

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setMessages([]);
      setReaders([]);
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
      .channel(`chat-group-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            void reload({ silent: true });
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      // A member opening the thread moves their read cursor; refresh receipts.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_group_members",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
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
  }, [enabled, groupId, reload]);

  const send = useCallback(
    async (input: {
      body: string;
      sharedListingId?: string | null;
      imagePath?: string | null;
    }): Promise<string | null> => {
      const client = supabase;
      if (!client || !viewerId) return "Sign in to send a message.";

      setSending(true);
      const result = await sendGroupMessage(client, {
        groupId,
        senderId: viewerId,
        body: input.body,
        sharedListingId: input.sharedListingId ?? null,
        imagePath: input.imagePath ?? null,
      });
      setSending(false);

      if (result.error) return result.error;
      if (result.message) {
        setMessages((current) => [
          ...current,
          result.message as ChatGroupMessage,
        ]);
        void reload({ silent: true });
      }
      return null;
    },
    [groupId, reload, viewerId],
  );

  return { messages, readers, loading, error, sending, send, reload };
}
