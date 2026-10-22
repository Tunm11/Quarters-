import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "@/auth/auth-provider";
import { RequireAuth } from "@/auth/require-auth";

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
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
    ...overrides,
  };
}

function AuthScreen() {
  const location = useLocation();
  return (
    <>
      <p>Auth screen</p>
      <p data-testid="auth-search">{location.search}</p>
    </>
  );
}

function renderGate(value: AuthContextValue, initialEntry = "/account") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/account"
            element={
              <RequireAuth>
                <p>Protected content</p>
              </RequireAuth>
            }
          />
          <Route path="/auth" element={<AuthScreen />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireAuth", () => {
  it("renders a loading state and no protected content while the session is checked", () => {
    renderGate(createAuthValue({ status: "loading" }));

    expect(screen.getByText("Checking your session")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(screen.queryByText("Auth screen")).toBeNull();
  });

  it("waits for the initial check instead of rendering the sign-in page early", () => {
    renderGate(createAuthValue({ status: "loading" }));

    expect(screen.queryByText("Auth screen")).toBeNull();
  });

  it("redirects signed-out visitors to the auth page", () => {
    renderGate(createAuthValue({ status: "signedOut" }));

    expect(screen.getByText("Auth screen")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("preserves the requested path in the auth redirect", () => {
    renderGate(createAuthValue({ status: "signedOut" }), "/account?tab=profile");

    expect(screen.getByTestId("auth-search").textContent).toBe(
      "?returnTo=%2Faccount%3Ftab%3Dprofile",
    );
  });

  it("renders protected content for a signed-in user", () => {
    renderGate(createAuthValue({ status: "signedIn" }));

    expect(screen.getByText("Protected content")).toBeTruthy();
  });

  it("explains missing configuration rather than redirecting", () => {
    renderGate(
      createAuthValue({
        status: "unconfigured",
        configProblem: "Missing: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.",
        configMissingKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
      }),
    );

    expect(screen.getByText("Supabase is not configured")).toBeTruthy();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
    expect(screen.queryByText("Auth screen")).toBeNull();
  });
});
