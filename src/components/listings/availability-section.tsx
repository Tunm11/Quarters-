import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import {
  AVAILABILITY_LABELS,
  buildAvailabilityCalendar,
  type AvailabilityHold,
  type AvailabilityMonth,
  type AvailabilityState,
} from "@/listings/listing-availability";
import { loadBookedRooms } from "@/listings/room-bookings";
import { supabase } from "@/lib/supabase";

export type AvailabilitySectionProps = {
  listingId: string;
  availableFrom: string | null;
  availabilityStatus: "available" | "limited" | "unavailable";
  totalRooms: number | null;
};

const stateStyles: Record<AvailabilityState, string> = {
  open: "border-positive/30 bg-positive/10 text-positive",
  soon: "border-line bg-panel text-muted",
  held: "border-caution/30 bg-caution/10 text-caution",
  closed: "border-line bg-panel-raised text-subtle",
  unknown: "border-line bg-panel text-subtle",
};

const legendOrder: AvailabilityState[] = ["open", "held", "soon", "closed"];

const legendDots: Record<AvailabilityState, string> = {
  open: "bg-positive",
  soon: "bg-line-strong",
  held: "bg-caution",
  closed: "bg-subtle",
  unknown: "bg-line-strong",
};

/**
 * Twelve months of availability, built only from what the provider stated: the
 * earliest move-in date, dated holds, the listing's availability status and the
 * rooms students already hold. A listing with no dates shows no grid — an empty
 * calendar would imply a schedule nobody gave.
 */
export function AvailabilitySection({
  listingId,
  availableFrom,
  availabilityStatus,
  totalRooms,
}: AvailabilitySectionProps) {
  const [holds, setHolds] = useState<AvailabilityHold[]>([]);
  const [takenRooms, setTakenRooms] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let active = true;

    async function load() {
      const client = supabase;
      if (!client) {
        if (active) setStatus("ready");
        return;
      }

      const [holdsResult, bookedResult] = await Promise.all([
        client
          .from("listing_availability_holds")
          .select("starts_on, ends_on, note")
          .eq("listing_id", listingId)
          .order("starts_on", { ascending: true }),
        loadBookedRooms(client, listingId),
      ]);

      if (!active) return;
      // A missing migration or a refused read degrades to "no dated holds":
      // the calendar then shows exactly what the listing itself states.
      setHolds((holdsResult.data ?? []) as AvailabilityHold[]);
      setTakenRooms(bookedResult.booked.length);
      setStatus("ready");
    }

    void load();
    return () => {
      active = false;
    };
  }, [listingId]);

  const calendar = buildAvailabilityCalendar({
    availableFrom,
    availabilityStatus,
    totalRooms,
    takenRooms,
    holds,
  });

  return (
    <section
      aria-labelledby="availability-heading"
      className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="availability-heading" className="text-sm font-semibold text-foreground">
          Availability
        </h2>
        <p className="text-xs font-medium text-foreground">{calendar.headline}</p>
        {calendar.detail && (
          <p className="text-[11px] leading-relaxed text-muted">{calendar.detail}</p>
        )}
      </div>

      {status === "loading" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-tile" />
          ))}
        </div>
      ) : calendar.months.length > 0 ? (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {calendar.months.map((month, index) => (
              <MonthTile key={month.key} month={month} first={index === 0} />
            ))}
          </ul>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {legendOrder.map((state) => (
              <li key={state} className="flex items-center gap-1.5 text-[10px] text-subtle">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-pill", legendDots[state])}
                />
                {AVAILABILITY_LABELS[state]}
              </li>
            ))}
          </ul>
          <p className="text-[10px] leading-relaxed text-subtle">
            Months follow the dates the provider gave and the rooms other students
            hold. A held month can still free up — message the provider before you
            plan around it.
          </p>
        </>
      ) : null}
    </section>
  );
}

function MonthTile({ month, first }: { month: AvailabilityMonth; first: boolean }) {
  const showYear = first || month.label === "Jan";
  const description = `${month.longLabel}: ${AVAILABILITY_LABELS[month.state]}${
    month.note ? `, ${month.note}` : ""
  }`;

  return (
    <li
      aria-label={description}
      className={cn(
        "flex min-w-0 flex-col items-start gap-0.5 rounded-tile border px-2.5 py-2",
        stateStyles[month.state],
      )}
    >
      <span className="text-[11px] font-semibold whitespace-nowrap">
        {month.label}
        {showYear ? ` ${month.year}` : ""}
      </span>
      <span className="text-[10px] leading-tight">{AVAILABILITY_LABELS[month.state]}</span>
      {month.note && month.state !== "unknown" && (
        <span className="line-clamp-2 text-[10px] leading-tight opacity-80">
          {month.note}
        </span>
      )}
    </li>
  );
}
