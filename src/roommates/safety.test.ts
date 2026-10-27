import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  mapSafetyError,
  reportReasonLabel,
  validateReport,
} from "@/roommates/safety";

function postgrestError(overrides: Partial<PostgrestError> = {}): PostgrestError {
  return {
    message: "error",
    details: "",
    hint: "",
    code: "XX000",
    ...overrides,
  } as PostgrestError;
}

describe("roommate report validation", () => {
  it("requires a reason", () => {
    expect(validateReport("", "")).toBe("Choose a reason for the report.");
  });

  it("allows optional details for a listed reason", () => {
    expect(validateReport("harassment", "")).toBeNull();
    expect(validateReport("scam", "Asked for a deposit before any viewing.")).toBeNull();
  });

  it("asks for enough detail when the reason is other", () => {
    expect(validateReport("other", "Too short")).toBe(
      "Add at least 10 characters so we know what happened.",
    );
    expect(validateReport("other", "They sent a suspicious link on WhatsApp.")).toBeNull();
  });

  it("rejects details over the limit", () => {
    expect(validateReport("harassment", "x".repeat(1001))).toContain("1000");
  });

  it("labels every reason", () => {
    expect(reportReasonLabel("fake_profile")).toBe("Fake profile or impersonation");
    expect(reportReasonLabel("safety")).toBe("Safety concern");
  });
});

describe("safety error mapping", () => {
  it("names the missing migration instead of claiming success", () => {
    expect(mapSafetyError(postgrestError({ code: "42P01" }), "report")).toContain(
      "safety migration has not been applied",
    );
  });

  it("explains a duplicate report and a duplicate block separately", () => {
    expect(mapSafetyError(postgrestError({ code: "23505" }), "report")).toContain(
      "already have an open report",
    );
    expect(mapSafetyError(postgrestError({ code: "23505" }), "block")).toContain(
      "already blocked",
    );
  });

  it("maps a block refusal", () => {
    expect(mapSafetyError(postgrestError({ code: "42501" }), "block")).toContain(
      "cannot block",
    );
  });
});
