import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type RoomReservationStatus =
  Database["public"]["Enums"]["room_reservation_status"];

export type ProviderReservation = {
  reservationId: string;
  listingId: string;
  listingTitle: string;
  roomNumber: number;
  requesterName: string;
  status: RoomReservationStatus;
  requestedAt: string;
  resolvedAt: string | null;
  groupId: string | null;
  totalAmount: number | null;
  currency: string | null;
  paidCount: number;
  memberCount: number;
};

function mapProviderReservationError(error: PostgrestError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "Room reservations are not enabled yet. Apply the reservation-handshake migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Only the provider who owns this listing can answer its reservations.";
  }
  if (error.code === "22023") {
    return error.message || "That request has already been answered.";
  }
  return "Could not load room reservations. Please try again.";
}

const REQUEST_FAILED =
  "Could not reach the reservation service. Check your connection and try again.";

/** Reservations on the caller's own listings, unanswered requests first. */
export async function loadProviderReservations(
  client: TypedSupabaseClient,
): Promise<{ reservations: ProviderReservation[]; error: string | null }> {
  try {
    const { data, error } = await client.rpc("provider_room_reservations");

    if (error) {
      return { reservations: [], error: mapProviderReservationError(error) };
    }

    return {
      reservations: (data ?? []).map((row) => ({
        reservationId: row.reservation_id,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        roomNumber: row.room_number,
        requesterName: row.requester_name,
        status: row.status,
        requestedAt: row.requested_at,
        resolvedAt: row.resolved_at,
        groupId: row.group_id,
        totalAmount: row.total_amount,
        currency: row.currency,
        paidCount: row.paid_count ?? 0,
        memberCount: row.member_count ?? 0,
      })),
      error: null,
    };
  } catch {
    return { reservations: [], error: REQUEST_FAILED };
  }
}

/**
 * Approve or decline a room hold. Declining also closes the group booking that
 * paid for it, so the roommates can pick another room.
 */
export async function respondToReservation(
  client: TypedSupabaseClient,
  {
    reservationId,
    approve,
  }: { reservationId: string; approve: boolean },
): Promise<{ error: string | null }> {
  try {
    const { error } = await client.rpc("respond_to_room_reservation", {
      p_reservation_id: reservationId,
      p_approve: approve,
    });

    if (error) {
      return { error: mapProviderReservationError(error) };
    }
    return { error: null };
  } catch {
    return { error: REQUEST_FAILED };
  }
}
