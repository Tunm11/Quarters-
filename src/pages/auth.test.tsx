import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "@/auth/auth-provider";
import AuthPage from "@/pages/auth";

const signedOutValue: AuthContextValue = {
  status: "signedOut",
  session: null,
  user: null,
  profile: null,
  profileStatus: "idle",
  profileError: null,
  avatarUrl: null,
  configProblem: null,
  configMissingKeys: [],
  sessionError: null,
  passwordRecovery: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({
    error: null,
    requiresEmailConfirmation: false,
    alreadyRegistered: false,
  }),
  confirmSignUp: async () => ({ error: null }),
  resendConfirmation: async () => ({ error: null }),
  sendEmailCode: async () => ({ error: null }),
  verifyEmailCode: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  verifyRecoveryCode: async () => ({ error: null }),
  clearPasswordRecovery: () => {},
  signOut: async () => ({ error: null }),
  signOutOthers: async () => ({ error: null }),
  signOutEverywhere: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  saveDisplayName: async () => ({ error: null }),
  changeEmail: async () => ({
    error: null,
    changedImmediately: false,
    pendingEmail: null,
  }),
  uploadAvatar: async () => ({ error: null }),
  removeAvatar: async () => ({ error: null }),
  deleteAccount: async () => ({ error: null }),
  retryProfile: () => {},
};

function renderAuthPage() {
  return render(
    <AuthContext.Provider value={signedOutValue}>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AuthPage", () => {
  it("renders the real sign-in fields and no prefilled credentials", () => {
    renderAuthPage();

    const form = screen.getByRole("form", { name: "Authentication form" });

    expect(within(form).getByLabelText("Email")).toBeTruthy();
    expect(within(form).getByLabelText("Password")).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect((within(form).getByLabelText("Email") as HTMLInputElement).value).toBe("");
  });

  it("switches to sign-up and offers an optional display name", () => {
    renderAuthPage();

    const modeButtons = screen.getAllByRole("button", { name: "Create account" });
    const createAccountMode = modeButtons[0];
    if (!createAccountMode) {
      throw new Error("Create-account mode toggle was not rendered");
    }
    fireEvent.click(createAccountMode);

    expect(screen.getByText("Create your account")).toBeTruthy();
    expect(screen.getByLabelText("Display name (optional)")).toBeTruthy();
  });

  it("opens the forgot-password request from sign-in", () => {
    renderAuthPage();

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(
      screen.getByRole("form", { name: "Password reset request form" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send reset email" })).toBeTruthy();
  });

  it("offers passwordless sign-in with an emailed one-time code", () => {
    renderAuthPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with a one-time code" }),
    );

    expect(
      screen.getByRole("form", { name: "Email code sign-in form" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeTruthy();
  });

  it("offers an accessible password visibility toggle", () => {
    renderAuthPage();

    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
  });
});
