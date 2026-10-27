import type { RentPeriod } from "@/listings/listing-detail";

/**
 * The itemised cost of moving in.
 *
 * The rent alone used to be the whole price story on a listing, with agency
 * fees, caution deposits and "utilities extra" left to the description. These
 * helpers turn the structured columns into lines, a total, and an explicit list
 * of what the provider never stated, so the screen can say "at least" instead of
 * implying the rent is all a student pays.
 */
export type ListingCostFields = {
  rent_amount: number | null;
  rent_period: RentPeriod | null;
  rent_session_months: number | null;
  agency_fee_amount: number | null;
  caution_deposit_amount: number | null;
  utilities_amount: number | null;
  utilities_period: RentPeriod | null;
  utilities_note: string | null;
};

export type MoveInCostLineId = "rent" | "agency" | "caution" | "utilities";

export type MoveInCostLine = {
  id: MoveInCostLineId;
  label: string;
  amount: number | null;
  /** Short qualifier shown under the amount, e.g. "One-off", "per month". */
  note: string | null;
  /** False when the provider left this cost unstated. */
  stated: boolean;
};

export type MoveInCosts = {
  lines: MoveInCostLine[];
  /**
   * Sum of the stated move-in costs. Rent and a comparable utilities figure are
   * included; when `unstated` is not empty this is a lower bound, not a total.
   */
  total: number | null;
  /** Utilities are charged on a period the rent cannot be compared to. */
  utilitiesExcluded: boolean;
  /** Labels of the costs the provider has not stated. */
  unstated: string[];
  /** True when at least one cost line is filled in. */
  hasAny: boolean;
};

const periodWords: Record<RentPeriod, string> = {
  week: "week",
  month: "month",
  quarter: "quarter",
  term: "session",
  year: "year",
};

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** `₦850,000` — the app formats every NGN amount the same way. */
export function formatNaira(amount: number): string {
  return nairaFormatter.format(amount);
}

/** `per month`, `per session` — how a recurring amount is charged. */
export function periodPhrase(period: RentPeriod | null): string | null {
  return period ? `per ${periodWords[period]}` : null;
}

export function computeMoveInCosts(listing: ListingCostFields): MoveInCosts {
  const rent = listing.rent_amount;
  const agency = listing.agency_fee_amount;
  const caution = listing.caution_deposit_amount;
  const utilities = listing.utilities_amount;

  const rentNote = [
    periodPhrase(listing.rent_period),
    listing.rent_session_months != null
      ? `${listing.rent_session_months}-month session`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const utilitiesNote = [
    periodPhrase(listing.utilities_period),
    listing.utilities_note,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * Utilities may only be added to the rent when both are charged over the same
   * period; ₦20,000 a month is not part of a per-session rent.
   */
  const utilitiesComparable =
    utilities != null &&
    listing.utilities_period != null &&
    listing.rent_period != null &&
    listing.utilities_period === listing.rent_period;

  const lines: MoveInCostLine[] = [
    {
      id: "rent",
      label: "Rent",
      amount: rent,
      note: rentNote || null,
      stated: rent != null,
    },
    {
      id: "agency",
      label: "Agency fee",
      amount: agency,
      note: agency != null ? "One-off" : null,
      stated: agency != null,
    },
    {
      id: "caution",
      label: "Caution deposit",
      amount: caution,
      note: caution != null ? "Refundable" : null,
      stated: caution != null,
    },
    {
      id: "utilities",
      label: "Utilities",
      amount: utilities,
      note: utilitiesNote || null,
      stated: utilities != null,
    },
  ];

  const unstated = lines
    .filter((line) => !line.stated && line.id !== "rent")
    .map((line) => line.label);

  const total =
    rent == null
      ? null
      : rent +
        (agency ?? 0) +
        (caution ?? 0) +
        (utilitiesComparable ? utilities! : 0);

  return {
    lines,
    total,
    utilitiesExcluded: utilities != null && !utilitiesComparable,
    unstated,
    hasAny: lines.some((line) => line.stated),
  };
}
