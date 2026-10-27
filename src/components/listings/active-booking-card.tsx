import {
  ArrowUpRight,
  Building2,
  MapPin,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BookingReceiptSheet } from "@/components/listings/booking-receipt-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canRenewBooking,
  describeRenewal,
  formatBookingDate,
  formatBookingPeriod,
  renewBooking,
  type BookingReceipt,
} from "@/listings/booking-receipt";
import { formatShare } from "@/listings/booking-group";
import { accommodationTypeLabels } from "@/listings/public-listings";
import { useListingDetail } from "@/listings/use-listing-detail";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

/**
 * The booked room, at the top of Home, until the student renews or cancels.
 *
 * It reads as a compact account card rather than a listing: room identity on
 * the left, the renewal clock as the focal inset, and the receipt one tap away.
 * The clock counts down to the renewal deadline and flips to overdue once it
 * passes. Renewing stays hidden until that deadline and then extends the rent
 * period. Cancelling a paid booking needs QUARTERS administrator approval, so
 * the management menu points the student at support instead of closing it
 * themselves.
 */
export function ActiveBookingCard({
  booking,
  onChanged,
  onNotice,
}: {
  booking: BookingReceipt;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const { listing } = useListingDetail(booking.listingId);
  const [now, setNow] = useState(() => new Date());
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [busy, setBusy] = useState<"renew" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A minute is precise enough for a rent deadline, and cheap to rerender.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = describeRenewal(booking.renewalAt, now);
  const renewalOpen = canRenewBooking(booking.renewalAt, now);
  const period = formatBookingPeriod(booking.rentPeriod, booking.rentSessionMonths);
  const cover = listing?.cover_image_url ?? null;
  const area = [booking.neighbourhood, booking.city].filter(Boolean).join(", ");
  const allPaid = booking.paidCount === booking.memberCount;
  const hasRenewalDate = !Number.isNaN(new Date(booking.renewalAt).getTime());

  async function handleRenew() {
    const client = supabase;
    if (!client || busy) return;
    setBusy("renew");
    setError(null);
    const result = await renewBooking(client, booking.groupId);
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    onNotice(
      result.renewalAt
        ? `Rent renewed. Next renewal is ${formatBookingDate(result.renewalAt)}.`
        : "Rent renewed.",
    );
    onChanged();
  }

  return (
    <>
      <section
        aria-labelledby="active-booking-heading"
        className="overflow-hidden rounded-[1.25rem] border border-line-strong bg-panel shadow-panel"
      >
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {/* Status line: what this card is, and where the booking stands. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-subtle uppercase">
              Your current room
            </p>
            <Badge tone={allPaid ? "positive" : "accent"}>
              {allPaid ? "PAID" : "ACTIVE"}
            </Badge>
          </div>

          {/*
           * One grid owns the card body so the mobile stack (room → countdown →
           * actions) and the wide two-column summary share the same markup.
           */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-4">
            <div className="flex min-w-0 items-start gap-3 md:col-start-1 md:row-start-1">
              <div className="min-w-0 flex-1">
                <h2
                  id="active-booking-heading"
                  className="line-clamp-2 text-base leading-snug font-semibold text-foreground sm:text-lg"
                >
                  {booking.listingTitle}
                </h2>
                <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {area || "Location not recorded"}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-subtle">
                  Room {booking.roomNumber} ·{" "}
                  {accommodationTypeLabels[booking.accommodationType]}
                </p>
              </div>

              {cover ? (
                <img
                  src={cover}
                  alt=""
                  decoding="async"
                  className="size-14 shrink-0 rounded-xl border border-line object-cover sm:size-16"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-14 shrink-0 place-items-center rounded-xl border border-line bg-panel-raised text-subtle sm:size-16"
                >
                  <Building2 className="size-5" />
                </span>
              )}
            </div>

            {/* The renewal clock is the focal point of the card. */}
            <div className="rounded-tile border border-accent/25 bg-accent/[0.07] px-3.5 py-3 md:col-start-2 md:row-span-2 md:row-start-1 md:flex md:flex-col md:justify-center md:self-stretch">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold tracking-[0.16em] text-accent-soft uppercase">
                    Next payment
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[22px] leading-none font-semibold tracking-tight",
                      countdown.expired ? "text-danger" : "text-foreground",
                    )}
                  >
                    {countdown.headline}
                  </p>
                  {hasRenewalDate && (
                    <p className="mt-1 text-[11px] text-muted">
                      {countdown.expired ? "Was due" : "Renews"}{" "}
                      {formatBookingDate(booking.renewalAt)}
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatShare(booking.totalAmount)}
                  </p>
                  <p className="text-[10px] text-subtle">
                    {period} · {booking.paidCount}/{booking.memberCount} paid
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:col-start-1 md:row-start-2">
              {error && <InlineAlert>{error}</InlineAlert>}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  size="sm"
                  onClick={() => setReceiptOpen(true)}
                  icon={<ReceiptText className="size-4" />}
                >
                  View receipt
                </Button>

                <Link
                  to={`/property/${booking.listingId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft underline decoration-accent/35 underline-offset-4 hover:text-accent"
                >
                  View room
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>

                {renewalOpen && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRenew()}
                    loading={busy === "renew"}
                    disabled={busy !== null}
                    icon={<RefreshCw className="size-4" />}
                  >
                    Renew rent
                  </Button>
                )}

                <button
                  type="button"
                  aria-expanded={manageOpen}
                  aria-controls="booking-management"
                  onClick={() => {
                    setError(null);
                    setManageOpen((open) => !open);
                  }}
                  disabled={busy !== null}
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-pill px-2 py-1.5 text-[11px] font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft",
                    "disabled:cursor-not-allowed disabled:opacity-55",
                    manageOpen
                      ? "bg-panel-raised text-foreground"
                      : "text-subtle hover:bg-panel-raised hover:text-foreground",
                  )}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  Manage
                </button>
              </div>

              {manageOpen && (
                <div
                  id="booking-management"
                  className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">
                      Cancelling needs QUARTERS approval
                    </p>
                    <button
                      type="button"
                      aria-label="Close booking options"
                      onClick={() => setManageOpen(false)}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-subtle transition-colors hover:bg-panel hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    A paid booking can only be cancelled by a QUARTERS
                    administrator. Message QUARTERS support with receipt{" "}
                    <span className="font-mono text-foreground">
                      {booking.receiptNumber}
                    </span>{" "}
                    for Room {booking.roomNumber} at {booking.listingTitle}, and
                    the team will review your request.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-fit"
                    onClick={() => setManageOpen(false)}
                  >
                    Keep booking
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <BookingReceiptSheet
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        booking={booking}
      />
    </>
  );
}
