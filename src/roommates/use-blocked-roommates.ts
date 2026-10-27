import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import {
  loadMyBlocks,
  unblockRoommate,
  type BlockedRoommate,
} from "@/roommates/safety";

export type BlockedRoommatesStatus = "loading" | "ready" | "error";

/** The signed-in student's blocked roommates, with self-service unblocking. */
export function useBlockedRoommates() {
  const { status: authStatus, user } = useAuth();
  const [blocks, setBlocks] = useState<BlockedRoommate[]>([]);
  const [status, setStatus] = useState<BlockedRoommatesStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (authStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (!user) {
      setBlocks([]);
      setError(null);
      setStatus("ready");
      return;
    }
    if (!supabase) {
      setBlocks([]);
      setError("Blocked roommates are unavailable because Supabase is not configured.");
      setStatus("error");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadMyBlocks(supabase, user.id);
    if (request !== requestId.current) return;

    if (result.error) {
      setBlocks([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setBlocks(result.blocks);
    setStatus("ready");
  }, [authStatus, user]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const unblock = useCallback(
    async (profileId: string): Promise<string | null> => {
      if (!supabase || !user) return "Sign in to unblock this roommate.";

      setBusyProfileId(profileId);
      const result = await unblockRoommate(supabase, {
        blockerId: user.id,
        profileId,
      });
      setBusyProfileId(null);

      if (result.error) return result.error;
      setBlocks((current) => current.filter((block) => block.profileId !== profileId));
      return null;
    },
    [user],
  );

  return { blocks, status, error, busyProfileId, reload, unblock };
}
