import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadSavedRoomAlerts,
  saveSavedRoomAlerts,
} from "@/settings/saved-room-alerts";

export type SavedRoomAlertsStatus = "loading" | "ready" | "error";

/**
 * The account-level "Updates on saved rooms" switch.
 *
 * Unlike the other notification choices, this one is stored on the profile so
 * the database trigger that writes the alerts can honour it. The toggle is
 * optimistic and reverts with an error if the write fails, so the switch never
 * claims a state the account does not have.
 */
export function useSavedRoomAlerts({ userId }: { userId: string | null }) {
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<SavedRoomAlertsStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setEnabled(true);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");

    const result = await loadSavedRoomAlerts(client, userId);
    if (request !== requestId.current) return;

    setEnabled(result.enabled);
    setError(result.error);
    setStatus(result.error ? "error" : "ready");
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const update = useCallback(
    async (next: boolean): Promise<string | null> => {
      const client = supabase;
      if (!client || !userId) return "Sign in to change saved-room alerts.";

      const previous = enabled;
      setEnabled(next);
      setSaving(true);
      setError(null);

      const result = await saveSavedRoomAlerts(client, userId, next);
      setSaving(false);

      if (result.error) {
        setEnabled(previous);
        setError(result.error);
        return result.error;
      }

      setStatus("ready");
      return null;
    },
    [enabled, userId],
  );

  return { enabled, status, saving, error, update, reload };
}
