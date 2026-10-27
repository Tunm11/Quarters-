import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  OFFLINE_NAMES,
  readSnapshot,
  writeSnapshot,
} from "@/offline/offline-store";
import { decodeList } from "@/offline/snapshots";
import { useOnlineStatus } from "@/offline/use-online-status";
import {
  loadRoommateConnections,
  type RoommateConnection,
} from "@/roommates/connections";

export type RoommateConnectionsStatus = "loading" | "ready" | "error";

/**
 * Loads the viewer's accepted roommate connections.
 *
 * Signed-out visitors simply get an empty list: the button that uses this is
 * only rendered once there is at least one connection.
 */
export function useRoommateConnections() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<RoommateConnection[]>([]);
  const [status, setStatus] = useState<RoommateConnectionsStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  /** Set only while the rows on screen came from the offline copy. */
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const requestId = useRef(0);
  const userId = user?.id ?? null;
  const online = useOnlineStatus();

  const reload = useCallback(async () => {
    if (!supabase) {
      setConnections([]);
      setError(null);
      setStatus("ready");
      return;
    }

    if (!userId) {
      setConnections([]);
      setError(null);
      setStatus("ready");
      setOfflineSavedAt(null);
      return;
    }

    if (!online) {
      const cached = readSnapshot<unknown>(OFFLINE_NAMES.connections, userId);
      setConnections(decodeList<RoommateConnection>(cached?.data));
      setOfflineSavedAt(cached?.savedAt ?? null);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadRoommateConnections(supabase, userId);
    if (request !== requestId.current) return;

    if (result.error) {
      setConnections([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setConnections(result.connections);
    setStatus("ready");
    setOfflineSavedAt(null);
    writeSnapshot(OFFLINE_NAMES.connections, userId, result.connections);
  }, [online, userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { connections, status, error, offlineSavedAt, reload };
}
