import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  canRenewBooking,
  describeRenewal,
  findActiveBooking,
  formatBookingPeriod,
  loadMyBookings,
  renewBooking,
  type BookingReceipt,
} from "@/listings/booking-receipt";
import type { TypedSupabaseClient } from "@/lib/supabase";

function pgError(code: string, message = "database error"): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

function clientWith(rpc: () => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpc) } as unknown as TypedSupabaseClient;
}

const receiptRow = {
  group_id: "group-1",
  receipt_number: "QT-20261023-F90000",
  status: "active",
  issued_at: "2026-10-23T10:00:00.000Z",
  renewal_at: "2027-10-23T10:00:00.000Z",
  cancelled_at: null,
  renewal_count: 0,
  listing_id: "listing-1",
  listing_title: "Shared room in Gbagada",
  city: "Lagos",
  neighbourhood: "Gbagada",
  institution: "University of Lagos",
  accommodation_type: "shared_room",
  rent_amount: 300000,
  rent_period: "year",
  rent_session_months: 12,
  total_amount: 300000,
  currency: "NGN",
  room_number: 3,
  group_status: "paid",
  paid_count: 2,
  member_count: 2,
  created_by: "user-1",
};

describe("describeRenewal", () => {
  const now = new Date("2026-10-25T10:00:00.000Z");

  it("counts whole days until the renewal", () => {
    const result = describeRenewal("2026-10-30T10:00:00.000Z", now);

    expect(result.headline).toBe("5 days left");
    expect(result.caption).toBe("to renew or cancel");
    expect(result.expired).toBe(false);
  });

  it("switches to hours inside the last day", () => {
    expect(describeRenewal("2026-10-25T15:30:00.000Z", now).headline).toBe(
      "5h 30m left",
    );
  });

  it("reports an overdue rent", () => {
    const result = describeRenewal("2026-10-22T10:00:00.000Z", now);

    expect(result.headline).toBe("3 days overdue");
    expect(result.expired).toBe(true);
  });

  it("handles an unreadable date without lying to the student", () => {
    expect(describeRenewal("not-a-date", now).headline).toBe(
      "Renewal date unavailable",
    );
  });
});

describe("formatBookingPeriod", () => {
  it("describes how the room is let", () => {
    expect(formatBookingPeriod("year", 12)).toBe("12 months");
    expect(formatBookingPeriod("term", 9)).toBe("9-month session");
    expect(formatBookingPeriod("term", null)).toBe("per session");
    expect(formatBookingPeriod("month", null)).toBe("per month");
  });
});

describe("loadMyBookings", () => {
  it("maps the receipt the Home card and sheet need", async () => {
    const client = clientWith(async () => ({ data: [receiptRow], error: null }));

    const result = await loadMyBookings(client);

    expect(result.error).toBeNull();
    expect(result.bookings[0]).toMatchObject({
      receiptNumber: "QT-20261023-F90000",
      listingTitle: "Shared room in Gbagada",
      roomNumber: 3,
      totalAmount: 300000,
      paidCount: 2,
      memberCount: 2,
      status: "active",
    });
  });

  it("names the missing migration", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: pgError("PGRST202"),
    }));

    const result = await loadMyBookings(client);

    expect(result.bookings).toEqual([]);
    expect(result.error).toContain("migration");
  });

  it("survives a client without the RPC", async () => {
    const result = await loadMyBookings({} as TypedSupabaseClient);

    expect(result.bookings).toEqual([]);
    expect(result.error).toContain("booking service");
  });
});

describe("findActiveBooking", () => {
  it("returns the active receipt and ignores cancelled history", () => {
    const bookings = [
      { ...receiptRow, groupId: "old", status: "cancelled" },
      { ...receiptRow, groupId: "active", status: "active" },
    ] as unknown as BookingReceipt[];

    expect(findActiveBooking(bookings)?.groupId).toBe("active");
    expect(findActiveBooking([])).toBeNull();
  });
});

describe("booking actions", () => {
  it("renews and returns the new deadline", async () => {
    const rpc = vi.fn(async () => ({
      data: "2028-10-23T10:00:00.000Z",
      error: null,
    }));
    const client = { rpc } as unknown as TypedSupabaseClient;

    const result = await renewBooking(client, "group-1");

    expect(result.error).toBeNull();
    expect(result.renewalAt).toBe("2028-10-23T10:00:00.000Z");
    expect(rpc).toHaveBeenCalledWith("renew_booking", { p_group_id: "group-1" });
  });

  it("holds renewal until the allocated period is over", () => {
    const renewalAt = "2026-11-23T10:00:00.000Z";

    expect(canRenewBooking(renewalAt, new Date("2026-10-25T10:00:00.000Z"))).toBe(
      false,
    );
    expect(canRenewBooking(renewalAt, new Date(renewalAt))).toBe(true);
  });
});
