import { describe, expect, it } from "vitest";
import {
  formatRentAmount,
  formatRentTerm,
  formatRentTermShort,
} from "@/listings/listing-detail";

describe("formatRentAmount", () => {
  it("renders naira without decimals", () => {
    expect(formatRentAmount(85000)).toContain("85,000");
    expect(formatRentAmount(85000)).toContain("₦");
    expect(formatRentAmount(0)).toContain("0");
  });
});

describe("formatRentTerm", () => {
  it("uses the stored session length for session-based rents", () => {
    expect(formatRentTerm("term", 9)).toBe("9-month session");
    expect(formatRentTerm("year", 12)).toBe("12 months");
  });

  it("falls back to the period name when no session length is stated", () => {
    expect(formatRentTerm("month", null)).toBe("month");
    expect(formatRentTerm("term", null)).toBe("session");
    expect(formatRentTerm("year", null)).toBe("year");
  });

  it("ignores a session length that does not belong to the period", () => {
    expect(formatRentTerm("month", 9)).toBe("month");
    expect(formatRentTerm("week", 12)).toBe("week");
  });

  it("returns null when the period is unknown", () => {
    expect(formatRentTerm(null, null)).toBeNull();
    expect(formatRentTerm(null, 9)).toBeNull();
  });
});

describe("formatRentTermShort", () => {
  it("uses months for session rents and a compact period label otherwise", () => {
    expect(formatRentTermShort("term", 9)).toBe("9 mo");
    expect(formatRentTermShort("year", 12)).toBe("12 mo");
    expect(formatRentTermShort("month", null)).toBe("Month");
    expect(formatRentTermShort("quarter", null)).toBe("3 mo");
    expect(formatRentTermShort("week", null)).toBe("Week");
  });

  it("returns null when the period is unknown", () => {
    expect(formatRentTermShort(null, null)).toBeNull();
  });
});
