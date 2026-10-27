import type { BadgeTone } from "@/components/ui/badge";
import type { ProviderStatus } from "@/provider/application";

/**
 * Applicant-facing copy for each provider authorisation state. "Approved"
 * means permission to publish on QUARTERS, not identity or property checks.
 */
export const providerStatusMeta: Record<
  ProviderStatus,
  { label: string; tone: BadgeTone; summary: string }
> = {
  pending: {
    label: "Pending review",
    tone: "caution",
    summary: "An administrator needs to review your application before you can publish.",
  },
  approved: {
    label: "Approved",
    tone: "positive",
    summary: "You can publish listings as an approved provider.",
  },
  rejected: {
    label: "Rejected",
    tone: "danger",
    summary: "This application was not approved, so publishing is not available.",
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    summary: "Publishing is paused while an administrator reviews this account.",
  },
};
