import { describe, expect, it } from "vitest";
import { splitVisits, type MyVisit, type VisitStatus } from "@/listings/my-visits";

function visit(
  id: string,
  status: VisitStatus,
  scheduledFor: string,
): MyVisit {
  return {
    request: {
      id,
      listing_id: `listing-${id}`,
      scheduled_for: scheduledFor,
      status,
      note: null,
      created_at: "2026-10-01T09:00:00.000Z",
    },
    listing: null,
  };
}

const now = new Date("2026-10-25T12:00:00.000Z");

describe("splitVisits", () => {
  it("keeps pending and confirmed future visits, soonest first", () => {
    const { upcoming } = splitVisits(
      [
        visit("later", "confirmed", "2026-11-02T10:00:00.000Z"),
        visit("sooner", "pending", "2026-10-27T10:00:00.000Z"),
      ],
      now,
    );

    expect(upcoming.map((entry) => entry.request.id)).toEqual([
      "sooner",
      "later",
    ]);
  });

  it("moves answered or past visits into history, newest first", () => {
    const { upcoming, past } = splitVisits(
      [
        visit("declined", "declined", "2026-12-01T10:00:00.000Z"),
        visit("old", "pending", "2026-10-20T10:00:00.000Z"),
        visit("visited", "completed", "2026-10-10T10:00:00.000Z"),
        visit("cancelled", "cancelled", "2026-11-20T10:00:00.000Z"),
      ],
      now,
    );

    expect(upcoming).toHaveLength(0);
    expect(past.map((entry) => entry.request.id)).toEqual([
      "declined",
      "cancelled",
      "old",
      "visited",
    ]);
  });

  it("treats a pending visit that already started as history", () => {
    const visitToday = visit("today", "pending", "2026-10-25T09:00:00.000Z");
    const { upcoming, past } = splitVisits([visitToday], now);

    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });
});
