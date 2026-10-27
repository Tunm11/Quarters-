import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase";
import {
  loadProviderReservations,
  respondToReservation,
} from "@/listings/provider-reservations";

function pgError(code: string, message = "database error"): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

function clientWith(rpc: () => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpc) } as unknown as TypedSupabaseClient;
}

const row = {
  reservation_id: "reservation-1",
  listing_id: "listing-1",
  listing_title: "Shared room in Gbagada",
  room_number: 3,
  requester_name: "Akinpelu",
  status: "requested",
  requested_at: "2026-10-25T10:00:00.000Z",
  resolved_at: null,
  group_id: "group-1",
  group_status: "paid",
  total_amount: 300000,
  currency: "NGN",
  paid_count: 2,
  member_count: 2,
};

describe("loadProviderReservations", () => {
  it("maps a paid group request for the provider inbox", async () => {
    const client = clientWith(async () => ({ data: [row], error: null }));

    const result = await loadProviderReservations(client);

    expect(result.error).toBeNull();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      reservationId: "reservation-1",
      listingTitle: "Shared room in Gbagada",
      roomNumber: 3,
      requesterName: "Akinpelu",
      status: "requested",
      paidCount: 2,
      memberCount: 2,
      totalAmount: 300000,
    });
  });

  it("defaults missing payment counts instead of showing NaN", async () => {
    const client = clientWith(async () => ({
      data: [{ ...row, group_id: null, paid_count: null, member_count: null }],
      error: null,
    }));

    const result = await loadProviderReservations(client);

    expect(result.reservations[0].paidCount).toBe(0);
    expect(result.reservations[0].memberCount).toBe(0);
  });

  it("names the missing migration", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: pgError("PGRST202"),
    }));

    const result = await loadProviderReservations(client);

    expect(result.reservations).toEqual([]);
    expect(result.error).toContain("migration");
  });

  it("survives a client without the RPC", async () => {
    const result = await loadProviderReservations({} as TypedSupabaseClient);

    expect(result.reservations).toEqual([]);
    expect(result.error).toContain("reservation service");
  });
});

describe("respondToReservation", () => {
  it("sends the provider's decision", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const client = { rpc } as unknown as TypedSupabaseClient;

    const result = await respondToReservation(client, {
      reservationId: "reservation-1",
      approve: true,
    });

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("respond_to_room_reservation", {
      p_reservation_id: "reservation-1",
      p_approve: true,
    });
  });

  it("passes the database's sentence through when the request was already answered", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: pgError("22023", "That request has already been answered."),
    }));

    const result = await respondToReservation(client, {
      reservationId: "reservation-1",
      approve: false,
    });

    expect(result.error).toBe("That request has already been answered.");
  });
});
