import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import { loadMyReports, type MyReport } from "@/settings/my-reports";

export type MyReportsStatus = "loading" | "ready" | "error";

/** The reports the signed-in student filed, with a reload for the caller. */
export function useMyReports() {
  const { status: authStatus, user } = useAuth();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [status, setStatus] = useState<MyReportsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (authStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (!user) {
      setReports([]);
      setError(null);
      setStatus("ready");
      return;
    }
    if (!supabase) {
      setReports([]);
      setError("Your reports are unavailable because Supabase is not configured.");
      setStatus("error");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus("loading");
    setError(null);

    const result = await loadMyReports(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setReports([]);
      setError(result.error);
      setStatus("error");
      return;
    }

    setReports(result.reports);
    setStatus("ready");
  }, [authStatus, user]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { reports, status, error, reload };
}
