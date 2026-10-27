import { useEffect, useState } from "react";

/** True when the browser reports no connection. Assumes online elsewhere. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * The browser's connection state, kept live.
 *
 * `navigator.onLine` is a coarse signal — it knows about the radio, not about a
 * Supabase outage — so this is used to decide whether to read the offline copy
 * instead of asking the network. A reachable server error is still an error.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => !isOffline());

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // The event may have fired between render and this effect.
    setOnline(!isOffline());

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
