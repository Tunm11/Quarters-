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
  configProblem: null,
  configMissingKeys: [],
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, requiresEmailConfirmation: false }),
  signOut: async () => ({ error: null }),
  saveDisplayName: async () => ({ error: null }),
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
