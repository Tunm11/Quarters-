import type { AuthError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  mapAuthError,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-errors";

function authError(code: string, message = "raw Supabase message"): AuthError {
  return {
    name: "AuthApiError",
    message,
    status: 400,
    code,
  } as AuthError;
}

describe("form validation", () => {
  it("requires a valid email address", () => {
    expect(validateEmail("")).toBeDefined();
    expect(validateEmail("student")).toBeDefined();
    expect(validateEmail("student@example.com")).toBeUndefined();
  });

  it("only enforces password length on sign-up", () => {
    expect(validatePassword("short", "signUp")).toContain("8");
    expect(validatePassword("short", "signIn")).toBeUndefined();
    expect(validatePassword("", "signIn")).toBeDefined();
  });

  it("allows an empty display name but enforces the database bounds", () => {
    expect(validateDisplayName("")).toBeUndefined();
    expect(validateDisplayName("A")).toBeDefined();
    expect(validateDisplayName("A".repeat(61))).toBeDefined();
    expect(validateDisplayName("Ada")).toBeUndefined();
  });
});

describe("mapAuthError", () => {
  it("explains bad credentials without echoing Supabase's message", () => {
    expect(mapAuthError(authError("invalid_credentials"))).toBe(
      "Email or password is incorrect.",
    );
  });

  it("explains the unconfirmed-email case", () => {
    expect(mapAuthError(authError("email_not_confirmed"))).toContain(
      "confirmation link",
    );
  });

  it("explains rate limiting", () => {
    expect(mapAuthError(authError("over_request_rate_limit"))).toContain(
      "Too many attempts",
    );
  });

  it("falls back to the Supabase message for unknown codes", () => {
    expect(mapAuthError(authError("something_new", "Specific failure"))).toBe(
      "Supabase could not complete that request: Specific failure",
    );
  });
});
