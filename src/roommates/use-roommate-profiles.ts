import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadRoommateProfiles,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";
import { supabase } from "@/lib/supabase";

export type RoommateProfilesStatus = "loading" | "ready" | "error";

/**
 * Loads discoverable roommate profiles once per mounted screen.
 *
 * Visibility is decided by RLS and the seed data, not by this hook; it only adds
 * request state and ignores late responses after a remount.
 */
export function useRoommateProfiles() {
  const [profiles, setProfiles] = useState<RoommateProfile[]>([]);
  const [status, setStatus] = useState<RoommateProfilesStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase) {
      setProfiles([]);
      setStatus("error");
      setError("Roommate profiles are unavailable because Supabase is not configured.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadRoommateProfiles(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setProfiles([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setProfiles(result.profiles);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { profiles, status, error, reload };
}
