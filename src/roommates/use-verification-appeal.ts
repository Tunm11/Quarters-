import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  loadMyLatestAppeal,
  submitVerificationAppeal,
  type VerificationAppeal,
  type VerificationAppealReason,
} from "@/roommates/verification-appeal";

export type VerificationAppealStatus = "idle" | "loading" | "ready" | "error";

/**
 * The student's latest re-review request. Loading is skipped until there is a
 * verification to appeal against.
 */
export function useVerificationAppeal(verificationId: string | null) {
  const { user } = useAuth();
  const [appeal, setAppeal] = useState<VerificationAppeal | null>(null);
  const [status, setStatus] = useState<VerificationAppealStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!verificationId || !user) {
      setAppeal(null);
      setError(null);
      setStatus("idle");
      return;
    }
    if (!supabase) {
      setAppeal(null);
      setError("Re-review requests are unavailable because Supabase is not configured.");
      setStatus("error");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadMyLatestAppeal(supabase, user.id);
    if (request !== requestId.current) return;

    if (result.error) {
      setAppeal(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setAppeal(result.appeal);
    setStatus("ready");
  }, [user, verificationId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const submit = useCallback(
    async (
      reason: VerificationAppealReason,
      message: string,
    ): Promise<string | null> => {
      if (!supabase || !user || !verificationId) {
        return "Sign in again to request a re-review.";
      }

      setSubmitting(true);
      const result = await submitVerificationAppeal(supabase, {
        userId: user.id,
        verificationId,
        reason,
        message,
      });
      setSubmitting(false);

      if (result.error) return result.error;
      setAppeal(result.appeal);
      setStatus("ready");
      return null;
    },
    [user, verificationId],
  );

  return { appeal, status, error, submitting, reload, submit };
}
