import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  CANCELLATION_CUTOFF_HOURS,
  VISIT_TIMES,
  buildVisitDays,
  hoursUntilVisit,
  mapViewingRequestError,
  scheduledForFromSlot,
  validateVisitSelection,
  visitCancellationBlock,
} from "@/listings/viewing-requests";

function pgError(code: string): PostgrestError {
  return {
    code,
    message: "database error",
    details: "",
    hint: "",
  } as unknown as PostgrestError;
}

describe("buildVisitDays", () => {
  it("lists consecutive days starting today, in local time", () => {
    const days = buildVisitDays(new Date(2026, 9, 24, 15, 30), 3);

    expect(days.map((day) => day.iso)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(days[0].month).toBe("Oct");
    expect(days[0].weekday).toHaveLength(3);
    expect(days[0].day).toBe("24");
  });

  it("defaults to five offered days", () => {
    expect(buildVisitDays()).toHaveLength(5);
  });
});

describe("scheduledForFromSlot", () => {
  it("converts a local day and time into an absolute timestamp", () => {
    const iso = scheduledForFromSlot("2026-10-27", "14:00");
    const parsed = new Date(iso);

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9);
    expect(parsed.getDate()).toBe(27);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(0);
  });
});

describe("validateVisitSelection", () => {
  it("requires a day and a time from the offered slots", () => {
    expect(validateVisitSelection(null, "10:00")).toBe(
      "Choose a day for your visit.",
    );
    expect(validateVisitSelection("2026-10-27", null)).toBe(
      "Choose a time for your visit.",
    );
    expect(validateVisitSelection("2026-10-27", "11:00")).toBe(
      "Choose one of the offered visit times.",
    );
    expect(validateVisitSelection("2026-10-27", "10:00")).toBeNull();
  });

  it("accepts every offered slot", () => {
    for (const slot of VISIT_TIMES) {
      expect(validateVisitSelection("2026-10-27", slot)).toBeNull();
    }
  });
});

describe("visitCancellationBlock", () => {
  const now = new Date("2026-10-24T09:00:00Z");
  const hoursFromNow = (hours: number) =>
    new Date(now.getTime() + hours * 3_600_000).toISOString();

  it("counts hours until the visit", () => {
    expect(hoursUntilVisit(hoursFromNow(30), now)).toBeCloseTo(30);
    expect(hoursUntilVisit(hoursFromNow(-2), now)).toBeCloseTo(-2);
  });

  it("allows cancelling outside the cutoff", () => {
    expect(visitCancellationBlock(hoursFromNow(CANCELLATION_CUTOFF_HOURS + 1), now)).toBeNull();
  });

  it("blocks cancelling inside the cutoff or after the visit started", () => {
    const message = "It's less than 24 hours to this visit, so it can no longer be cancelled.";
    expect(visitCancellationBlock(hoursFromNow(23), now)).toBe(message);
    expect(visitCancellationBlock(hoursFromNow(CANCELLATION_CUTOFF_HOURS), now)).toBe(message);
    expect(visitCancellationBlock(hoursFromNow(-1), now)).toBe(message);
  });
});

describe("mapViewingRequestError", () => {
  it("explains an unapplied migration instead of a generic failure", () => {
    expect(mapViewingRequestError(pgError("42P01"))).toContain(
      "migration has not been applied",
    );
    expect(mapViewingRequestError(pgError("PGRST205"))).toContain(
      "migration has not been applied",
    );
  });

  it("reports duplicate open requests", () => {
    expect(mapViewingRequestError(pgError("23505"))).toBe(
      "You already have an open visit request for this room.",
    );
  });

  it("reports authorisation failures as a sign-in requirement", () => {
    expect(mapViewingRequestError(pgError("42501"))).toBe(
      "Sign in to request a visit.",
    );
  });

  it("falls back to a retryable message", () => {
    expect(mapViewingRequestError(pgError("XX000"))).toBe(
      "Could not send your visit request. Please try again.",
    );
  });
});
