import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  accountAvatarUrl,
  removeAccountAvatar,
  uploadAccountAvatar,
} from "@/auth/avatar";
import { ensureProfile, updateAvatarPath, updateDisplayName } from "@/auth/profile";
import type { ProfileRow } from "@/lib/database.types";
import {
  mapAuthError,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-errors";
import { describeSupabaseConfigProblem, type SupabaseEnvKey } from "@/lib/supabase-config";
import { supabase, supabaseConfig } from "@/lib/supabase";

export type AuthStatus = "loading" | "unconfigured" | "signedOut" | "signedIn";
export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export type AuthActionResult = { error: string | null };
export type EmailChangeResult = AuthActionResult & {
  /** True when Supabase applied the address immediately (confirmation is off). */
  changedImmediately: boolean;
  /** The address waiting for confirmation, if Supabase did not change it yet. */
  pendingEmail: string | null;
};
export type SignUpResult = AuthActionResult & {
  requiresEmailConfirmation: boolean;
  /**
   * True when Supabase answered a sign-up for an email that already has an
   * account. Supabase deliberately hides this in the payload (an obfuscated
   * user with no identities) and sends no email, so the UI must not claim one
   * is on the way.
   */
  alreadyRegistered: boolean;
};

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  profileStatus: ProfileStatus;
  profileError: string | null;
  /** Signed URL for the account photo; null when there is none or signing failed. */
  avatarUrl: string | null;
  /** Explains missing/invalid Supabase configuration without printing values. */
  configProblem: string | null;
  configMissingKeys: SupabaseEnvKey[];
  sessionError: string | null;
  /**
   * True once Supabase reported a password-recovery session for this tab, so
   * the app can send the student to the set-a-new-password screen even when
   * the recovery link landed on another route.
   */
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<SignUpResult>;
  /** Confirms a sign-up with the code from the confirmation email. */
  confirmSignUp: (email: string, code: string) => Promise<AuthActionResult>;
  /** Sends the sign-up confirmation email again. */
  resendConfirmation: (email: string) => Promise<AuthActionResult>;
  /** Emails a one-time sign-in code. Never creates an account. */
  sendEmailCode: (email: string) => Promise<AuthActionResult>;
  /** Signs in with the one-time code emailed by `sendEmailCode`. */
  verifyEmailCode: (email: string, code: string) => Promise<AuthActionResult>;
  /** Emails a password-reset link. Reveals nothing about account existence. */
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  /** Exchanges a reset code for a recovery session. */
  verifyRecoveryCode: (email: string, code: string) => Promise<AuthActionResult>;
  /** Clears the recovery flag once the new password has been saved. */
  clearPasswordRecovery: () => void;
  signOut: () => Promise<AuthActionResult>;
  /** Ends every other session and keeps this device signed in. */
  signOutOthers: () => Promise<AuthActionResult>;
  signOutEverywhere: () => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  saveDisplayName: (displayName: string) => Promise<AuthActionResult>;
  /** Asks Supabase to move the account to a new address (usually by email link). */
  changeEmail: (email: string) => Promise<EmailChangeResult>;
  uploadAvatar: (file: File) => Promise<AuthActionResult>;
  removeAvatar: () => Promise<AuthActionResult>;
  /** Irreversibly deletes the signed-in account through the database RPC. */
  deleteAccount: () => Promise<AuthActionResult>;
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventHandled = true;
      if (!active) return;
      setSessionError(null);
      // A recovery link signs the student in with a short-lived session. Flag
      // it so the app opens the set-a-new-password screen instead of Home.
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
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

  // Sign the stored object path for display. Legacy absolute URLs pass through.
  useEffect(() => {
    let active = true;
    const value = profile?.avatar_url ?? null;
    if (!supabase || !value) {
      setAvatarUrl(null);
      return;
    }
    void accountAvatarUrl(supabase, value).then((url) => {
      if (active) setAvatarUrl(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);

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
          alreadyRegistered: false,
        };
      }

      const name = displayName?.trim() ?? "";
      const nameError = validateDisplayName(name);
      if (nameError) {
        return {
          error: nameError,
          requiresEmailConfirmation: false,
          alreadyRegistered: false,
        };
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
        return {
          error: mapAuthError(error),
          requiresEmailConfirmation: false,
          alreadyRegistered: false,
        };
      }
      if (data.session) {
        setSessionError(null);
        applySession(data.session);
        return {
          error: null,
          requiresEmailConfirmation: false,
          alreadyRegistered: false,
        };
      }
      if (!data.user) {
        return {
          error: "Supabase accepted the request but did not return a user.",
          requiresEmailConfirmation: false,
          alreadyRegistered: false,
        };
      }
      // Supabase returns an empty identities list for an address that is
      // already taken, and sends no confirmation email in that case.
      const alreadyRegistered =
        Array.isArray(data.user.identities) && data.user.identities.length === 0;
      if (alreadyRegistered) {
        return { error: null, requiresEmailConfirmation: false, alreadyRegistered: true };
      }
      // No session: the project requires email confirmation before signing in.
      return { error: null, requiresEmailConfirmation: true, alreadyRegistered: false };
    },
    [applySession],
  );

  const confirmSignUp = useCallback(
    async (email: string, code: string) => {
      if (!supabase) {
        return { error: configProblem ?? "Supabase is not configured." };
      }
      const token = code.replace(/\s+/g, "");
      if (!/^\d{6,10}$/.test(token)) {
        return { error: "Enter the code from the confirmation email." };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "signup",
      });
      if (error) {
        return { error: mapAuthError(error) };
      }
      if (data.session) {
        setSessionError(null);
        applySession(data.session);
      }
      return { error: null };
    },
    [applySession],
  );

  const resendConfirmation = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    return { error: null };
  }, []);

  const sendEmailCode = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const trimmed = email.trim();
    const validationError = validateEmail(trimmed);
    if (validationError) {
      return { error: validationError };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // A sign-in screen must not create accounts; new students use sign-up.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    return { error: null };
  }, []);

  const verifyEmailCode = useCallback(
    async (email: string, code: string) => {
      if (!supabase) {
        return { error: configProblem ?? "Supabase is not configured." };
      }
      const token = code.replace(/\s+/g, "");
      if (!/^\d{6,10}$/.test(token)) {
        return { error: "Enter the code from the email." };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
      if (error) {
        return { error: mapAuthError(error) };
      }
      if (!data.session) {
        return {
          error:
            "Supabase accepted the code but did not return a session. Request a new code and try again.",
        };
      }
      setSessionError(null);
      applySession(data.session);
      return { error: null };
    },
    [applySession],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const trimmed = email.trim();
    const validationError = validateEmail(trimmed);
    if (validationError) {
      return { error: validationError };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    // Supabase answers the same way whether or not the address has an account.
    return { error: null };
  }, []);

  const verifyRecoveryCode = useCallback(
    async (email: string, code: string) => {
      if (!supabase) {
        return { error: configProblem ?? "Supabase is not configured." };
      }
      const token = code.replace(/\s+/g, "");
      if (!/^\d{6,10}$/.test(token)) {
        return { error: "Enter the reset code from the email." };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "recovery",
      });
      if (error) {
        return { error: mapAuthError(error) };
      }
      if (!data.session) {
        return {
          error:
            "Supabase accepted the code but did not start a recovery session. Request a new reset email and try again.",
        };
      }
      setSessionError(null);
      setPasswordRecovery(true);
      applySession(data.session);
      return { error: null };
    },
    [applySession],
  );

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: mapAuthError(error) };
    }
    setPasswordRecovery(false);
    applySession(null);
    return { error: null };
  }, [applySession]);

  const signOutOthers = useCallback(async () => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    // Supabase deletes the refresh tokens of every other session and leaves
    // this one alone, so the student stays signed in here.
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      return { error: mapAuthError(error) };
    }
    return { error: null };
  }, []);

  const signOutEverywhere = useCallback(async () => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      return { error: mapAuthError(error) };
    }
    setPasswordRecovery(false);
    applySession(null);
    return { error: null };
  }, [applySession]);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) {
      return { error: configProblem ?? "Supabase is not configured." };
    }
    const validationError = validatePassword(password, "signUp");
    if (validationError) {
      return { error: validationError };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: mapAuthError(error) };
    }
    return { error: null };
  }, []);

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

  const changeEmail = useCallback(
    async (email: string): Promise<EmailChangeResult> => {
      if (!supabase || !currentUser) {
        return {
          error: "You need to be signed in to change your email address.",
          changedImmediately: false,
          pendingEmail: null,
        };
      }

      const trimmed = email.trim();
      const validationError = validateEmail(trimmed);
      if (validationError) {
        return { error: validationError, changedImmediately: false, pendingEmail: null };
      }
      if (
        currentUser.email?.toLowerCase() === trimmed.toLowerCase() ||
        currentUser.new_email?.toLowerCase() === trimmed.toLowerCase()
      ) {
        return {
          error:
            "That is already the email on this account, or the address waiting for confirmation.",
          changedImmediately: false,
          pendingEmail: null,
        };
      }

      const { data, error } = await supabase.auth.updateUser(
        { email: trimmed },
        // The confirmation link returns to this app rather than the project's
        // default site URL, matching the sign-up confirmation flow.
        { emailRedirectTo: `${window.location.origin}/auth` },
      );
      if (error) {
        return {
          error: mapAuthError(error),
          changedImmediately: false,
          pendingEmail: null,
        };
      }

      const nextUser = data.user;
      if (nextUser) {
        // Reflect the pending address (or the new one) without waiting for the
        // auth event, so the screen updates as soon as Supabase answers.
        setSession((current) => (current ? { ...current, user: nextUser } : current));
      }

      const pendingEmail = nextUser?.new_email ?? null;
      const changedImmediately =
        !pendingEmail && nextUser?.email?.toLowerCase() === trimmed.toLowerCase();

      return { error: null, changedImmediately, pendingEmail };
    },
    [currentUser],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!supabase || !userId) {
        return { error: "You need to be signed in to add a photo." };
      }

      const upload = await uploadAccountAvatar(supabase, userId, file);
      if (!upload.path) {
        return { error: upload.error ?? "Could not upload that photo." };
      }

      const previous = profile?.avatar_url ?? null;
      const result = await updateAvatarPath(supabase, userId, upload.path);
      if (!result.profile) {
        // Do not leave an unreferenced upload behind if the row did not save.
        void removeAccountAvatar(supabase, userId, upload.path);
        return { error: result.error };
      }

      setProfile(result.profile);
      setProfileStatus("ready");
      setProfileError(null);
      if (previous && previous !== upload.path) {
        void removeAccountAvatar(supabase, userId, previous);
      }
      return { error: null };
    },
    [userId, profile?.avatar_url],
  );

  const removeAvatar = useCallback(async () => {
    if (!supabase || !userId) {
      return { error: "You need to be signed in to change your photo." };
    }
    const previous = profile?.avatar_url ?? null;
    if (!previous) return { error: null };

    const result = await updateAvatarPath(supabase, userId, null);
    if (!result.profile) {
      return { error: result.error };
    }

    setProfile(result.profile);
    setProfileStatus("ready");
    setProfileError(null);
    void removeAccountAvatar(supabase, userId, previous);
    return { error: null };
  }, [userId, profile?.avatar_url]);

  const deleteAccount = useCallback(async () => {
    if (!supabase || !userId) {
      return { error: "You need to be signed in to delete your account." };
    }

    const { error } = await supabase.rpc("delete_own_account", { p_confirm: "DELETE" });
    if (error) {
      return { error: mapAccountDeletionError(error) };
    }

    // The auth user is gone, so the local session is cleared rather than ended
    // with a server call that would fail against the deleted account.
    setPasswordRecovery(false);
    applySession(null);
    setProfile(null);
    setProfileStatus("idle");
    void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: null };
  }, [userId, applySession]);

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
      avatarUrl,
      configProblem,
      configMissingKeys,
      sessionError,
      passwordRecovery,
      signIn,
      signUp,
      confirmSignUp,
      resendConfirmation,
      sendEmailCode,
      verifyEmailCode,
      requestPasswordReset,
      verifyRecoveryCode,
      clearPasswordRecovery,
      signOut,
      signOutOthers,
      signOutEverywhere,
      updatePassword,
      saveDisplayName,
      changeEmail,
      uploadAvatar,
      removeAvatar,
      deleteAccount,
      retryProfile,
    }),
    [
      status,
      session,
      currentUser,
      profile,
      profileStatus,
      profileError,
      avatarUrl,
      sessionError,
      passwordRecovery,
      signIn,
      signUp,
      confirmSignUp,
      resendConfirmation,
      sendEmailCode,
      verifyEmailCode,
      requestPasswordReset,
      verifyRecoveryCode,
      clearPasswordRecovery,
      signOut,
      signOutOthers,
      signOutEverywhere,
      updatePassword,
      saveDisplayName,
      changeEmail,
      uploadAvatar,
      removeAvatar,
      deleteAccount,
      retryProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Account deletion failures, mapped to what the student can do about them.
 * P0001 is raised by delete_own_account() with a ready-to-read sentence (an
 * open booking, or an account that no longer exists).
 */
function mapAccountDeletionError(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "42883":
    case "PGRST202":
      return "Account deletion is not enabled on this database yet. The account migration has not been applied.";
    case "42501":
      return "Sign in again to delete your account.";
    case "22023":
      return "Type DELETE to confirm account deletion.";
    case "P0001":
      return error.message || "This account cannot be deleted right now.";
    default:
      return "Could not delete your account. Please try again.";
  }
}
