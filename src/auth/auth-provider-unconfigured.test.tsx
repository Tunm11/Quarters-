import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";

vi.mock("@/lib/supabase", () => ({
  supabase: null,
  supabaseConfig: {
    status: "invalid",
    missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
    invalid: [],
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider without Supabase configuration", () => {
  it("stays unconfigured instead of using fallback auth", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe("unconfigured");
    expect(result.current.session).toBeNull();
    expect(result.current.configMissingKeys).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect(result.current.configProblem).toContain("Missing");
  });
});
