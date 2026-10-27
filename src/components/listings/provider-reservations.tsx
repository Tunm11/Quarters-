import { Check, DoorOpen, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShare } from "@/listings/booking-group";
import {
  loadProviderReservations,
  respondToReservation,
  type ProviderReservation,
  type RoomReservationStatus,
} from "@/listings/provider-reservations";
import { supabase } from "@/lib/supabase";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const statusMeta: Record<
  RoomReservationStatus,
  { label: string; tone: BadgeTone }
> = {
  requested: { label: "Awaiting your answer", tone: "caution" },
  approved: { label: "Approved", tone: "positive" },
  declined: { label: "Declined", tone: "neutral" },
};

/**
 * The owner/agent side of a room reservation: the student's group has paid for
 * a room, and the listing's provider decides whether they can have it.
 *
 * Declining releases the room and closes the group, so the roommates can book
 * another one. Only reservations on the signed-in provider's own listings come
 * back from the database.
 */
export function ProviderReservations({ enabled }: { enabled: boolean }) {
  const [reservations, setReservations] = useState<ProviderReservation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setReservations([]);
      setError(null);
      setStatus("ready");
      return;
    }

    setStatus("loading");
    const result = await loadProviderReservations(client);
    if (result.error) {
      setReservations([]);
      setError(result.error);
      setStatus("error");
      return;
    }
    setReservations(result.reservations);
    setError(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  async function answer(reservation: ProviderReservation, approve: boolean) {
    const client = supabase;
    if (!client || busy) return;

    setBusy(reservation.reservationId);
    setActionError(null);
    const result = await respondToReservation(client, {
      reservationId: reservation.reservationId,
      approve,
    });
    setBusy(null);

    if (result.error) {
      setActionError(result.error);
      return;
    }
    await reload();
  }

  if (!enabled) return null;

  const pending = reservations.filter((row) => row.status === "requested");

  return (
    <section
      aria-labelledby="provider-reservations-heading"
      className="mt-8 flex flex-col gap-4"
    >
      <SectionHeading
        id="provider-reservations-heading"
        eyebrow="Reservations"
        title="Room requests"
        description="A student group has paid for a room and is waiting for you. Approving holds the room for them; declining frees it and closes their booking."
      />

      {actionError && <InlineAlert>{actionError}</InlineAlert>}

      {status === "loading" && (
        <Panel className="flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </Panel>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3">
          <InlineAlert>{error}</InlineAlert>
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => void reload()}
            icon={<RefreshCw className="size-4" />}
          >
            Try again
          </Button>
        </div>
      )}

      {status === "ready" && reservations.length === 0 && (
        <EmptyState
          icon={DoorOpen}
          title="No room requests yet"
          description="When a student group pays for one of your rooms, the reservation appears here for your approval."
          note="Only requests on your own listings are ever shown."
        />
      )}

      {status === "ready" && reservations.length > 0 && (
        <ul className="flex list-none flex-col gap-2.5">
          {reservations.map((reservation) => {
            const meta = statusMeta[reservation.status];
            const acting = busy === reservation.reservationId;
            return (
              <li
                key={reservation.reservationId}
                className="flex flex-col gap-3 rounded-tile border border-line bg-panel p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Room {reservation.roomNumber} · {reservation.listingTitle}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {reservation.requesterName} ·{" "}
                      {timeFormatter.format(new Date(reservation.requestedAt))}
                    </p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                {reservation.totalAmount != null && reservation.memberCount > 0 && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-[11px] text-muted">
                    <span className="font-medium text-foreground">
                      {formatShare(reservation.totalAmount)} rent
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {reservation.paidCount} of {reservation.memberCount} shares
                      paid
                    </span>
                    {reservation.paidCount === reservation.memberCount && (
                      <Badge tone="positive">
                        <Check className="size-3" aria-hidden="true" />
                        Fully paid
                      </Badge>
                    )}
                  </p>
                )}

                {reservation.status === "requested" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void answer(reservation, true)}
                      loading={acting}
                      disabled={busy !== null}
                      icon={<Check className="size-4" />}
                    >
                      Approve room
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void answer(reservation, false)}
                      disabled={busy !== null}
                      icon={<X className="size-4" />}
                    >
                      Decline
                    </Button>
                    <p className="text-[11px] text-subtle">
                      Declining closes the group and releases the room.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-subtle">
                    {reservation.status === "approved"
                      ? "The room is held for this student."
                      : "The room was released; the group was closed."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {status === "ready" && pending.length > 0 && (
        <p className="text-[11px] leading-relaxed text-subtle">
          {pending.length === 1
            ? "1 request is waiting for your answer."
            : `${pending.length} requests are waiting for your answer.`}
        </p>
      )}
    </section>
  );
}
