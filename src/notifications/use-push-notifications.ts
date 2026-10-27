import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  PUSH_DENIED_MESSAGE,
  disablePush,
  enablePush,
  readPushState,
  type PushState,
} from "@/notifications/push";

/**
 * This browser's push state plus the two actions the UI needs.
 *
 * State is re-read on mount and whenever the tab regains focus, because the
 * student may have changed the site permission in browser settings.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await readPushState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handleFocus() {
      void refresh();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const enable = useCallback(async () => {
    const client = supabase;
    if (!client || !user) {
      setError("Sign in to turn on push notifications.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await enablePush(client, user.id);
    setBusy(false);
    setState(result.state);
    setError(result.error ?? null);
  }, [user]);

  const disable = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setError("Push is unavailable because Supabase is not configured.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await disablePush(client);
    setBusy(false);
    setState(result.state);
    setError(result.error ?? null);
  }, []);

  return {
    state,
    busy,
    error,
    canEnable: state === "default" || state === "denied",
    enable,
    disable,
    refresh,
    permissionMessage: state === "denied" ? PUSH_DENIED_MESSAGE : null,
  };
}
