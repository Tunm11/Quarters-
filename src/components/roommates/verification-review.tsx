import {
  ArrowDown,
  BadgeCheck,
  CircleCheck,
  Flag,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  APPEAL_MESSAGE_MAX,
  APPEAL_MESSAGE_MIN,
  appealStatusMeta,
  validateAppeal,
  verificationAppealReasons,
  type VerificationAppeal,
  type VerificationAppealReason,
} from "@/roommates/verification-appeal";
import type { VerificationRejection } from "@/roommates/verification-review";

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

export type VerificationReviewProps = {
  rejection: VerificationRejection;
  appeal: VerificationAppeal | null;
  appealStatus: "idle" | "loading" | "ready" | "error";
  appealLoadError: string | null;
  submitting: boolean;
  onAppeal: (reason: VerificationAppealReason, message: string) => Promise<string | null>;
};

/**
 * Explains a suspended or blocked verification and gives the student a way to
 * ask for another review. This is deliberately separate from the questionnaire:
 * the reason is useful even when answers cannot be edited.
 */
export function VerificationReview({
  rejection,
  appeal,
  appealStatus,
  appealLoadError,
  submitting,
  onAppeal,
}: VerificationReviewProps) {
  const headingId = useId();
  const reasonFieldId = useId();
  const messageId = useId();
  const helpId = useId();
  const [reason, setReason] = useState<VerificationAppealReason | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decidedAt = formatDate(rejection.decidedAt);
  const pendingAppeal = appeal?.status === "pending" ? appeal : null;
  const declinedAppeal = appeal?.status === "declined" ? appeal : null;
  // Wait for the existing request to load so the form does not flash before a
  // pending card replaces it.
  const showAppealForm = appealStatus !== "loading" && !pendingAppeal;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateAppeal(reason, message);
    if (validation) {
      setError(validation);
      return;
    }

    const submitError = await onAppeal(
      reason as VerificationAppealReason,
      message,
    );
    if (submitError) {
      setError(submitError);
      return;
    }
    setReason("");
    setMessage("");
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-4 rounded-card border border-danger/25 bg-panel p-5 shadow-panel"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-tile border border-danger/25 bg-danger/5 text-danger"
          >
            <ShieldAlert className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={headingId} className="text-sm font-semibold text-foreground">
                {rejection.heading}
              </h2>
              <Badge tone="danger">
                {rejection.kind === "blocked" ? "Blocked" : "Suspended"}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted">{rejection.reason}</p>
            {decidedAt && (
              <p className="text-[11px] text-subtle">Decision recorded {decidedAt}.</p>
            )}
          </div>
        </div>

        {rejection.flags.length > 0 && (
          <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-foreground">
              <Flag className="size-3.5 text-accent-soft" aria-hidden="true" />
              What our checks flagged
            </p>
            <ul className="flex flex-col gap-2.5">
              {rejection.flags.map((flag) => (
                <li key={flag.key} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">
                    {flag.title}
                  </span>
                  <span className="text-xs leading-relaxed text-muted">
                    {flag.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-xs font-medium text-foreground">
            {rejection.kind === "blocked"
              ? "What you can do"
              : "How to get back in"}
          </p>
          <ul className="flex flex-col gap-2 text-xs leading-relaxed text-muted">
            {rejection.canEditAnswers ? (
              <li className="flex items-start gap-2">
                <ArrowDown
                  className="mt-0.5 size-3.5 shrink-0 text-accent-soft"
                  aria-hidden="true"
                />
                Correct any flagged answers below and save them.
              </li>
            ) : (
              <li className="flex items-start gap-2">
                <ShieldQuestion
                  className="mt-0.5 size-3.5 shrink-0 text-accent-soft"
                  aria-hidden="true"
                />
                Blocked accounts cannot edit answers, but a moderator can still
                review your explanation.
              </li>
            )}
            <li className="flex items-start gap-2">
              <Flag
                className="mt-0.5 size-3.5 shrink-0 text-accent-soft"
                aria-hidden="true"
              />
              Request a re-review and explain what changed or why the decision is
              wrong.
            </li>
            <li className="flex items-start gap-2">
              <BadgeCheck
                className="mt-0.5 size-3.5 shrink-0 text-accent-soft"
                aria-hidden="true"
              />
              A moderator reviews the request. Your standing only changes after
              their decision.
            </li>
          </ul>
          {rejection.canEditAnswers && (
            <a
              href="#verification-form"
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: "mt-1 w-fit",
              })}
            >
              Update my answers
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      {appealStatus === "loading" && (
        <p role="status" className="text-sm text-muted">
          Checking your re-review requests…
        </p>
      )}

      {appealStatus === "error" && (
        <InlineAlert>
          {appealLoadError ?? "Your re-review requests could not be loaded."}
        </InlineAlert>
      )}

      {pendingAppeal && (
        <div className="flex flex-col gap-2 rounded-card border border-caution/30 bg-caution/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={appealStatusMeta(pendingAppeal.status).tone}>
              {appealStatusMeta(pendingAppeal.status).label}
            </Badge>
            <p className="text-xs text-subtle">
              Sent {formatDate(pendingAppeal.created_at) ?? "recently"}
            </p>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            {appealStatusMeta(pendingAppeal.status).description}
          </p>
          <p className="rounded-tile border border-line bg-panel px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-foreground">
            {pendingAppeal.message}
          </p>
        </div>
      )}

      {declinedAppeal && (
        <div className="flex flex-col gap-2 rounded-card border border-danger/25 bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="danger">{appealStatusMeta(declinedAppeal.status).label}</Badge>
            <p className="text-xs text-subtle">
              Decided {formatDate(declinedAppeal.decided_at) ?? "recently"}
            </p>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            {declinedAppeal.decision_note ??
              appealStatusMeta(declinedAppeal.status).description}
          </p>
          <p className="text-xs leading-relaxed text-subtle">
            You can send one more request if something has changed.
          </p>
        </div>
      )}

      {showAppealForm && (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5 shadow-panel"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-foreground">
              Request a re-review
            </h2>
            <p className="text-xs leading-relaxed text-muted">
              This is not an automatic reinstatement. A moderator reads it alongside
              your verification.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={reasonFieldId} className="text-xs font-medium tracking-wide text-muted">
              Why are you asking for another review?
            </label>
            <select
              id={reasonFieldId}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value as VerificationAppealReason | "");
                setError(null);
              }}
              className="h-12 w-full rounded-tile border border-line bg-panel px-3.5 text-sm text-foreground transition-colors hover:border-line-strong focus-visible:border-accent/60"
            >
              <option value="">Choose a reason</option>
              {verificationAppealReasons.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {reason && (
              <p className="text-[11px] leading-relaxed text-subtle">
                {verificationAppealReasons.find((option) => option.value === reason)?.hint}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={messageId} className="text-xs font-medium tracking-wide text-muted">
              What should the moderator know?
            </label>
            <textarea
              id={messageId}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setError(null);
              }}
              rows={5}
              maxLength={APPEAL_MESSAGE_MAX}
              aria-describedby={helpId}
              placeholder="Explain what changed, or why this decision does not apply to you."
              className={cn(
                "min-h-28 w-full resize-y rounded-tile border bg-panel px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60",
                error ? "border-danger/60" : "border-line",
              )}
            />
            <div className="flex items-center justify-between gap-3">
              <p id={helpId} className="text-[11px] leading-relaxed text-subtle">
                At least {APPEAL_MESSAGE_MIN} characters. Never include passwords or
                bank details.
              </p>
              <span className="shrink-0 text-[11px] text-subtle">
                {message.trim().length}/{APPEAL_MESSAGE_MAX}
              </span>
            </div>
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button
            type="submit"
            className="w-fit"
            loading={submitting}
            icon={<CircleCheck className="size-4" />}
          >
            Send re-review request
          </Button>
        </form>
      )}
    </div>
  );
}
