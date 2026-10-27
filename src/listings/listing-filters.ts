import {
  accommodationTypeLabels,
  formatRentShort,
  type PublicListing,
  type RentBand,
} from "@/listings/public-listings";
import type { ListingRow } from "@/lib/database.types";

/**
 * The filter options offered on Explore. They are built from the rooms that are
 * actually published, so a group never offers a choice that matches nothing and
 * nothing is invented while the catalogue is empty.
 */
export type BudgetOption = {
  id: string;
  label: string;
  count: number;
  band: RentBand;
};

export type TypeOption = {
  id: ListingRow["accommodation_type"];
  label: string;
  count: number;
};

export type BedroomOption = {
  id: string;
  label: string;
  count: number;
  value: number;
};

export type FacilityOption = {
  id: string;
  label: string;
  count: number;
};

export type ListingFilterOptions = {
  budget: BudgetOption[];
  types: TypeOption[];
  bedrooms: BedroomOption[];
  facilities: FacilityOption[];
};

/** How many facilities the sheet lists before it stops offering more. */
const FACILITY_LIMIT = 12;

function countBy<T>(items: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Rounds a threshold to the nearest ₦50k so band labels read like prices. */
function roundToFiftyThousand(value: number): number {
  return Math.round(value / 50_000) * 50_000;
}

/**
 * Two thresholds split the published rents into three bands, so the budget
 * filter always reflects what is on offer instead of hard-coded assumptions
 * about what a Lagos room costs. Degenerate splits (a single price, or every
 * room in one band) collapse into fewer, still meaningful options.
 */
function buildBudgetOptions(listings: PublicListing[]): BudgetOption[] {
  const rents = listings
    .map((listing) => listing.rent_amount)
    .filter((amount): amount is number => amount != null)
    .sort((left, right) => left - right);

  if (rents.length === 0) return [];

  const lowThreshold = roundToFiftyThousand(rents[Math.floor(rents.length / 3)]);
  const highThreshold = roundToFiftyThousand(
    rents[Math.floor((rents.length * 2) / 3)],
  );

  const bands: RentBand[] = [
    { min: 0, max: lowThreshold },
    { min: lowThreshold + 1, max: highThreshold },
    { min: highThreshold + 1, max: null },
  ].filter((band, index) => {
    if (band.min > (band.max ?? Number.POSITIVE_INFINITY)) return false;
    // Drop an empty wedge so two identical thresholds do not offer two labels.
    if (index === 1 && lowThreshold === highThreshold) return false;
    return true;
  });

  return bands.flatMap((band) => {
    const count = rents.filter(
      (amount) =>
        amount >= band.min && (band.max == null || amount <= band.max),
    ).length;
    if (count === 0) return [];

    const label =
      band.max == null
        ? `Above ${formatRentShort(band.min - 1)}`
        : band.min === 0
          ? `Under ${formatRentShort(band.max + 1)}`
          : `${formatRentShort(band.min - 1)}–${formatRentShort(band.max)}`;

    return [{ id: label, label, count, band }];
  });
}

export function buildListingFilterOptions(
  listings: PublicListing[],
): ListingFilterOptions {
  const typeCounts = countBy(listings.map((listing) => listing.accommodation_type));
  const bedroomValues = listings
    .map((listing) => listing.bedrooms)
    .filter((value): value is number => value != null);
  const bedroomCounts = countBy(bedroomValues);
  const facilityCounts = countBy(listings.flatMap((listing) => listing.facilities));

  return {
    budget: buildBudgetOptions(listings),
    types: [...typeCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => ({
        id: type,
        label: accommodationTypeLabels[type],
        count,
      })),
    bedrooms: [...bedroomCounts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([value, count]) => ({
        id: String(value),
        label: `${value} bedroom${value === 1 ? "" : "s"}`,
        count,
        value,
      })),
    facilities: [...facilityCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, FACILITY_LIMIT)
      .map(([facility, count]) => ({ id: facility, label: facility, count })),
  };
}
