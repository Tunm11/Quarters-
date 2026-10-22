import type { AuthError } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 8;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 60;

export type AuthFieldErrors = {
  email?: string;
  password?: string;
  displayName?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) {
    return "Enter your email address.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter an email address in the format name@example.com.";
  }
  return undefined;
}

export function validatePassword(value: string, mode: "signIn" | "signUp"): string | undefined {
  if (!value) {
    return "Enter your password.";
  }
  if (mode === "signUp" && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

/** Optional field: empty is valid, otherwise enforce the database constraint. */
export function validateDisplayName(value: string): string | undefined {
  const name = value.trim();
  if (!name) {
    return undefined;
  }
  if (name.length < DISPLAY_NAME_MIN_LENGTH || name.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Use between ${DISPLAY_NAME_MIN_LENGTH} and ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  return undefined;
}

/**
 * Maps Supabase auth failures to plain, actionable messages. Never claims a
 * success: this only describes an error that Supabase actually returned.
 */
export function mapAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "This email is not confirmed yet. Open the confirmation link Supabase sent you, then sign in.";
    case "user_already_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return `That password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts in a short time. Wait a moment, then try again.";
    case "signup_disabled":
      return "New account creation is disabled for this Supabase project.";
    case "email_provider_disabled":
      return "Email sign-in is disabled for this Supabase project.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has expired. Sign in again.";
    case "validation_failed":
      return "Supabase rejected that email or password. Check the format and try again.";
    default:
      return error.message
        ? `Supabase could not complete that request: ${error.message}`
        : "Supabase could not complete that request. Please try again.";
  }
}
