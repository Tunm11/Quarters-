import { useCallback, useEffect, useRef, useState } from "react";
import type { RoommateVerificationRow } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/use-auth";
import {
  loadMyVerification,
  standingOf,
  traitScoresFromVerification,
  type RoommateStanding,
  type TraitScores,
} from "@/roommates/verification";

export type RoommateVerificationLoadStatus = "loading" | "ready" | "error";

/**
 * The signed-in student's own roommate verification.
 *
 * Standing drives the discovery gate. `apply` lets the verification form show a
 * freshly saved row without a full reload.
 */
export function useRoommateVerification() {
  const { status: authStatus, user } = useAuth();
  const [verification, setVerification] = useState<RoommateVerificationRow | null>(null);
  const [status, setStatus] = useState<RoommateVerificationLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (authStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (!user) {
      setVerification(null);
      setStatus("ready");
      setError(null);
      return;
    }
    if (!supabase) {
      setVerification(null);
      setStatus("error");
      setError("Roommate verification is unavailable because Supabase is not configured.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadMyVerification(supabase, user.id);
    if (request !== requestId.current) return;

    if (result.error) {
      setVerification(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setVerification(result.verification);
    setStatus("ready");
  }, [authStatus, user]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const apply = useCallback((row: RoommateVerificationRow) => {
    setVerification(row);
    setError(null);
    setStatus("ready");
  }, []);

  const standing: RoommateStanding = standingOf(verification);
  const traits: TraitScores | null = verification
    ? traitScoresFromVerification(verification)
    : null;

  return { verification, status, error, standing, traits, reload, apply };
}
