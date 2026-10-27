import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadOwnSessions,
  revokeSession,
  type AuthSession,
} from "@/auth/sessions";

export type SessionListStatus = "loading" | "ready" | "error";

/**
 * The account's signed-in devices, read from Supabase Auth.
 *
 * The list is fetched on mount, can be re-fetched, and shrinks locally as a
 * session is revoked, so a row never lingers after the database has dropped it.
 * Every call reports the real answer: an unreachable RPC sets `error` instead of
 * showing an invented device list.
 */
export function useAuthSessions({ userId }: { userId: string | null }) {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [status, setStatus] = useState<SessionListStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setSessions([]);
      setError(null);
      setStatus("ready");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");

    const result = await loadOwnSessions(client);
    if (request !== requestId.current) return;

    setSessions(result.sessions);
    setError(result.error);
    setStatus(result.error ? "error" : "ready");
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const revoke = useCallback(async (sessionId: string): Promise<string | null> => {
    const client = supabase;
    if (!client) return "Sign in to manage your sessions.";

    setRevokingId(sessionId);
    setNotice(null);
    try {
      const result = await revokeSession(client, sessionId);
      if (result.error) {
        setError(result.error);
        return result.error;
      }
      setError(null);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setNotice("Session ended. That device must sign in again.");
      return null;
    } finally {
      setRevokingId(null);
    }
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { sessions, status, error, revokingId, notice, clearNotice, reload, revoke };
}
