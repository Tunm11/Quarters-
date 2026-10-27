import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/use-auth";
import {
  findActiveBooking,
  loadMyBookings,
  type BookingReceipt,
} from "@/listings/booking-receipt";
import { supabase } from "@/lib/supabase";

export type MyBookingStatus = "loading" | "ready" | "error";

/**
 * The student's active booking, if they have one. Signing out or cancelling
 * clears it, which is what removes the card from Home.
 */
export function useMyBooking() {
  const { status: authStatus, user } = useAuth();
  const [booking, setBooking] = useState<BookingReceipt | null>(null);
  const [status, setStatus] = useState<MyBookingStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const signedIn = authStatus === "signedIn" && Boolean(user);

  const reload = useCallback(async () => {
    const request = requestId.current + 1;
    requestId.current = request;
    setError(null);

    if (!signedIn) {
      setBooking(null);
      setStatus("ready");
      return;
    }

    if (!supabase) {
      setBooking(null);
      setError("Bookings are unavailable because Supabase is not configured.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    const result = await loadMyBookings(supabase);
    if (request !== requestId.current) return;

    if (result.error) {
      setBooking(null);
      setError(result.error);
      setStatus("error");
      return;
    }

    setBooking(findActiveBooking(result.bookings));
    setStatus("ready");
  }, [signedIn]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { booking, status, error, reload };
}
