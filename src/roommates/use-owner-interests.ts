import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  decideInterest,
  loadOwnerInterests,
  type InterestDecision,
  type OwnerInterest,
} from "@/roommates/owner-interests";

export type OwnerInterestsStatus = "loading" | "ready" | "error";

/**
 * Interests addressed to the viewer's own roommate profiles, plus the
 * accept/decline action. Decided rows stay in the list as a record instead of
 * disappearing, so the owner can see what they chose.
 */
export function useOwnerInterests() {
  const { user } = useAuth();
  const [interests, setInterests] = useState<OwnerInterest[]>([]);
  const [status, setStatus] = useState<OwnerInterestsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!supabase || !userId) {
      setInterests([]);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadOwnerInterests(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setInterests([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setInterests(result.interests);
    setStatus("ready");
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const decide = useCallback(
    async (interestId: string, decision: InterestDecision) => {
      if (!supabase) {
        setDecisionError("Supabase is not configured.");
        return;
      }

      setDecidingId(interestId);
      setDecisionError(null);
      const result = await decideInterest(supabase, interestId, decision);
      setDecidingId(null);

      if (result.error) {
        setDecisionError(result.error);
        return;
      }

      setInterests((current) =>
        current.map((interest) =>
          interest.id === interestId ? { ...interest, status: decision } : interest,
        ),
      );
    },
    [],
  );

  return {
    interests,
    pending: interests.filter((interest) => interest.status === "pending"),
    status,
    error,
    decisionError,
    decidingId,
    reload,
    decide,
  };
}
