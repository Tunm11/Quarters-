import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";

type Listener = (event: string, session: unknown) => void;

const mocks = vi.hoisted(() => {
  const profileRow = {
    id: "user-1",
    display_name: "Ada",
    avatar_url: null,
    created_at: "2026-10-22T14:00:00.000Z",
    updated_at: "2026-10-22T14:00:00.000Z",
  };
  const session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: "user-1",
      email: "student@example.com",
      user_metadata: {},
    },
  };
  const listeners = new Set<Listener>();
  const signOutResult: { error: Record<string, unknown> | null } = { error: null };
  const updateResult: {
    data: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  } = { data: profileRow, error: null };

  const client = {
    auth: {
      onAuthStateChange: (callback: Listener) => {
        listeners.add(callback);
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener("INITIAL_SESSION", session);
          }
        });
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async () => signOutResult,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profileRow, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => updateResult,
          }),
        }),
      }),
    }),
  };

  return { client, listeners, profileRow, signOutResult, updateResult };
});

vi.mock("@/lib/supabase", () => ({
  supabase: mocks.client,
  supabaseConfig: {
    status: "configured",
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <AuthProvider>{children}</AuthProvider>
    </StrictMode>
  );
}

describe("AuthProvider with a restored session", () => {
  beforeEach(() => {
    mocks.signOutResult.error = null;
    mocks.updateResult.data = mocks.profileRow;
    mocks.updateResult.error = null;
  });

  it("restores the session and loads the existing profile", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedIn");
      expect(result.current.profileStatus).toBe("ready");
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.profile).toEqual(mocks.profileRow);
    expect(result.current.profileError).toBeNull();
  });

  it("keeps the session and reports a sign-out failure", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedIn");
    });

    mocks.signOutResult.error = {
      name: "AuthApiError",
      message: "session not found",
      status: 400,
      code: "session_not_found",
    };

    let outcome: { error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.signOut();
    });

    expect(outcome?.error).toBe("Your session has expired. Sign in again.");
    expect(result.current.status).toBe("signedIn");
    expect(result.current.session).not.toBeNull();
  });

  it("clears the session only after a successful sign-out", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedIn");
    });

    let outcome: { error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.signOut();
    });

    expect(outcome?.error).toBeNull();
    expect(result.current.status).toBe("signedOut");
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("reports a profile-update failure without replacing the profile", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.profileStatus).toBe("ready");
    });

    mocks.updateResult.data = null;
    mocks.updateResult.error = {
      code: "42501",
      message: "permission denied for table profiles",
      details: null,
      hint: null,
    };

    let outcome: { error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.saveDisplayName("Grace");
    });

    expect(outcome?.error).toBe("Your account is not allowed to change that profile.");
    expect(result.current.profile).toEqual(mocks.profileRow);
    expect(result.current.profileError).toBeNull();
  });

  it("applies a successful profile update", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.profileStatus).toBe("ready");
    });

    const updated = { ...mocks.profileRow, display_name: "Grace" };
    mocks.updateResult.data = updated;

    let outcome: { error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.saveDisplayName("Grace");
    });

    expect(outcome?.error).toBeNull();
    expect(result.current.profile).toEqual(updated);
  });
});
