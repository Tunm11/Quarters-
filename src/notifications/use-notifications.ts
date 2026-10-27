import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  countUnreadNotifications,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/notifications/notifications";

export type NotificationsStatus = "loading" | "ready" | "error";

/**
 * The signed-in student's activity feed.
 *
 * Reloads on mount, when the tab regains focus, and whenever a notification row
 * for this account arrives over Realtime. Read state is applied optimistically
 * and rolled back by a reload if the write fails.
 */
export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [status, setStatus] = useState<NotificationsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setNotifications([]);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;

    const result = await loadNotifications(client);
    if (request !== requestId.current) return;

    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setNotifications(result.notifications);
    setError(null);
    setStatus("ready");
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

    const channel = client
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void reload(),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [reload, userId]);

  const markRead = useCallback(async (notificationId: string) => {
    const client = supabase;
    if (!client) return null;

    const readAt = new Date().toISOString();
    // Optimistic: the dot disappears immediately, the row stays put.
    setNotifications((rows) =>
      rows.map((row) =>
        row.id === notificationId && row.read_at === null
          ? { ...row, read_at: readAt }
          : row,
      ),
    );

    const result = await markNotificationRead(client, notificationId);
    if (result.error) {
      await reload();
      return result.error;
    }
    return null;
  }, [reload]);

  const markAllRead = useCallback(async () => {
    const client = supabase;
    if (!client) return null;

    setMarkingAll(true);
    const readAt = new Date().toISOString();
    setNotifications((rows) =>
      rows.map((row) => (row.read_at === null ? { ...row, read_at: readAt } : row)),
    );

    const result = await markAllNotificationsRead(client);
    setMarkingAll(false);
    if (result.error) {
      await reload();
      return result.error;
    }
    return null;
  }, [reload]);

  const unreadCount = notifications.filter((row) => row.read_at === null).length;

  return {
    notifications,
    status,
    error,
    unreadCount,
    markingAll,
    reload,
    markRead,
    markAllRead,
  };
}

/** How long a burst of notification rows is coalesced before one recount runs. */
const REFRESH_DEBOUNCE_MS = 200;

/**
 * The number on the Bell: unread activity for this account. Kept separate from
 * the feed hook so Home does not download the whole page just to draw a badge.
 */
export function useNotificationBadge() {
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

    const result = await countUnreadNotifications(client);
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
      .channel("notification-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
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
