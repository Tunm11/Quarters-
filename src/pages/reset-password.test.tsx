import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/auth/auth-provider";
import ResetPasswordPage from "@/pages/reset-password";

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
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
    ...overrides,
  };
}

function renderResetPage(value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const signedInValue = (
  updatePassword: AuthContextValue["updatePassword"] = async () => ({ error: null }),
) =>
  createAuthValue({
    status: "signedIn",
    passwordRecovery: true,
    user: { id: "user-1", email: "student@example.com" } as AuthContextValue["user"],
    updatePassword,
  });

describe("ResetPasswordPage", () => {
  it("explains an expired link and offers a fresh reset request", () => {
    renderResetPage(createAuthValue({ status: "signedOut" }));

    expect(screen.getByText("This reset link has expired")).toBeTruthy();
    expect(
      screen.getByRole("form", { name: "Password reset request form" }),
    ).toBeTruthy();
  });

  it("rejects a short password without calling Supabase", () => {
    const updatePassword = vi.fn(async () => ({ error: null as string | null }));
    renderResetPage(signedInValue(updatePassword));

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("saves a confirmed password and confirms only after Supabase succeeds", async () => {
    const updatePassword = vi.fn(async () => ({ error: null as string | null }));
    renderResetPage(signedInValue(updatePassword));

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith("new-password-1");
    });
    expect(await screen.findByText("Password updated")).toBeTruthy();
  });

  it("surfaces a Supabase failure instead of claiming success", async () => {
    const updatePassword = vi.fn(async () => ({
      error: "Choose a password you have not used on this account before." as string | null,
    }));
    renderResetPage(signedInValue(updatePassword));

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(
      await screen.findByText(
        "Choose a password you have not used on this account before.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Password updated")).toBeNull();
  });
});
