import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  loadMyRoommateProfile,
  saveMyRoommateProfile,
  validateMyProfile,
  type MyProfileFieldErrors,
  type MyRoommateProfile,
  type MyRoommateProfileDraft,
} from "@/roommates/my-profile";

export type MyProfileStatus = "loading" | "ready" | "error";

export type SaveProfileResult = {
  error: string | null;
  fieldErrors: MyProfileFieldErrors;
};

/** Loads the signed-in student's own roommate profile and saves edits to it. */
export function useMyRoommateProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyRoommateProfile | null>(null);
  const [status, setStatus] = useState<MyProfileStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requestId = useRef(0);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!supabase || !userId) {
      setProfile(null);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadMyRoommateProfile(supabase, userId);
    if (request !== requestId.current) return;

    if (result.error) {
      setProfile(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setProfile(result.profile);
    setStatus("ready");
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const save = useCallback(
    async (draft: MyRoommateProfileDraft): Promise<SaveProfileResult> => {
      const fieldErrors = validateMyProfile(draft);
      if (Object.keys(fieldErrors).length > 0) {
        return { error: null, fieldErrors };
      }

      if (!supabase || !userId) {
        return { error: "Sign in to edit your roommate profile.", fieldErrors: {} };
      }

      setSaving(true);

      // The photo is not part of this row: every screen reads the account photo.
      const result = await saveMyRoommateProfile(
        supabase,
        userId,
        profile?.id ?? null,
        draft,
      );
      setSaving(false);

      if (result.error) {
        return { error: result.error, fieldErrors: {} };
      }

      setProfile(result.profile);
      setStatus("ready");
      setError(null);
      return { error: null, fieldErrors: {} };
    },
    [profile?.id, userId],
  );

  return { profile, status, error, saving, reload, save };
}
