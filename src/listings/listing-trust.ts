/**
 * Listing-level trust signals.
 *
 * "Approved provider" says an account may publish here. It says nothing about
 * a particular room, so a room also carries marks a moderator set by hand:
 * the listing's details were verified, and/or the property was inspected. Both
 * live on the listing row as timestamps and are null until a moderator acts, so
 * nothing here is inferred from the provider's standing.
 */

/** One mark a room can carry, as the card shows it. */
export type ListingTrustBadgeKey = "verified" | "inspected";

export type ListingTrustBadge = {
  key: ListingTrustBadgeKey;
  /** Short enough for a card, e.g. "Verified listing". */
  label: string;
};

/** One line of the room page's trust panel. */
export type ListingTrustCheck = {
  key: "provider" | ListingTrustBadgeKey;
  label: string;
  /** What the check actually means, in the app's words. */
  detail: string;
  /** Whether the check is on record for this room right now. */
  inForce: boolean;
  /** When it happened. Null when there is no date (approval) or no check. */
  checkedAt: string | null;
};

export type ListingTrustInput = {
  /** Stamped by a moderator when the listing's details were checked. */
  verifiedAt: string | null;
  /** Stamped by a moderator when the property was visited. */
  inspectedAt: string | null;
};

const badgeLabels: Record<ListingTrustBadgeKey, string> = {
  verified: "Verified listing",
  inspected: "Inspected",
};

/**
 * The badges a room has actually earned, in the order they are shown. An
 * inspection is the stronger mark, so it leads.
 */
export function listingTrustBadges({
  verifiedAt,
  inspectedAt,
}: ListingTrustInput): ListingTrustBadge[] {
  const badges: ListingTrustBadge[] = [];
  if (inspectedAt) badges.push({ key: "inspected", label: badgeLabels.inspected });
  if (verifiedAt) badges.push({ key: "verified", label: badgeLabels.verified });
  return badges;
}

/**
 * The room page's trust panel: provider approval plus the two listing marks,
 * each with the date it happened or an honest "not checked".
 */
export function listingTrustChecks({
  providerApproved,
  verifiedAt,
  inspectedAt,
}: ListingTrustInput & { providerApproved: boolean }): ListingTrustCheck[] {
  return [
    {
      key: "provider",
      label: "Provider approved",
      detail: "Authorised to publish rooms on QUARTERS.",
      inForce: providerApproved,
      // Approval has no timestamp of its own on the listing row.
      checkedAt: null,
    },
    {
      key: "verified",
      label: "Listing verified",
      detail:
        "QUARTERS checked the address, rent and room details against what the lister states.",
      inForce: Boolean(verifiedAt),
      checkedAt: verifiedAt,
    },
    {
      key: "inspected",
      label: "Property inspected",
      detail: "Someone from QUARTERS visited this property in person.",
      inForce: Boolean(inspectedAt),
      checkedAt: inspectedAt,
    },
  ];
}

/**
 * What the marks do not mean, said once on the room page so a badge can never
 * be read as a guarantee.
 */
export const LISTING_TRUST_DISCLAIMER =
  "These are checks on the listing, not a tenancy guarantee. QUARTERS is not a party to your agreement with the lister, so read the room and the paperwork yourself before you pay.";
