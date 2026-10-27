import { CircleCheck, Flag, ShieldOff, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  REPORT_DETAILS_MAX,
  blockRoommate,
  loadMyOpenReport,
  reportReasonLabel,
  reportRoommate,
  roommateReportReasons,
  validateReport,
  type RoommateReportReason,
  type RoommateReportSummary,
} from "@/roommates/safety";

export type RoommateSafetyMode = "block" | "report";

export type RoommateSafetySheetProps = {
  open: boolean;
  mode: RoommateSafetyMode;
  onClose: () => void;
  profileId: string;
  displayName: string;
  viewerId: string | null;
  /** Called after a successful block so the caller can leave the profile. */
  onBlocked?: () => void;
};

/**
 * Block or report a roommate.
 *
 * Blocking is confirmed first because it hides both profiles and ends the
 * conversation. Reporting asks for a reason and only reaches moderators.
 */
export function RoommateSafetySheet({
  open,
  mode,
  onClose,
  profileId,
  displayName,
  viewerId,
  onBlocked,
}: RoommateSafetySheetProps) {
  const firstName = displayName.trim().split(/\s+/)[0] || "this roommate";
  const detailsId = useId();
  const detailsHelpId = useId();

  const [reason, setReason] = useState<RoommateReportReason | "">("");
  const [details, setDetails] = useState("");
  const [report, setReport] = useState<RoommateReportSummary | null>(null);
  const [reportCheck, setReportCheck] = useState<"idle" | "loading" | "ready">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  // Each open starts clean; the already-reported check is refreshed per profile.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setDetails("");
    setReportError(null);
    setBlockError(null);
    setReport(null);

    if (mode !== "report" || !viewerId || !supabase) {
      setReportCheck("idle");
      return;
    }

    let active = true;
    setReportCheck("loading");
    void loadMyOpenReport(supabase, {
      reporterId: viewerId,
      profileId,
    }).then((result) => {
      if (!active) return;
      if (result.error) {
        setReportError(result.error);
        setReportCheck("ready");
        return;
      }
      setReport(result.report);
      setReportCheck("ready");
    });

    return () => {
      active = false;
    };
  }, [mode, open, profileId, viewerId]);

  async function handleBlock() {
    setBlockError(null);
    if (!viewerId) {
      setBlockError("Sign in to block this roommate.");
      return;
    }
    if (!supabase) {
      setBlockError("Blocking is unavailable because Supabase is not configured.");
      return;
    }

    setBlocking(true);
    const result = await blockRoommate(supabase, {
      blockerId: viewerId,
      profileId,
      displayName,
    });
    setBlocking(false);

    if (result.error) {
      setBlockError(result.error);
      return;
    }
    onBlocked?.();
  }

  async function handleReport() {
    setReportError(null);
    const validation = validateReport(reason, details);
    if (validation) {
      setReportError(validation);
      return;
    }
    if (!viewerId) {
      setReportError("Sign in to report this roommate.");
      return;
    }
    if (!supabase) {
      setReportError("Reporting is unavailable because Supabase is not configured.");
      return;
    }

    setReporting(true);
    const result = await reportRoommate(supabase, {
      reporterId: viewerId,
      profileId,
      reason: reason as RoommateReportReason,
      details,
    });
    setReporting(false);

    if (result.error || !result.report) {
      setReportError(result.error ?? "Could not send your report. Please try again.");
      return;
    }
    setReport(result.report);
    setDetails("");
  }

  const showReportForm = mode === "report" && !report;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={mode === "block" ? `Block ${firstName}` : `Report ${firstName}`}
    >
      {mode === "block" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-tile border border-danger/30 bg-danger/5 p-3.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted">
              Blocking <span className="font-medium text-foreground">{displayName}</span>{" "}
              hides your profiles from each other, withdraws any interest between you, and
              stops new messages in both directions. Existing messages stay on file for
              moderation.
            </p>
          </div>

          <ul className="flex flex-col gap-2 text-xs leading-relaxed text-muted">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
              They cannot send you interest or messages.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
              You can undo this later from Settings → Privacy &amp; data.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
              If they broke the rules, report them as well so moderators can act.
            </li>
          </ul>

          {blockError && <InlineAlert>{blockError}</InlineAlert>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="border-danger/60 text-danger hover:border-danger hover:text-danger"
              loading={blocking}
              onClick={() => void handleBlock()}
              icon={<ShieldOff className="size-4" />}
            >
              Block {firstName}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={blocking}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reportCheck === "loading" && (
            <p role="status" className="text-sm text-muted">
              Checking for an existing report…
            </p>
          )}

          {report && (
            <div className="flex flex-col gap-3 rounded-tile border border-positive/30 bg-positive/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">Report already sent</p>
                  <p className="text-xs leading-relaxed text-muted">
                    You reported this roommate for {reportReasonLabel(report.reason).toLowerCase()}. A
                    moderator is reviewing it and will not tell them who reported.
                  </p>
                </div>
              </div>
              {blockError && <InlineAlert>{blockError}</InlineAlert>}
              {!blocking && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  onClick={() => void handleBlock()}
                  icon={<ShieldOff className="size-4" />}
                >
                  Also block {firstName}
                </Button>
              )}
            </div>
          )}

          {showReportForm && (
            <>
              <p className="text-sm leading-relaxed text-muted">
                Reports go only to QUARTERS moderators. {firstName} will not be told who
                reported them.
              </p>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium tracking-wide text-muted">
                  What happened?
                </legend>
                <div className="flex flex-col gap-2">
                  {roommateReportReasons.map((option) => {
                    const selected = reason === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-tile border px-3.5 py-3 transition-colors select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-soft",
                          selected
                            ? "border-accent/60 bg-accent/10"
                            : "border-line bg-panel-raised hover:border-line-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name="report-reason"
                          value={option.value}
                          checked={selected}
                          onChange={() => {
                            setReason(option.value);
                            setReportError(null);
                          }}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                            selected ? "border-accent bg-accent" : "border-line-strong",
                          )}
                        >
                          {selected && <span className="size-1.5 rounded-full bg-accent-ink" />}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">
                            {option.label}
                          </span>
                          <span className="text-xs leading-relaxed text-subtle">
                            {option.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <label htmlFor={detailsId} className="text-xs font-medium tracking-wide text-muted">
                  Details{" "}
                  <span className="font-normal text-subtle">
                    {reason === "other" ? "(required)" : "(optional)"}
                  </span>
                </label>
                <textarea
                  id={detailsId}
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value);
                    setReportError(null);
                  }}
                  rows={4}
                  maxLength={REPORT_DETAILS_MAX}
                  aria-describedby={detailsHelpId}
                  placeholder="What did they say or do? Include dates if you can."
                  className="min-h-24 w-full resize-y rounded-tile border border-line bg-panel px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60"
                />
                <div className="flex items-center justify-between gap-3">
                  <p id={detailsHelpId} className="text-[11px] leading-relaxed text-subtle">
                    Never share bank details or passwords.
                  </p>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {details.length}/{REPORT_DETAILS_MAX}
                  </span>
                </div>
              </div>

              {reportError && <InlineAlert>{reportError}</InlineAlert>}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleReport()}
                  loading={reporting}
                  disabled={reportCheck === "loading"}
                  icon={<Flag className="size-4" />}
                >
                  Send report
                </Button>
                <Button variant="ghost" onClick={onClose} disabled={reporting}>
                  Cancel
                </Button>
              </div>
            </>
          )}

        </div>
      )}
    </BottomSheet>
  );
}
