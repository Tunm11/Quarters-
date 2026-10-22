import { describe, expect, it } from "vitest";
import {
  describeSupabaseConfigProblem,
  parseSupabaseConfig,
} from "@/lib/supabase-config";

const VALID_URL = "https://project-ref.supabase.co";
const VALID_KEY = "sb_publishable_test-value";

describe("parseSupabaseConfig", () => {
  it("accepts a valid URL and publishable key", () => {
    const config = parseSupabaseConfig({
      VITE_SUPABASE_URL: VALID_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    });

    expect(config.status).toBe("configured");
    if (config.status === "configured") {
      expect(config.url).toBe(VALID_URL);
      expect(config.publishableKey).toBe(VALID_KEY);
    }
  });

  it("reports both variables when the environment is empty", () => {
    const config = parseSupabaseConfig({});

    expect(config).toEqual({
      status: "invalid",
      missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
      invalid: [],
    });
    expect(describeSupabaseConfigProblem(config)).toContain("VITE_SUPABASE_URL");
  });

  it("treats whitespace-only values as missing", () => {
    const config = parseSupabaseConfig({
      VITE_SUPABASE_URL: "   ",
      VITE_SUPABASE_PUBLISHABLE_KEY: "  ",
    });

    expect(config.status).toBe("invalid");
    if (config.status === "invalid") {
      expect(config.missing).toEqual([
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      ]);
    }
  });

  it("flags a malformed URL without printing its value", () => {
    const config = parseSupabaseConfig({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    });

    expect(config.status).toBe("invalid");
    if (config.status === "invalid") {
      expect(config.invalid).toEqual(["VITE_SUPABASE_URL"]);
      expect(config.missing).toEqual([]);
      expect(describeSupabaseConfigProblem(config)).not.toContain("not-a-url");
    }
  });

  it("rejects non-http protocols", () => {
    const config = parseSupabaseConfig({
      VITE_SUPABASE_URL: "javascript:alert(1)",
      VITE_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    });

    expect(config.status).toBe("invalid");
  });

  it("does not require a real key format so legacy anon keys still work", () => {
    const config = parseSupabaseConfig({
      VITE_SUPABASE_URL: VALID_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "legacy-anon-key",
    });

    expect(config.status).toBe("configured");
  });
});
