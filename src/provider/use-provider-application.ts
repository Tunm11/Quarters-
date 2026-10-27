import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import {
  loadProviderApplication,
  submitProviderApplication,
  type ProviderApplication,
  type ProviderKind,
} from "@/provider/application";
import { supabase } from "@/lib/supabase";

export type ProviderApplicationLoadStatus = "loading" | "ready" | "error";

export type ProviderSubmissionOutcome = {
  error: string | null;
  duplicate: boolean;
};

/**
 * Loads the signed-in user's provider application and submits new ones.
 *
 * Submission is guarded twice: the form disables its controls, and this hook
 * ignores a second call while the first is in flight. The database unique
 * constraint on providers.owner_id remains the final guard against duplicates.
 */
export function useProviderApplication() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [application, setApplication] = useState<ProviderApplication | null>(null);
  const [loadStatus, setLoadStatus] =
    useState<ProviderApplicationLoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestId = useRef(0);
  const submittingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!supabase || !userId) {
      setApplication(null);
      setLoadStatus("error");
      setLoadError("You need to be signed in to check a provider application.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setLoadStatus("loading");
    setLoadError(null);

    const result = await loadProviderApplication(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setApplication(null);
      setLoadError(result.error);
      setLoadStatus("error");
      return;
    }

    setApplication(result.application);
    setLoadStatus("ready");
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      // Ignore a late response from a previous user/session.
      requestId.current += 1;
    };
  }, [reload]);

  const submit = useCallback(
    async (
      kind: ProviderKind,
      displayName: string,
    ): Promise<ProviderSubmissionOutcome> => {
      if (submittingRef.current) {
        return {
          error: "Your application is already being submitted.",
          duplicate: false,
        };
      }
      if (!supabase || !userId) {
        return {
          error: "You need to be signed in to apply as a provider.",
          duplicate: false,
        };
      }

      submittingRef.current = true;
      setSubmitting(true);
      try {
        const result = await submitProviderApplication(supabase, {
          ownerId: userId,
          kind,
          displayName,
        });

        if (result.ok) {
          setApplication(result.application);
          setLoadStatus("ready");
          setLoadError(null);
          return { error: null, duplicate: false };
        }

        // A unique owner_id means this account already applied — possibly in
        // another tab or an earlier session. Show the existing record instead
        // of leaving the applicant on a form that can never succeed.
        if (result.duplicate) {
          const existing = await loadProviderApplication(supabase);
          if (existing.application) {
            setApplication(existing.application);
            setLoadStatus("ready");
            setLoadError(null);
          }
        }

        return { error: result.error, duplicate: result.duplicate };
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [userId],
  );

  return {
    application,
    loadStatus,
    loadError,
    submitting,
    reload,
    submit,
  };
}
