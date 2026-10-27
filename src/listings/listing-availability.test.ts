import { describe, expect, it } from "vitest";
import {
  buildAvailabilityCalendar,
  formatDate,
} from "@/listings/listing-availability";

const NOW = new Date("2026-11-15T10:00:00Z");

function build(
  overrides: Partial<Parameters<typeof buildAvailabilityCalendar>[0]> = {},
) {
  return buildAvailabilityCalendar({
    availableFrom: null,
    availabilityStatus: "available",
    totalRooms: null,
    takenRooms: 0,
    holds: [],
    now: NOW,
    ...overrides,
  });
}

describe("buildAvailabilityCalendar", () => {
  it("draws no calendar when the provider gave no dates", () => {
    const calendar = build({ totalRooms: 5, takenRooms: 2 });

    expect(calendar.months).toEqual([]);
    expect(calendar.hasDatedInfo).toBe(false);
    expect(calendar.headline).toBe("Move-in date not stated");
    expect(calendar.availableRooms).toBe(3);
    expect(calendar.detail).toContain("3 of 5 rooms are free");
  });

  it("marks months before the move-in date as not yet available", () => {
    const calendar = build({ availableFrom: "2027-01-15" });

    expect(calendar.months).toHaveLength(12);
    expect(calendar.headline).toBe("Free from 15 Jan 2027");

    const byKey = new Map(calendar.months.map((month) => [month.key, month]));
    expect(byKey.get("2026-11")?.state).toBe("soon");
    expect(byKey.get("2026-12")?.state).toBe("soon");

    // The month the date falls inside is open, with the exact day in its note.
    expect(byKey.get("2027-01")?.state).toBe("open");
    expect(byKey.get("2027-01")?.note).toBe("Free from 15 Jan 2027");
    expect(byKey.get("2027-02")?.state).toBe("open");
    expect(byKey.get("2027-02")?.note).toBeNull();
  });

  it("marks held months and leaves the rest open", () => {
    const calendar = build({
      availableFrom: "2026-11-01",
      holds: [
        { starts_on: "2027-02-01", ends_on: "2027-02-28", note: "Held for a returning tenant" },
      ],
    });

    const byKey = new Map(calendar.months.map((month) => [month.key, month]));
    expect(byKey.get("2026-11")?.state).toBe("open");
    expect(byKey.get("2027-02")?.state).toBe("held");
    expect(byKey.get("2027-02")?.note).toBe("Held for a returning tenant");
    expect(byKey.get("2027-03")?.state).toBe("open");
  });

  it("marks a month held by a partial overlap", () => {
    const calendar = build({
      availableFrom: "2026-11-01",
      holds: [{ starts_on: "2026-12-20", ends_on: "2027-01-10" }],
    });

    const byKey = new Map(calendar.months.map((month) => [month.key, month]));
    expect(byKey.get("2026-12")?.state).toBe("held");
    expect(byKey.get("2027-01")?.state).toBe("held");
    expect(byKey.get("2026-12")?.note).toBe("Held");
    expect(byKey.get("2027-02")?.state).toBe("open");
  });

  it("asks the provider about months with no stated move-in date", () => {
    const calendar = build({
      holds: [{ starts_on: "2027-02-01", ends_on: "2027-02-28" }],
    });

    const byKey = new Map(calendar.months.map((month) => [month.key, month]));
    expect(calendar.hasDatedInfo).toBe(true);
    expect(byKey.get("2026-11")?.state).toBe("unknown");
    expect(byKey.get("2026-11")?.note).toBe("Ask the provider");
    expect(byKey.get("2027-02")?.state).toBe("held");
  });

  it("closes every month when the provider marked the room unavailable", () => {
    const calendar = build({
      availabilityStatus: "unavailable",
      availableFrom: "2027-01-01",
    });

    expect(calendar.headline).toBe("The provider has marked this room unavailable.");
    expect(calendar.months.every((month) => month.state === "closed")).toBe(true);
  });

  it("closes every month when every room is taken", () => {
    const calendar = build({ totalRooms: 4, takenRooms: 4 });

    expect(calendar.headline).toBe("Every room here is taken right now.");
    expect(calendar.availableRooms).toBe(0);
    expect(calendar.months.every((month) => month.state === "closed")).toBe(true);
  });

  it("notes limited rooms on months that are open", () => {
    const calendar = build({
      availabilityStatus: "limited",
      availableFrom: "2026-11-01",
      totalRooms: 6,
      takenRooms: 5,
    });

    expect(calendar.months[0].state).toBe("open");
    expect(calendar.months[0].note).toBe("Limited rooms");
    expect(calendar.availableRooms).toBe(1);
  });

  it("crosses into the next year with the right keys and labels", () => {
    const calendar = build({ availableFrom: "2026-11-01" });

    expect(calendar.months[0].key).toBe("2026-11");
    expect(calendar.months[0].label).toBe("Nov");
    expect(calendar.months[2].key).toBe("2027-01");
    expect(calendar.months[2].label).toBe("Jan");
    expect(calendar.months[2].year).toBe(2027);
    expect(calendar.months[1].endsOn).toBe("2026-12-31");
  });
});

describe("formatDate", () => {
  it("formats an ISO date without shifting the day", () => {
    expect(formatDate("2027-01-15")).toBe("15 Jan 2027");
    expect(formatDate("2026-12-01")).toBe("1 Dec 2026");
  });
});
