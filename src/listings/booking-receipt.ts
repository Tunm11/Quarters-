import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type BookingReceiptStatus =
  Database["public"]["Enums"]["booking_receipt_status"];

export type BookingReceipt = {
  groupId: string;
  receiptNumber: string;
  status: BookingReceiptStatus;
  issuedAt: string;
  renewalAt: string;
  cancelledAt: string | null;
  renewalCount: number;
  listingId: string;
  listingTitle: string;
  city: string;
  neighbourhood: string | null;
  institution: string | null;
  accommodationType: Database["public"]["Enums"]["accommodation_type"];
  rentAmount: number;
  rentPeriod: Database["public"]["Enums"]["rent_period"] | null;
  rentSessionMonths: number | null;
  totalAmount: number;
  currency: string;
  roomNumber: number;
  groupStatus: Database["public"]["Enums"]["booking_group_status"];
  paidCount: number;
  memberCount: number;
  createdBy: string;
};

function mapBookingError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Bookings and receipts are not enabled yet. Apply the booking-receipts migration.";
  }
  if (error.code === "42883" || error.code === "PGRST202") {
    return "Booking receipts are not available yet. Apply the booking-receipts migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see your booking.";
  }
  if (error.code === "23505" || error.code === "22023") {
    return error.message || "That change is not possible right now.";
  }
  return "Could not load your booking. Please try again.";
}

const REQUEST_FAILED =
  "Could not reach the booking service. Check your connection and try again.";

/** Every receipt the caller is a member of, active bookings first. */
export async function loadMyBookings(
  client: TypedSupabaseClient,
): Promise<{ bookings: BookingReceipt[]; error: string | null }> {
  try {
    const { data, error } = await client.rpc("my_bookings");

    if (error) {
      return { bookings: [], error: mapBookingError(error) };
    }

    return {
      bookings: (data ?? []).map((row) => ({
        groupId: row.group_id,
        receiptNumber: row.receipt_number,
        status: row.status,
        issuedAt: row.issued_at,
        renewalAt: row.renewal_at,
        cancelledAt: row.cancelled_at,
        renewalCount: row.renewal_count,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        city: row.city,
        neighbourhood: row.neighbourhood,
        institution: row.institution,
        accommodationType: row.accommodation_type,
        rentAmount: row.rent_amount,
        rentPeriod: row.rent_period,
        rentSessionMonths: row.rent_session_months,
        totalAmount: row.total_amount,
        currency: row.currency,
        roomNumber: row.room_number,
        groupStatus: row.group_status,
        paidCount: row.paid_count,
        memberCount: row.member_count,
        createdBy: row.created_by,
      })),
      error: null,
    };
  } catch {
    return { bookings: [], error: REQUEST_FAILED };
  }
}

export function findActiveBooking(
  bookings: BookingReceipt[],
): BookingReceipt | null {
  return bookings.find((booking) => booking.status === "active") ?? null;
}

/**
 * Rent can only be renewed once the allocated period is over; the Renew control
 * stays hidden until then, and renew_booking refuses early calls as well.
 */
export function canRenewBooking(
  renewalAt: string,
  now: Date = new Date(),
): boolean {
  const target = new Date(renewalAt).getTime();
  return !Number.isNaN(target) && now.getTime() >= target;
}

export async function renewBooking(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ renewalAt: string | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("renew_booking", {
      p_group_id: groupId,
    });
    if (error) return { renewalAt: null, error: mapBookingError(error) };
    return { renewalAt: data ?? null, error: null };
  } catch {
    return { renewalAt: null, error: REQUEST_FAILED };
  }
}

/** How the room is let, for the receipt and the Home card. */
export function formatBookingPeriod(
  period: Database["public"]["Enums"]["rent_period"] | null,
  sessionMonths: number | null,
): string {
  switch (period) {
    case "week":
      return "per week";
    case "month":
      return "per month";
    case "quarter":
      return "per quarter";
    case "term":
      return sessionMonths ? `${sessionMonths}-month session` : "per session";
    case "year":
      return sessionMonths ? `${sessionMonths} months` : "per year";
    default:
      return "rent";
  }
}

export type RenewalCountdown = {
  headline: string;
  caption: string;
  expired: boolean;
};

const DAY_MS = 86_400_000;

/**
 * The Home card's clock. It always points at the moment the student must renew
 * the rent or cancel, and flips to an overdue message once that moment passes.
 */
export function describeRenewal(
  renewalAt: string,
  now: Date = new Date(),
): RenewalCountdown {
  const target = new Date(renewalAt).getTime();
  if (Number.isNaN(target)) {
    return {
      headline: "Renewal date unavailable",
      caption: "Open the receipt for the recorded dates",
      expired: false,
    };
  }

  const remaining = target - now.getTime();

  if (remaining <= 0) {
    const days = Math.floor(Math.abs(remaining) / DAY_MS);
    return {
      headline:
        days >= 1 ? `${days} day${days === 1 ? "" : "s"} overdue` : "Overdue today",
      caption: "Renew the rent or cancel your booking",
      expired: true,
    };
  }

  if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    return {
      headline: hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
      caption: "to renew or cancel",
      expired: false,
    };
  }

  const days = Math.floor(remaining / DAY_MS);
  return {
    headline: `${days} day${days === 1 ? "" : "s"} left`,
    caption: "to renew or cancel",
    expired: false,
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatBookingDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date);
}
