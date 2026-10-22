import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ensureProfile, updateDisplayName } from "@/auth/profile";
import type { ProfileRow } from "@/lib/database.types";
import { mapAuthError, validateDisplayName } from "@/lib/auth-errors";
import { describeSupabaseConfigProblem, type SupabaseEnvKey } from "@/lib/supabase-config";
import { supabase, supabaseConfig } from "@/lib/supabase";

export type AuthStatus = "loading" | "unconfigured" | "signedOut" | "signedIn";
export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export type AuthActionResult = { error: string | null };
export type SignUpResult = AuthActionResult & { requiresEmailConfirmation: boolean };

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  profileStatus: ProfileStatus;
  profileError: string | null;
  /** Explains missing/invalid Supabase configuration without printing values. */
  configProblem: string | null;
  configMissingKeys: SupabaseEnvKey[];
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<AuthActionResult>;
  saveDisplayName: (displayName: string) => Promise<AuthActionResult>;
  retryProfile: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const configProblem =
  supabaseConfig.status === "invalid"
    ? describeSupabaseConfigProblem(supabaseConfig)
    : null;
const configMissingKeys: SupabaseEnvKey[] =
  supabaseConfig.status === "invalid"
    ? [...supabaseConfig.missing, ...supabaseConfig.invalid]
    : [];

/**
 * Owns the single Supabase auth subscription for the app.
 *
 * - The client is created once in `src/lib/supabase.ts`.
 * - Exactly one `onAuthStateChange` listener is registered; the effect cleanup
 *   unsubscribes it, so StrictMode double-mounting cannot leave duplicates.
 * - `getSession()` covers older client behaviour while the listener's initial
 *   event resolves first in practice; a guard stops a stale read from
 *   overwriting a newer auth event.
 * - Protected routes stay in "loading" until this initial check resolves.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "unconfigured");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileReloadToken, setProfileReloadToken] = useState(0);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setStatus(nextSession ? "signedIn" : "signedOut");
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStatus("unconfigured");
      return;
    }

    let active = true;
    let authEventHandled = false;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventHandled = true;
      if (!active) return;
      setSessionError(null);
      applySession(nextSession);
    });

    void supabase.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!active || authEventHandled) return;
        if (error) {
          setSessionError(mapAuthError(error));
          applySession(null);
          return;
        }
        applySession(sessionData.session);
      })
      .catch(() => {
        if (!active) return;
        setSessionError("Your saved session could not be restored. Sign in again.");
        applySession(null);
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySession]);

  const currentUser = session?.user ?? null;
  const userId = currentUser?.id ?? null;

  useEffect(() => {
    if (!supabase || !currentUser) {
      setProfile(null);
      setProfileStatus("idle");
      setProfileError(null);
      return;
    }

    let active = true;
    setProfileStatus("loading");
    setProfileError(null);

    void ensureProfile(supabase, currentUser).then((result) => {
      if (!active) return;
      if (result.profile) {
        setProfile(result.profile);
        setProfileStatus("ready");
        return;
      }
      setProfile(null);
      setProfileError(result.error);
      setProfileStatus("error");
    });

    return () => {
      active = false;
    };
    // Keyed on the user id (not the whole user object) so a token refresh does
    // not reload the profile, plus an explicit retry token.
  }, [userId, profileReloadToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    if (!data.session) {
      return {
        error:
          "Supabase accepted the request but did not return a session. Confirm your email address, then sign in again.",
      };
    }
    setSessionError(null);
    applySession(data.session);
    return { error: null };
  }, [applySession]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!supabase) {
        return {
          error: configProblem ?? "Supabase is not configured.",
          requiresEmailConfirmation: false,
        };
      }

      const name = displayName?.trim() ?? "";
      const nameError = validateDisplayName(name);
      if (nameError) {
        return { error: nameError, requiresEmailConfirmation: false };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: name ? { display_name: name } : undefined,
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        return { error: mapAuthError(error), requiresEmailConfirmation: false };
      }
      if (data.session) {
        setSessionError(null);
        applySession(data.session);
        return { error: null, requiresEmailConfirmation: false };
      }
      if (!data.user) {
        return {
          error: "Supabase accepted the request but did not return a user.",
          requiresEmailConfirmation: false,
        };
      }
      // No session: the project requires email confirmation before signing in.
      return { error: null, requiresEmailConfirmation: true };
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: mapAuthError(error) };
    }
    applySession(null);
    return { error: null };
  }, [applySession]);

  const saveDisplayName = useCallback(
    async (displayName: string) => {
      if (!supabase || !userId) {
        return { error: "You need to be signed in to update your profile." };
      }
      const trimmed = displayName.trim();
      const validationError = validateDisplayName(trimmed);
      if (validationError) {
        return { error: validationError };
      }
      const result = await updateDisplayName(
        supabase,
        userId,
        trimmed.length > 0 ? trimmed : null,
      );
      if (result.profile) {
        setProfile(result.profile);
        setProfileStatus("ready");
        setProfileError(null);
        return { error: null };
      }
      return { error: result.error };
    },
    [userId],
  );

  const retryProfile = useCallback(() => {
    setProfileReloadToken((token) => token + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: currentUser,
      profile,
      profileStatus,
      profileError,
      configProblem,
      configMissingKeys,
      sessionError,
      signIn,
      signUp,
      signOut,
      saveDisplayName,
      retryProfile,
    }),
    [
      status,
      session,
      currentUser,
      profile,
      profileStatus,
      profileError,
      sessionError,
      signIn,
      signUp,
      signOut,
      saveDisplayName,
      retryProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
