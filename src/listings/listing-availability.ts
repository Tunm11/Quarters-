/**
 * Month-by-month availability for a listing.
 *
 * Every month shown is derived from something the provider actually told us:
 * the earliest move-in date, the dated holds on the listing, the availability
 * status, and the rooms students already hold. Nothing here invents a schedule —
 * when a listing carries no dated information the calendar is empty and the
 * screen says the move-in date was not stated, rather than painting twelve
 * months of green.
 */

export type AvailabilityState =
  | "open"
  | "soon"
  | "held"
  | "closed"
  | "unknown";

export type AvailabilityHold = {
  starts_on: string;
  ends_on: string;
  note?: string | null;
};

export type AvailabilityMonth = {
  /** `YYYY-MM`, stable key for React and for tests. */
  key: string;
  /** `Sep` */
  label: string;
  /** `Sep 2026` */
  longLabel: string;
  year: number;
  /** First day of the month, `YYYY-MM-DD`. */
  startsOn: string;
  /** Last day of the month, `YYYY-MM-DD`. */
  endsOn: string;
  state: AvailabilityState;
  note: string | null;
};

export type AvailabilityCalendar = {
  months: AvailabilityMonth[];
  /** One line for the section header. */
  headline: string;
  /** Supporting line, or null when the headline says it all. */
  detail: string | null;
  /** Rooms still free, when the listing states a room count. */
  availableRooms: number | null;
  /** False when the provider has given no dates at all. */
  hasDatedInfo: boolean;
};

export type AvailabilityInput = {
  availableFrom: string | null;
  availabilityStatus: "available" | "limited" | "unavailable";
  totalRooms: number | null;
  /** Rooms other students already hold in this listing. */
  takenRooms: number;
  holds: AvailabilityHold[];
  /** Injectable clock, so the calendar is testable. */
  now?: Date;
  /** How many months to lay out. Defaults to a school-year span. */
  months?: number;
};

export const AVAILABILITY_LABELS: Record<AvailabilityState, string> = {
  open: "Open",
  soon: "Not yet",
  held: "Held",
  closed: "Closed",
  unknown: "Unstated",
};

const monthShort = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});
const monthLong = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `1 Sept 2026` for an ISO date, parsed as UTC so the day never shifts. */
export function formatDate(isoDate: string): string {
  return dayFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function lastDayOf(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

export function buildAvailabilityCalendar(
  input: AvailabilityInput,
): AvailabilityCalendar {
  const now = input.now ?? new Date();
  const monthCount = input.months ?? 12;
  const availableRooms =
    input.totalRooms != null
      ? Math.max(0, input.totalRooms - input.takenRooms)
      : null;

  const everyRoomTaken =
    input.totalRooms != null &&
    input.totalRooms > 0 &&
    input.takenRooms >= input.totalRooms;

  const hasDatedInfo =
    input.availableFrom != null || input.holds.length > 0;

  const headline = (() => {
    if (input.availabilityStatus === "unavailable") {
      return "The provider has marked this room unavailable.";
    }
    if (everyRoomTaken) {
      return "Every room here is taken right now.";
    }
    if (input.availableFrom) {
      return `Free from ${formatDate(input.availableFrom)}`;
    }
    return "Move-in date not stated";
  })();

  const detail = (() => {
    if (input.availabilityStatus === "unavailable") {
      return availableRooms != null
        ? `${availableRooms} of ${input.totalRooms} rooms are free.`
        : null;
    }
    if (everyRoomTaken) return null;
    if (input.availableFrom && availableRooms != null) {
      return `${availableRooms} of ${input.totalRooms} rooms are free.`;
    }
    if (input.availableFrom) return null;
    return availableRooms != null
      ? `${availableRooms} of ${input.totalRooms} rooms are free — ask the provider when you could move in.`
      : "Ask the provider when you could move in.";
  })();

  // No dates means no calendar: a grid of "unknown" would still imply a
  // schedule the provider never gave.
  if (!hasDatedInfo && input.availabilityStatus !== "unavailable" && !everyRoomTaken) {
    return {
      months: [],
      headline,
      detail,
      availableRooms,
      hasDatedInfo,
    };
  }

  const startYear = now.getUTCFullYear();
  const startMonth = now.getUTCMonth();
  const months: AvailabilityMonth[] = [];

  for (let offset = 0; offset < monthCount; offset += 1) {
    const cursor = new Date(Date.UTC(startYear, startMonth + offset, 1));
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const startsOn = isoDate(year, monthIndex, 1);
    const endsOn = isoDate(year, monthIndex, lastDayOf(year, monthIndex));

    let state: AvailabilityState = "open";
    let note: string | null = null;

    if (input.availabilityStatus === "unavailable") {
      state = "closed";
      note = "Marked unavailable";
    } else if (everyRoomTaken) {
      state = "closed";
      note = "Every room is taken";
    } else {
      const hold = input.holds.find(
        (candidate) =>
          candidate.starts_on <= endsOn && candidate.ends_on >= startsOn,
      );

      if (input.availableFrom && input.availableFrom > endsOn) {
        // The whole month falls before the move-in date.
        state = "soon";
        note = `Free from ${formatDate(input.availableFrom)}`;
      } else if (hold) {
        state = "held";
        note = hold.note?.trim() || "Held";
      } else if (!input.availableFrom) {
        state = "unknown";
        note = "Ask the provider";
      } else if (input.availableFrom > startsOn) {
        state = "open";
        note = `Free from ${formatDate(input.availableFrom)}`;
      } else if (input.availabilityStatus === "limited") {
        state = "open";
        note = "Limited rooms";
      }
    }

    months.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label: monthShort.format(cursor),
      longLabel: monthLong.format(cursor),
      year,
      startsOn,
      endsOn,
      state,
      note,
    });
  }

  return { months, headline, detail, availableRooms, hasDatedInfo };
}
