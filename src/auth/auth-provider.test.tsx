import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";

type Listener = (event: string, session: null) => void;

const mocks = vi.hoisted(() => {
  const listeners = new Set<Listener>();
  const client = {
    auth: {
      onAuthStateChange: (callback: Listener) => {
        listeners.add(callback);
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener("INITIAL_SESSION", null);
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
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { session: null, user: null },
        error: {
          name: "AuthApiError",
          message: "Invalid login credentials",
          status: 400,
          code: "invalid_credentials",
        },
      }),
      signUp: async () => ({
        data: {
          session: null,
          user: {
            id: "user-1",
            email: "new-student@example.com",
            user_metadata: {},
          },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => {
      throw new Error("The profiles table must not be queried without a session");
    },
  };
  return { client, listeners };
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

describe("AuthProvider", () => {
  it("keeps one auth subscription, restores a signed-out state, and cleans up", async () => {
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedOut");
    });

    expect(mocks.listeners.size).toBe(1);
    expect(result.current.session).toBeNull();

    unmount();

    expect(mocks.listeners.size).toBe(0);
  });

  it("reports a Supabase sign-in failure instead of signing in", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedOut");
    });

    let outcome: { error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.signIn("student@example.com", "wrong-password");
    });

    expect(outcome?.error).toBe("Email or password is incorrect.");
    expect(result.current.status).toBe("signedOut");
    expect(result.current.session).toBeNull();
  });

  it("requires email confirmation when Supabase returns no session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("signedOut");
    });

    let outcome: { error: string | null; requiresEmailConfirmation: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.signUp("new-student@example.com", "password123");
    });

    expect(outcome?.error).toBeNull();
    expect(outcome?.requiresEmailConfirmation).toBe(true);
    expect(result.current.status).toBe("signedOut");
    expect(result.current.session).toBeNull();
  });
});
