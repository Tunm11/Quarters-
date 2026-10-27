import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type BookingGroupStatus =
  Database["public"]["Enums"]["booking_group_status"];

export type BookingGroupInfo = {
  id: string;
  listing_id: string;
  listing_title: string;
  room_number: number;
  total_amount: number;
  currency: string;
  status: BookingGroupStatus;
  created_by: string;
  created_at: string;
  /** `room_declined` when the lister refused the room; null when everyone left. */
  closed_reason: string | null;
};

export type BookingParticipant = {
  user_id: string;
  display_name: string;
  status: "joined" | "left" | string;
  share_amount: number;
  paid_at: string | null;
  is_creator: boolean;
};

/**
 * Splits an amount evenly to the kobo, giving the leftover kobo to the earlier
 * people. Mirrors recalculate_booking_group() in the database so the preview in
 * the sheet matches the stored shares exactly.
 */
export function splitBookingShare(total: number, count: number): number[] {
  if (!Number.isFinite(total) || total <= 0 || count <= 0) return [];

  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;

  return Array.from(
    { length: count },
    (_, index) => (base + (index < remainder ? 1 : 0)) / 100,
  );
}

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

export function formatShare(amount: number): string {
  return moneyFormatter.format(amount);
}

export function mapBookingGroupError(error: PostgrestError): string {
  // The RPCs raise these with a sentence meant for the person reading it.
  if (error.code === "22023" || error.code === "23505") {
    return error.message || "That change is not possible right now.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to book together.";
  }
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202"
  ) {
    return "Booking together is not available yet. Apply the booking-groups migration.";
  }
  return "Could not update this booking. Please try again.";
}

const REQUEST_FAILED =
  "Could not reach the booking service. Check your connection and try again.";

export async function createBookingGroup(
  client: TypedSupabaseClient,
  {
    listingId,
    roomNumber,
    memberIds,
  }: { listingId: string; roomNumber: number; memberIds: string[] },
): Promise<{ groupId: string | null; error: string | null }> {
  const unique = [...new Set(memberIds)].filter(Boolean);
  if (unique.length < 1) {
    return { groupId: null, error: "Choose at least one roommate." };
  }

  try {
    const { data, error } = await client.rpc("create_booking_group", {
      p_listing_id: listingId,
      p_room_number: roomNumber,
      p_member_ids: unique,
    });

    if (error) {
      return { groupId: null, error: mapBookingGroupError(error) };
    }

    return { groupId: data ?? null, error: null };
  } catch {
    return { groupId: null, error: REQUEST_FAILED };
  }
}

export async function loadBookingGroup(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{
  info: BookingGroupInfo | null;
  participants: BookingParticipant[];
  error: string | null;
}> {
  try {
    const [infoResult, peopleResult] = await Promise.all([
      client.rpc("booking_group_info", { p_group_id: groupId }),
      client.rpc("booking_group_participants", { p_group_id: groupId }),
    ]);

    const error = infoResult.error ?? peopleResult.error;
    if (error) {
      return {
        info: null,
        participants: [],
        error: mapBookingGroupError(error),
      };
    }

    const info = infoResult.data?.[0] ?? null;
    return {
      info,
      participants: (peopleResult.data ?? []).map((person) => ({
        user_id: person.user_id,
        display_name: person.display_name.trim() || "Roommate",
        status: person.status,
        share_amount: person.share_amount,
        paid_at: person.paid_at,
        is_creator: person.is_creator,
      })),
      error: null,
    };
  } catch {
    return { info: null, participants: [], error: REQUEST_FAILED };
  }
}

/** The caller's active group on a listing, if they have one. */
export async function loadMyBookingGroup(
  client: TypedSupabaseClient,
  listingId: string,
): Promise<{ groupId: string | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("my_booking_group", {
      p_listing_id: listingId,
    });

    if (error) {
      return { groupId: null, error: mapBookingGroupError(error) };
    }

    return { groupId: data ?? null, error: null };
  } catch {
    return { groupId: null, error: REQUEST_FAILED };
  }
}

export async function leaveBookingGroup(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await client.rpc("leave_booking_group", {
      p_group_id: groupId,
    });

    if (error) {
      return { error: mapBookingGroupError(error) };
    }
    return { error: null };
  } catch {
    return { error: REQUEST_FAILED };
  }
}

export async function payBookingShare(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await client.rpc("pay_booking_share", {
      p_group_id: groupId,
    });

    if (error) {
      return { error: mapBookingGroupError(error) };
    }
    return { error: null };
  } catch {
    return { error: REQUEST_FAILED };
  }
}
