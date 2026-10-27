import { describe, expect, it } from "vitest";
import {
  computeMoveInCosts,
  formatNaira,
  periodPhrase,
  type ListingCostFields,
} from "@/listings/move-in-costs";

function listing(overrides: Partial<ListingCostFields> = {}): ListingCostFields {
  return {
    rent_amount: 800000,
    rent_period: "year",
    rent_session_months: 12,
    agency_fee_amount: null,
    caution_deposit_amount: null,
    utilities_amount: null,
    utilities_period: null,
    utilities_note: null,
    ...overrides,
  };
}

describe("computeMoveInCosts", () => {
  it("adds the stated one-off costs to the rent", () => {
    const costs = computeMoveInCosts(
      listing({ agency_fee_amount: 40000, caution_deposit_amount: 80000 }),
    );

    expect(costs.total).toBe(920000);
    expect(costs.unstated).toEqual(["Utilities"]);
    expect(costs.hasAny).toBe(true);
  });

  it("includes utilities when they share the rent period", () => {
    const costs = computeMoveInCosts(
      listing({
        rent_period: "month",
        rent_amount: 120000,
        utilities_amount: 20000,
        utilities_period: "month",
      }),
    );

    expect(costs.total).toBe(140000);
    expect(costs.utilitiesExcluded).toBe(false);
  });

  it("keeps utilities out of the total when the periods differ", () => {
    const costs = computeMoveInCosts(
      listing({ utilities_amount: 20000, utilities_period: "month" }),
    );

    // A monthly utilities figure is not part of an annual rent.
    expect(costs.total).toBe(800000);
    expect(costs.utilitiesExcluded).toBe(true);
    expect(costs.lines.find((line) => line.id === "utilities")?.stated).toBe(true);
  });

  it("names every cost the provider left out", () => {
    const costs = computeMoveInCosts(listing());

    expect(costs.unstated).toEqual(["Agency fee", "Caution deposit", "Utilities"]);
    expect(costs.lines.map((line) => line.stated)).toEqual([true, false, false, false]);
  });

  it("reports a missing rent instead of inventing a total", () => {
    const costs = computeMoveInCosts(listing({ rent_amount: null }));

    expect(costs.total).toBeNull();
    expect(costs.hasAny).toBe(false);
    expect(costs.unstated).not.toContain("Rent");
  });

  it("labels the periods it prints", () => {
    expect(periodPhrase("year")).toBe("per year");
    expect(periodPhrase("term")).toBe("per session");
    expect(periodPhrase(null)).toBeNull();

    const costs = computeMoveInCosts(
      listing({ utilities_amount: 10000, utilities_period: "month", utilities_note: "Metered" }),
    );
    expect(costs.lines.find((line) => line.id === "utilities")?.note).toBe(
      "per month · Metered",
    );
  });
});

describe("formatNaira", () => {
  it("formats whole naira without decimals", () => {
    expect(formatNaira(800000)).toContain("800,000");
    expect(formatNaira(800000)).not.toContain(".00");
  });
});
