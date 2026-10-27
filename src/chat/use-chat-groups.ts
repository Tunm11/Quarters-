import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import {
  loadChatGroups,
  type ChatGroupSummary,
} from "@/chat/groups";
import { supabase } from "@/lib/supabase";
import {
  OFFLINE_NAMES,
  readSnapshot,
  writeSnapshot,
} from "@/offline/offline-store";
import { decodeList } from "@/offline/snapshots";
import { useOnlineStatus } from "@/offline/use-online-status";

export type ChatGroupsStatus = "loading" | "ready" | "error";

/** How long a burst of group messages is coalesced before one refresh runs. */
const REFRESH_DEBOUNCE_MS = 150;

/**
 * The viewer's groups, kept live. The realtime channel only carries rows RLS
 * lets this user read, so another member's message refreshes the inbox without
 * a manual reload.
 */
export function useChatGroups({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatGroupSummary[]>([]);
  const [status, setStatus] = useState<ChatGroupsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  /** Set only while the rows on screen came from the offline copy. */
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const requestId = useRef(0);
  const online = useOnlineStatus();

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setGroups([]);
      setError(null);
      setStatus("ready");
      setOfflineSavedAt(null);
      return;
    }

    if (!online) {
      const cached = readSnapshot<unknown>(
        OFFLINE_NAMES.groups,
        user?.id ?? "anonymous",
      );
      setGroups(decodeList<ChatGroupSummary>(cached?.data));
      setOfflineSavedAt(user ? (cached?.savedAt ?? null) : null);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;

    const result = await loadChatGroups(client);
    if (request !== requestId.current) return;

    if (result.error) {
      setGroups([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setGroups(result.groups);
    setError(null);
    setStatus("ready");
    setOfflineSavedAt(null);
    if (user) writeSnapshot(OFFLINE_NAMES.groups, user.id, result.groups);
  }, [online, user]);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setGroups([]);
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
      .channel("chat-groups-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_group_messages" },
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

  return { groups, status, error, offlineSavedAt, reload };
}
