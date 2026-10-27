import { Flag } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  REPORT_DETAILS_MAX,
  loadMyListingReport,
  listingReportReasonLabel,
  listingReportReasons,
  submitListingReport,
  validateReport,
  type ListingReport,
  type ListingReportReason,
} from "@/listings/listing-reports";
import { supabase } from "@/lib/supabase";

export type ReportListingSheetProps = {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  viewerId: string | null;
  /** Fires once the row is written, so the host can confirm it. */
  onFiled?: (report: ListingReport, duplicate: boolean) => void;
};

/**
 * The report form itself, without a trigger.
 *
 * Kept separate because a listing can be reported from more than one place —
 * the room page's own control and the conversation with the lister — and both
 * must write the same row through the same rules.
 */
export function ReportListingSheet({
  open,
  onClose,
  listingId,
  listingTitle,
  viewerId,
  onFiled,
}: ReportListingSheetProps) {
  const [reason, setReason] = useState<ListingReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every open starts clean, so a previous draft never leaks into a new report.
  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetails("");
    setError(null);
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !viewerId) return;

    const validation = validateReport({ reason, details });
    if (validation || !reason) {
      setError(validation ?? "Choose why you are reporting this listing.");
      return;
    }

    const client = supabase;
    if (!client) {
      setError("Reporting is unavailable right now. Please try again later.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await submitListingReport(client, {
      listingId,
      reporterId: viewerId,
      reason,
      details,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onFiled?.(
      {
        id: "pending",
        reason,
        status: "open",
        created_at: new Date().toISOString(),
      },
      result.duplicate,
    );
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Report this listing"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form="report-listing-form"
            loading={saving}
            disabled={reason == null}
            className="flex-1"
            icon={<Flag className="size-4" />}
          >
            Send report
          </Button>
        </div>
      }
    >
      <form
        id="report-listing-form"
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <p className="text-xs leading-relaxed text-muted">
          Reporting <span className="font-medium text-foreground">{listingTitle}</span>{" "}
          sends a private note to QUARTERS administrators. The provider is not
          told who reported them.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium tracking-wide text-muted">
            What is wrong?
          </legend>
          <div className="flex flex-col gap-2">
            {listingReportReasons.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-tile border p-3 transition-colors",
                  reason === option.value
                    ? "border-accent/50 bg-accent/8"
                    : "border-line bg-panel-raised hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="listing-report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="mt-0.5 size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="text-[11px] leading-relaxed text-subtle">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="listing-report-details"
            className="text-xs font-medium tracking-wide text-muted"
          >
            Anything else? {reason === "other" ? "(required)" : "(optional)"}
          </label>
          <textarea
            id="listing-report-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={4}
            maxLength={REPORT_DETAILS_MAX}
            placeholder="What did you see? Dates, amounts and what the provider said all help."
            className="w-full resize-none rounded-tile border border-line bg-panel p-4 text-sm leading-relaxed text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
          />
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </BottomSheet>
  );
}

export type ReportListingProps = {
  listingId: string;
  listingTitle: string;
  viewerId: string | null;
  /** Sends a signed-out visitor to sign in and back to this listing. */
  onRequireAuth: () => void;
};

/**
 * Report a listing.
 *
 * Filing writes one row that only the reporter and administrators can read; the
 * sheet never claims the listing was taken down. A second report from the same
 * account is answered honestly instead of being silently dropped.
 */
export function ReportListing({
  listingId,
  listingTitle,
  viewerId,
  onRequireAuth,
}: ReportListingProps) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<ListingReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!viewerId || !supabase) {
        if (active) setExisting(null);
        return;
      }
      const report = await loadMyListingReport(supabase, listingId);
      if (active) setExisting(report);
    }

    void load();
    return () => {
      active = false;
    };
  }, [listingId, viewerId]);

  function openSheet() {
    if (!viewerId) {
      onRequireAuth();
      return;
    }
    setNotice(null);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-2 px-1">
      {existing ? (
        <p className="text-[11px] leading-relaxed text-subtle">
          You reported this listing
          {existing.id !== "pending"
            ? ` (${listingReportReasonLabel(existing.reason).toLowerCase()})`
            : ""}
          . It is with our reviewers.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">Something wrong with this listing?</p>
          <button
            type="button"
            onClick={openSheet}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
          >
            <Flag className="size-3.5" aria-hidden="true" />
            Report this listing
          </button>
        </div>
      )}

      {notice && (
        <p role="status" className="text-[11px] text-positive">
          {notice}
        </p>
      )}

      <ReportListingSheet
        open={open}
        onClose={() => setOpen(false)}
        listingId={listingId}
        listingTitle={listingTitle}
        viewerId={viewerId}
        onFiled={(report, duplicate) => {
          setExisting(report);
          setNotice(
            duplicate
              ? "You had already reported this listing — it is still with our reviewers."
              : "Thanks — an administrator will review this listing.",
          );
        }}
      />
    </div>
  );
}
