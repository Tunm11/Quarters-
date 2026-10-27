import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";

export const RESET_PASSWORD_PATH = "/reset-password";

/**
 * A Supabase recovery link signs the browser in wherever the link lands, which
 * is the project's Site URL when `/reset-password` is not allow-listed. This
 * sends that verified recovery session to the screen that can actually set a
 * new password, instead of dropping the student on Home.
 */
export function RecoveryRedirect() {
  const { status, passwordRecovery } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (status !== "signedIn" || !passwordRecovery) return;
    if (pathname === RESET_PASSWORD_PATH) return;
    navigate(RESET_PASSWORD_PATH, { replace: true });
  }, [status, passwordRecovery, pathname, navigate]);

  return null;
}
