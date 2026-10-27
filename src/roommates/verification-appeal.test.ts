import { describe, expect, it } from "vitest";
import {
  appealReasonLabel,
  appealStatusMeta,
  validateAppeal,
} from "@/roommates/verification-appeal";

describe("verification appeal validation", () => {
  it("requires a reason", () => {
    expect(validateAppeal("", "x".repeat(40))).toBe(
      "Choose why you are asking for another review.",
    );
  });

  it("requires a useful explanation", () => {
    expect(validateAppeal("corrected", "Too short")).toBe(
      "Explain what changed in at least 30 characters.",
    );
    expect(
      validateAppeal(
        "corrected",
        "I removed the shared number and added my own student number.",
      ),
    ).toBeNull();
  });

  it("rejects an overlong explanation", () => {
    expect(validateAppeal("mistake", "x".repeat(1001))).toContain("1000");
  });

  it("labels reasons and statuses", () => {
    expect(appealReasonLabel("impersonation")).toBe("Someone used my details");
    expect(appealStatusMeta("pending").tone).toBe("caution");
    expect(appealStatusMeta("approved").tone).toBe("positive");
    expect(appealStatusMeta("declined").description).toContain("kept the current");
  });
});
