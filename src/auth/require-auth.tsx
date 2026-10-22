import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { LoadingState } from "@/components/feedback/loading-state";
import { SupabaseConfigNotice } from "@/components/auth/supabase-config-notice";

/**
 * Access gate for authenticated screens.
 *
 * The initial Supabase session check runs while `status` is "loading"; nothing
 * is rendered or redirected until it settles, so a saved session never causes a
 * flash of the sign-in page. Signed-out visitors are sent to /auth with the
 * path they wanted, which is validated again before redirecting back.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <LoadingState
          variant="page"
          label="Checking your session"
          description="Waiting for Supabase to restore any saved session."
        />
      </div>
    );
  }

  if (status === "unconfigured") {
    return <SupabaseConfigNotice />;
  }

  if (status === "signedOut") {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate replace to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} />;
  }

  return <>{children}</>;
}
