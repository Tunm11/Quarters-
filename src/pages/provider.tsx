import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  House,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ListRowsSkeleton } from "@/components/feedback/skeletons";
import { ProviderChatInbox } from "@/components/listings/provider-chat-inbox";
import { ProviderReservations } from "@/components/listings/provider-reservations";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  isProviderKind,
  loadLatestProviderReview,
  PROVIDER_KINDS,
  PROVIDER_NAME_MAX,
  validateProviderDisplayName,
  type ProviderApplication,
  type ProviderKind,
  type ProviderReviewSummary,
  type ProviderStatus,
} from "@/provider/application";
import { useProviderApplication } from "@/provider/use-provider-application";

type StatusDetail = {
  label: string;
  tone: BadgeTone;
  title: string;
  description: string;
};

const statusDetails: Record<ProviderStatus, StatusDetail> = {
  pending: {
    label: "Pending review",
    tone: "accent",
    title: "Your application is being reviewed.",
    description:
      "An administrator reviews every provider application. You cannot publish listings until it is approved.",
  },
  approved: {
    label: "Approved",
    tone: "positive",
    title: "You are approved to list on QUARTERS.",
    description:
      "Your provider account is authorised to publish listings. Approval does not create a listing by itself.",
  },
  rejected: {
    label: "Not approved",
    tone: "danger",
    title: "Your application was not approved.",
    description:
      "This account cannot publish listings. If the reviewer left a note, it appears below. Reapplying is not available in the app yet.",
  },
  suspended: {
    label: "Suspended",
    tone: "caution",
    title: "Your provider account is suspended.",
    description:
      "You cannot publish or edit listings while suspended, and existing listings stay private. If the reviewer left a note, it appears below.",
  },
};

const kindDetails: Record<
  ProviderKind,
  { label: string; description: string; icon: LucideIcon }
> = {
  landlord: {
    label: "Landlord",
    description: "I own or manage a property I want to list.",
    icon: House,
  },
  agent: {
    label: "Agent",
    description: "I let rooms on behalf of property owners.",
    icon: Briefcase,
  },
};

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function ReviewNote({ review }: { review: ProviderReviewSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-tile border border-line bg-canvas-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Latest review</h3>
        <span className="text-xs text-subtle">{formatDate(review.reviewed_at)}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        {review.provider_note ?? "The reviewer did not leave a note."}
      </p>
    </div>
  );
}

function ProviderStatusPanel({
  application,
  review,
  reviewError,
  formError,
  submitted,
}: {
  application: ProviderApplication;
  review: ProviderReviewSummary | null;
  reviewError: string | null;
  formError: string | null;
  submitted: boolean;
}) {
  const detail = statusDetails[application.status];

  return (
    <div className="flex flex-col gap-4">
      {submitted && (
        <InlineAlert tone="positive">
          Application submitted. It is now pending review.
        </InlineAlert>
      )}
      {formError && <InlineAlert>{formError}</InlineAlert>}

      <Panel tone="raised" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
            >
              <ShieldCheck className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
                Application status
              </p>
              <h2 className="text-base font-semibold text-balance">
                {detail.title}
              </h2>
            </div>
          </div>
          <Badge tone={detail.tone}>{detail.label}</Badge>
        </div>

        <p className="text-sm leading-relaxed text-muted">{detail.description}</p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Provider name" value={application.display_name} />
          <Detail
            label="Applying as"
            value={kindDetails[application.kind].label}
          />
          <Detail label="Submitted" value={formatDate(application.created_at)} />
          <Detail
            label="Last updated"
            value={formatDate(application.updated_at)}
          />
        </dl>

        {review && <ReviewNote review={review} />}
        {reviewError && <p className="text-xs text-subtle">{reviewError}</p>}

        <p className="text-xs leading-relaxed text-subtle">
          Only a QUARTERS administrator can change this status. Applications
          cannot be edited, withdrawn or resubmitted from the app.
        </p>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Link
            to="/account"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Back to profile
          </Link>
          {application.status === "approved" && (
            <Link
              to="/explore"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Explore rooms
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function ProviderPage() {
  const { user } = useAuth();
  const { application, loadStatus, loadError, submitting, reload, submit } =
    useProviderApplication();
  const [searchParams] = useSearchParams();

  // The two entry cards link here as ?kind=landlord / ?kind=agent, so the
  // chosen route preselects the matching application type.
  const [kind, setKind] = useState<ProviderKind | null>(() => {
    const requested = searchParams.get("kind");
    return isProviderKind(requested) ? requested : null;
  });
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [kindError, setKindError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [review, setReview] = useState<ProviderReviewSummary | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const applicationId = application?.id ?? null;

  useEffect(() => {
    if (!supabase || !applicationId) {
      setReview(null);
      setReviewError(null);
      return;
    }

    let active = true;
    setReview(null);
    setReviewError(null);

    void loadLatestProviderReview(supabase, applicationId).then((result) => {
      if (!active) return;
      setReview(result.review);
      setReviewError(result.error);
    });

    return () => {
      active = false;
    };
  }, [applicationId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setKindError(null);
    setFormError(null);
    setSubmitted(false);

    const nextNameError = validateProviderDisplayName(displayName);
    const nextKindError = kind
      ? null
      : "Choose whether you are applying as a landlord or an agent.";

    if (nextNameError || nextKindError) {
      setNameError(nextNameError);
      setKindError(nextKindError);
      return;
    }
    if (!kind) return;

    const outcome = await submit(kind, displayName);
    if (outcome.error) {
      setFormError(outcome.error);
      return;
    }

    setSubmitted(true);
    setDisplayName("");
    setKind(null);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <SectionHeading
        id="provider-heading"
        eyebrow="Providers"
        title="List with QUARTERS"
        level={1}
        description="Apply to let rooms as a landlord or agent, and follow your review status here."
      />

      <div className="mt-8 flex flex-col gap-4">
        {loadStatus === "loading" && (
          <Panel>
            <span role="status" className="sr-only">
              Checking your provider application
            </span>
            <ListRowsSkeleton rows={2} className="[&>li]:border-0 [&>li]:px-0" />
          </Panel>
        )}

        {loadStatus === "error" && (
          <ErrorState
            title="Provider status unavailable"
            description={
              loadError ??
              "Your provider application could not be loaded from Supabase."
            }
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" onClick={reload}>
                  Try again
                </Button>
                <Link
                  to="/account"
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  Back to profile
                </Link>
              </div>
            }
          />
        )}

        {loadStatus === "ready" && application && (
          <>
            <ProviderStatusPanel
              application={application}
              review={review}
              reviewError={reviewError}
              formError={formError}
              submitted={submitted}
            />
            {/* An approved provider answers student questions here. */}
            <ProviderChatInbox enabled={application.status === "approved"} />
            {/* And decides which paid group gets a room. */}
            <ProviderReservations enabled={application.status === "approved"} />
          </>
        )}

        {loadStatus === "ready" && !application && (
          <div className="flex flex-col gap-4">
            <Panel tone="raised" className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
                >
                  <Building2 className="size-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-base font-semibold">
                    Apply to list on QUARTERS
                  </h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Tell us who is letting the rooms. Applications start as
                    pending and are reviewed by an administrator.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                {formError && <InlineAlert>{formError}</InlineAlert>}

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-3 text-xs font-medium tracking-wide text-muted">
                    I am applying as
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PROVIDER_KINDS.map((option) => {
                      const details = kindDetails[option];
                      const selected = kind === option;
                      return (
                        <label
                          key={option}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-tile border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-soft",
                            selected
                              ? "border-accent/60 bg-accent/10"
                              : "border-line bg-panel hover:border-line-strong",
                          )}
                        >
                          <input
                            type="radio"
                            name="provider-kind"
                            value={option}
                            checked={selected}
                            onChange={() => {
                              setKind(option);
                              setKindError(null);
                            }}
                            disabled={submitting}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                              selected
                                ? "border-accent bg-accent text-accent-ink"
                                : "border-line-strong bg-canvas",
                            )}
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                          <span className="flex min-w-0 flex-col gap-1.5">
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "grid size-6 shrink-0 place-items-center rounded-tile border",
                                  selected
                                    ? "border-accent/35 bg-accent/15 text-accent-soft"
                                    : "border-line bg-panel text-subtle",
                                )}
                              >
                                <details.icon className="size-3.5" />
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {details.label}
                              </span>
                            </span>
                            <span className="text-xs leading-relaxed text-muted">
                              {details.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {kindError && (
                    <p role="alert" className="text-xs text-danger">
                      {kindError}
                    </p>
                  )}
                </fieldset>

                <Input
                  label="Provider or business name"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setNameError(null);
                  }}
                  autoComplete="organization"
                  maxLength={PROVIDER_NAME_MAX}
                  error={nameError ?? undefined}
                  description="2–80 characters. This name is public only while your provider account is approved."
                  disabled={submitting}
                />

                <div className="flex flex-col gap-3 border-t border-line pt-5">
                  <Button
                    type="submit"
                    loading={submitting}
                    icon={<Building2 className="size-4" />}
                    className="w-full sm:w-fit"
                  >
                    Submit application
                  </Button>
                  <p className="text-xs leading-relaxed text-subtle">
                    Applications start as pending. Only a QUARTERS administrator
                    can approve one, and approval is required before any listing
                    can be published. One application per account.
                  </p>
                </div>
              </form>
            </Panel>

            <Panel className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">Before you apply</h2>
              <p className="text-sm leading-relaxed text-muted">
                Signed in as{" "}
                <span className="text-foreground">
                  {user?.email ?? "a QUARTERS account"}
                </span>
                . Applications cannot be edited, withdrawn or resubmitted in
                this build. If your details change, wait for the review outcome.
              </p>
              <Link
                to="/how-it-works"
                className={buttonClasses({
                  variant: "ghost",
                  size: "sm",
                  className: "w-fit",
                })}
              >
                How QUARTERS works
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
