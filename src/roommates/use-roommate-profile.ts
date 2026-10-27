import { useCallback, useEffect, useRef, useState } from "react";
import { loadRoommateProfile } from "@/roommates/roommate-detail";
import type { RoommateProfile } from "@/roommates/roommate-profiles";
import { supabase } from "@/lib/supabase";

export type RoommateProfileStatus = "loading" | "ready" | "error";

/** Loads one discoverable roommate profile for the detail screen. */
export function useRoommateProfile(profileId: string) {
  const [profile, setProfile] = useState<RoommateProfile | null>(null);
  const [status, setStatus] = useState<RoommateProfileStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase) {
      setProfile(null);
      setStatus("error");
      setError("Roommate profiles are unavailable because Supabase is not configured.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadRoommateProfile(supabase, profileId);
    if (request !== requestId.current) return;

    if (result.error) {
      setProfile(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setProfile(result.profile);
    setStatus("ready");
  }, [profileId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { profile, status, error, reload };
}
