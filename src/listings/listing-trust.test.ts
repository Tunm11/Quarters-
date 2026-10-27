import { describe, expect, it } from "vitest";
import {
  LISTING_TRUST_DISCLAIMER,
  listingTrustBadges,
  listingTrustChecks,
} from "@/listings/listing-trust";

describe("listing trust signals", () => {
  it("shows no marks for a room nobody checked", () => {
    expect(listingTrustBadges({ verifiedAt: null, inspectedAt: null })).toEqual([]);
  });

  it("shows the verified mark on its own", () => {
    expect(
      listingTrustBadges({ verifiedAt: "2026-10-20T09:00:00+00:00", inspectedAt: null }),
    ).toEqual([{ key: "verified", label: "Verified listing" }]);
  });

  it("leads with the inspection, because it is the stronger mark", () => {
    expect(
      listingTrustBadges({
        verifiedAt: "2026-10-20T09:00:00+00:00",
        inspectedAt: "2026-10-22T09:00:00+00:00",
      }).map((badge) => badge.key),
    ).toEqual(["inspected", "verified"]);
  });

  it("keeps provider approval separate from the listing's own checks", () => {
    const checks = listingTrustChecks({
      providerApproved: true,
      verifiedAt: null,
      inspectedAt: null,
    });

    expect(checks.map((check) => check.key)).toEqual([
      "provider",
      "verified",
      "inspected",
    ]);
    // Approval is about the account, so it never stands in for a listing check.
    expect(checks[0].inForce).toBe(true);
    expect(checks[1].inForce).toBe(false);
    expect(checks[2].inForce).toBe(false);
  });

  it("reports the date each check happened", () => {
    const checks = listingTrustChecks({
      providerApproved: false,
      verifiedAt: "2026-10-20T09:00:00+00:00",
      inspectedAt: "2026-10-22T09:00:00+00:00",
    });

    expect(checks[1]).toMatchObject({
      inForce: true,
      checkedAt: "2026-10-20T09:00:00+00:00",
    });
    expect(checks[2]).toMatchObject({
      inForce: true,
      checkedAt: "2026-10-22T09:00:00+00:00",
    });
    // Approval carries no date of its own.
    expect(checks[0].checkedAt).toBeNull();
  });

  it("says the marks are not a tenancy guarantee", () => {
    expect(LISTING_TRUST_DISCLAIMER).toContain("not a tenancy guarantee");
  });
});
