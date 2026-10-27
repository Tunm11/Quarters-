import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  buildRoomAvailability,
  mapRoomBookingsError,
  roomReservationLabels,
} from "@/listings/room-bookings";

function pgError(code: string): PostgrestError {
  return {
    code,
    message: "database error",
    details: "",
    hint: "",
  } as unknown as PostgrestError;
}

describe("buildRoomAvailability", () => {
  it("numbers the rooms from one and closes the booked ones", () => {
    const rooms = buildRoomAvailability(16, [2, 5, 7]);

    expect(rooms).toHaveLength(16);
    expect(rooms[0]).toEqual({ number: 1, available: true });
    expect(rooms[1]).toEqual({ number: 2, available: false });
    expect(rooms[4]).toEqual({ number: 5, available: false });
    expect(rooms[15]).toEqual({ number: 16, available: true });
  });

  it("ignores booked numbers that do not exist", () => {
    expect(buildRoomAvailability(3, [9, 12]).every((room) => room.available)).toBe(
      true,
    );
  });

  it("returns nothing for a listing without rooms", () => {
    expect(buildRoomAvailability(0, [1])).toEqual([]);
  });
});

describe("room reservation labels", () => {
  it("tells the student where their request stands", () => {
    expect(roomReservationLabels.requested).toBe("Awaiting the lister");
    expect(roomReservationLabels.approved).toBe("Approved");
    expect(roomReservationLabels.declined).toBe("Declined");
  });
});

describe("room booking errors", () => {
  it("names the migration that is missing", () => {
    expect(mapRoomBookingsError(pgError("42P01"))).toContain("migration");
    expect(mapRoomBookingsError(pgError("PGRST205"))).toContain("migration");
    expect(mapRoomBookingsError(pgError("42883"))).toContain("migration");
  });

  it("falls back to a retryable message", () => {
    expect(mapRoomBookingsError(pgError("XX000"))).toBe(
      "Could not load the rooms for this property. Please try again.",
    );
  });
});
