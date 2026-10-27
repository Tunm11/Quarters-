import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  formatShare,
  mapBookingGroupError,
  splitBookingShare,
} from "@/listings/booking-group";

function pgError(code: string, message = "database error"): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

describe("splitBookingShare", () => {
  it("splits the rent evenly between roommates", () => {
    expect(splitBookingShare(350_000, 2)).toEqual([175_000, 175_000]);
    expect(splitBookingShare(600_000, 3)).toEqual([200_000, 200_000, 200_000]);
  });

  it("always adds up to the total, down to the kobo", () => {
    for (const [total, count] of [
      [100, 3],
      [0.05, 3],
      [350_000.01, 4],
      [999.99, 7],
    ] as const) {
      const shares = splitBookingShare(total, count);
      const sum = shares.reduce((totalShare, share) => totalShare + share, 0);
      expect(count).toBe(shares.length);
      expect(Number(sum.toFixed(2))).toBe(Number(total.toFixed(2)));
    }
  });

  it("gives the leftover kobo to the earlier roommates", () => {
    expect(splitBookingShare(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it("returns nothing for an unusable split", () => {
    expect(splitBookingShare(0, 2)).toEqual([]);
    expect(splitBookingShare(350_000, 0)).toEqual([]);
    expect(splitBookingShare(Number.NaN, 2)).toEqual([]);
  });
});

describe("formatShare", () => {
  it("formats shares as naira with kobo when needed", () => {
    expect(formatShare(175_000)).toContain("175,000");
    expect(formatShare(33.34)).toContain("33.34");
  });
});

describe("mapBookingGroupError", () => {
  it("passes the database's own sentence through for rule violations", () => {
    expect(
      mapBookingGroupError(
        pgError("22023", "Someone has already paid, so the booking can no longer change."),
      ),
    ).toBe("Someone has already paid, so the booking can no longer change.");
    expect(mapBookingGroupError(pgError("23505", "That room is already taken."))).toBe(
      "That room is already taken.",
    );
  });

  it("reports authorisation failures as a sign-in requirement", () => {
    expect(mapBookingGroupError(pgError("42501"))).toBe("Sign in to book together.");
  });

  it("explains an unapplied migration", () => {
    expect(mapBookingGroupError(pgError("42P01"))).toContain(
      "booking-groups migration",
    );
    expect(mapBookingGroupError(pgError("PGRST202"))).toContain(
      "booking-groups migration",
    );
  });

  it("falls back to a retryable message", () => {
    expect(mapBookingGroupError(pgError("XX000"))).toBe(
      "Could not update this booking. Please try again.",
    );
  });
});
