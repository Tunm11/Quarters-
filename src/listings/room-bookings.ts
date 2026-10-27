import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** One room in a multi-room listing, and whether somebody already holds it. */
export type RoomAvailability = {
  number: number;
  available: boolean;
};

export type RoomReservationStatus =
  Database["public"]["Enums"]["room_reservation_status"];

/**
 * A hold the student's group asked the listing owner for. `requested` waits on
 * the owner/agent, `approved` is a confirmed room, `declined` sends the group
 * back to choosing another room.
 */
export type RoomReservation = {
  roomNumber: number;
  status: RoomReservationStatus;
  bookingGroupId: string | null;
  requestedAt: string;
  resolvedAt: string | null;
};

export const roomReservationLabels: Record<RoomReservationStatus, string> = {
  requested: "Awaiting the lister",
  approved: "Approved",
  declined: "Declined",
};

/**
 * Builds the numbered rooms of a listing from its room count and the room
 * numbers that are already held. Rooms are 1-based and contiguous.
 */
export function buildRoomAvailability(
  totalRooms: number,
  bookedRoomNumbers: Iterable<number>,
): RoomAvailability[] {
  const booked = new Set(bookedRoomNumbers);
  const count = Number.isFinite(totalRooms) ? Math.max(0, Math.floor(totalRooms)) : 0;

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    available: !booked.has(index + 1),
  }));
}

export function mapRoomBookingsError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Room availability is not enabled on this database yet. Apply the room-booking migration.";
  }
  if (error.code === "42883" || error.code === "PGRST202") {
    return "Room reservations are not enabled yet. Apply the reservation-handshake migration.";
  }
  return "Could not load the rooms for this property. Please try again.";
}

const REQUEST_FAILED =
  "Could not reach the reservation service. Check your connection and try again.";

/** Room numbers currently held (requested or approved) on this listing. */
export async function loadBookedRooms(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ booked: number[]; error: string | null }> {
  try {
    const { data, error } = await client.rpc("listing_taken_rooms", {
      target_listing: listingId,
    });

    if (error) {
      return { booked: [], error: mapRoomBookingsError(error) };
    }

    return { booked: data ?? [], error: null };
  } catch {
    return { booked: [], error: REQUEST_FAILED };
  }
}

/**
 * The caller's latest hold on a listing: the request their group paid for, or
 * a resolved one so the screen can say the lister declined it.
 */
export async function loadMyRoomReservation(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ reservation: RoomReservation | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("my_room_reservation", {
      target_listing: listingId,
    });

    if (error) {
      return { reservation: null, error: mapRoomBookingsError(error) };
    }

    const row = data?.[0];
    if (!row) return { reservation: null, error: null };

    return {
      reservation: {
        roomNumber: row.room_number,
        status: row.status,
        bookingGroupId: row.booking_group_id,
        requestedAt: row.requested_at,
        resolvedAt: row.resolved_at,
      },
      error: null,
    };
  } catch {
    return { reservation: null, error: REQUEST_FAILED };
  }
}
