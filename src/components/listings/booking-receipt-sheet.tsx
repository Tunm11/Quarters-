import { BadgeCheck, Check, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  formatShare,
  loadBookingGroup,
  type BookingParticipant,
} from "@/listings/booking-group";
import {
  describeRenewal,
  formatBookingDate,
  formatBookingPeriod,
  type BookingReceipt,
} from "@/listings/booking-receipt";
import { accommodationTypeLabels } from "@/listings/public-listings";
import { supabase } from "@/lib/supabase";

/**
 * The receipt for an approved booking: what was paid, by whom, for which room,
 * and when the rent next falls due. It is generated from the stored receipt and
 * the booking's members — nothing here is recomputed from the UI's numbers.
 */
export function BookingReceiptSheet({
  open,
  onClose,
  booking,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingReceipt;
}) {
  const [participants, setParticipants] = useState<BookingParticipant[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const client = supabase;
    if (!client) {
      setStatus("error");
      setError("Receipt details are unavailable because Supabase is not configured.");
      return;
    }

    let active = true;
    setStatus("loading");
    setError(null);

    void loadBookingGroup(client, booking.groupId).then((result) => {
      if (!active) return;
      if (result.error) {
        setParticipants([]);
        setError(result.error);
        setStatus("error");
        return;
      }
      setParticipants(result.participants);
      setStatus("ready");
    });

    return () => {
      active = false;
    };
  }, [open, booking.groupId]);

  const joined = participants.filter((person) => person.status === "joined");
  const paid = joined.filter((person) => person.paid_at);
  const paidTotal = paid.reduce((sum, person) => sum + person.share_amount, 0);
  const countdown = describeRenewal(booking.renewalAt);
  const period = formatBookingPeriod(booking.rentPeriod, booking.rentSessionMonths);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="tall"
      title="Receipt"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to={`/property/${booking.listingId}`}
            className="text-xs font-medium text-accent-soft underline"
          >
            View the room
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium tracking-[0.18em] text-subtle uppercase">
                QUARTERS receipt
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-foreground">
                {booking.receiptNumber}
              </p>
            </div>
            <Badge tone={booking.status === "active" ? "positive" : "neutral"}>
              {booking.status === "active" ? "Active booking" : "Cancelled"}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2.5 text-[11px]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Issued</dt>
              <dd className="font-medium text-foreground">
                {formatBookingDate(booking.issuedAt)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Renews</dt>
              <dd className="font-medium text-foreground">
                {formatBookingDate(booking.renewalAt)}
              </dd>
            </div>
            {booking.cancelledAt && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-subtle">Cancelled</dt>
                <dd className="font-medium text-foreground">
                  {formatBookingDate(booking.cancelledAt)}
                </dd>
              </div>
            )}
            {booking.renewalCount > 0 && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-subtle">Renewed</dt>
                <dd className="font-medium text-foreground">
                  {booking.renewalCount} time
                  {booking.renewalCount === 1 ? "" : "s"}
                </dd>
              </div>
            )}
          </dl>
          {booking.status === "active" && (
            <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
              {countdown.headline} {countdown.caption.toLowerCase()}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
            Property
          </p>
          <p className="text-sm font-semibold text-foreground">
            {booking.listingTitle}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span>
              {[booking.neighbourhood, booking.city].filter(Boolean).join(", ")} ·
              Room {booking.roomNumber}
            </span>
          </p>
          <p className="text-[11px] text-subtle">
            {accommodationTypeLabels[booking.accommodationType]}
            {booking.institution ? ` · near ${booking.institution}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted">Rent for the room</p>
            <p className="text-sm font-semibold text-foreground">
              {formatShare(booking.totalAmount)}{" "}
              <span className="text-[11px] font-normal text-subtle">{period}</span>
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
            <p className="text-xs text-muted">
              Split {booking.memberCount} way{booking.memberCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs font-medium text-foreground">
              {formatShare(paidTotal)} of {formatShare(booking.totalAmount)} paid
            </p>
          </div>
          <div className="flex items-center gap-1.5 border-t border-line pt-2.5 text-[11px] text-subtle">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Recorded in QUARTERS · no card or transfer was processed
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
            Roommates and payments
          </p>
          {status === "loading" && (
            <p role="status" className="text-xs text-muted">
              Loading roommates…
            </p>
          )}
          {status === "error" && <InlineAlert>{error}</InlineAlert>}
          {status === "ready" && (
            <ul className="flex list-none flex-col gap-2">
              {joined.map((person) => (
                <li
                  key={person.user_id}
                  className="flex items-center gap-3 rounded-tile border border-line bg-panel p-2.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {person.display_name}
                      {person.is_creator ? " · started the booking" : ""}
                    </span>
                    <span className="text-[11px] text-subtle">
                      {formatShare(person.share_amount)}
                      {person.paid_at
                        ? ` · paid ${formatBookingDate(person.paid_at)}`
                        : " · still to pay"}
                    </span>
                  </span>
                  {person.paid_at ? (
                    <Badge tone="positive">
                      <Check className="size-3" aria-hidden="true" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge tone="caution">Pending</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="rounded-tile bg-panel-raised px-3 py-2 text-[10px] leading-relaxed text-subtle">
          This receipt is a record of the booking and the shares recorded in
          QUARTERS. It is not a tenancy agreement or proof of a bank transfer.
        </p>
      </div>
    </BottomSheet>
  );
}
