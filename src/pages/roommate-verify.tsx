import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleCheck,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { VerificationReview } from "@/components/roommates/verification-review";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  consentItems,
  draftFromVerification,
  emptyVerificationDraft,
  genderOptions,
  identityFields,
  studyLevelOptions,
  submitMyVerification,
  traitMeta,
  validateVerification,
  validateVerificationStep,
  verificationSteps,
  type VerificationDraft,
  type VerificationErrors,
  type VerificationQuestion,
  type VerificationStepId,
} from "@/roommates/verification";
import { useVerificationAppeal } from "@/roommates/use-verification-appeal";
import { useRoommateVerification } from "@/roommates/use-roommate-verification";
import { verificationRejection } from "@/roommates/verification-review";

const questionCount = verificationSteps.reduce(
  (total, step) =>
    total + step.questions.length + (step.id === "identity" ? identityFields.length + 2 : 0),
  0,
);

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {message}
    </p>
  );
}

function optionClasses(selected: boolean) {
  return cn(
    "flex w-full items-start gap-3 rounded-tile border px-3.5 py-3 text-left text-sm transition-colors select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-soft",
    selected
      ? "border-accent/60 bg-accent/10 text-foreground"
      : "border-line bg-panel-raised text-muted hover:border-line-strong hover:text-foreground",
  );
}

function SingleChoice({
  question,
  value,
  error,
  onChange,
}: {
  question: Extract<VerificationQuestion, { kind: "single" }>;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${question.id}-error`;

  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-foreground">{question.prompt}</legend>
      {question.help && <p className="text-xs text-subtle">{question.help}</p>}
      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const id = `${question.id}-${option.value}`;
          const selected = value === option.value;
          return (
            <label key={option.value} htmlFor={id} className={optionClasses(selected)}>
              <input
                id={id}
                type="radio"
                name={question.id}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  selected ? "border-accent bg-accent text-accent-ink" : "border-line-strong",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{option.label}</span>
                {option.hint && <span className="block text-xs text-subtle">{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

function MultiChoice({
  question,
  value,
  error,
  onChange,
}: {
  question: Extract<VerificationQuestion, { kind: "multi" }>;
  value: string[];
  error?: string;
  onChange: (value: string[]) => void;
}) {
  const errorId = `${question.id}-error`;
  const atLimit = value.length >= question.maxSelections;

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((entry) => entry !== option));
      return;
    }
    if (atLimit) return;
    onChange([...value, option]);
  }

  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-foreground">{question.prompt}</legend>
      {question.help && <p className="text-xs text-subtle">{question.help}</p>}
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const id = `${question.id}-${option.value}`;
          const selected = value.includes(option.value);
          const disabled = !selected && atLimit;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-pill border px-3 py-2 text-xs font-medium transition-colors select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-soft",
                selected
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-panel-raised text-muted hover:border-line-strong hover:text-foreground",
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <input
                id={id}
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              {selected && <Check className="size-3" aria-hidden="true" />}
              {option.label}
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-subtle">
        {value.length}/{question.maxSelections} selected
      </p>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

function TextAnswer({
  question,
  value,
  error,
  onChange,
}: {
  question: Extract<VerificationQuestion, { kind: "text" }>;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = question.id;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const remaining = question.maxLength - value.length;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {question.prompt}
        {!question.required && (
          <span className="ml-1.5 text-xs font-normal text-subtle">Optional</span>
        )}
      </label>
      {question.help && (
        <p id={helpId} className="text-xs text-subtle">
          {question.help}
        </p>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        maxLength={question.maxLength}
        placeholder={question.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helpId, error ? errorId : null].filter(Boolean).join(" ")}
        className={cn(
          "min-h-24 w-full resize-y rounded-tile border bg-panel px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60",
          error ? "border-danger/60" : "border-line",
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <FieldError id={errorId} message={error} />
        <span className="ml-auto text-[11px] text-subtle">{remaining} left</span>
      </div>
    </div>
  );
}

export default function RoommateVerifyPage() {
  const { status: authStatus, user, profile } = useAuth();
  const {
    verification,
    status: loadStatus,
    error: loadError,
    reload,
    apply,
  } = useRoommateVerification();

  const [draft, setDraft] = useState<VerificationDraft>(() => emptyVerificationDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<VerificationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const {
    appeal,
    status: appealStatus,
    error: appealError,
    submitting: appealSubmitting,
    submit: submitAppeal,
  } = useVerificationAppeal(verification?.id ?? null);
  const rejection = verification ? verificationRejection(verification) : null;
  const headingId = useId();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hydratedRef = useRef(false);

  // Start from the saved verification when there is one; otherwise prefill the
  // name from the account profile, which is the only identity detail QUARTERS
  // already holds.
  useEffect(() => {
    if (hydratedRef.current || loadStatus !== "ready") return;
    if (verification) {
      setDraft(draftFromVerification(verification));
      hydratedRef.current = true;
      return;
    }
    if (profile?.display_name) {
      setDraft(emptyVerificationDraft({ fullName: profile.display_name }));
    }
    hydratedRef.current = true;
  }, [verification, loadStatus, profile?.display_name]);

  // A profile can arrive after the first render (or after a refresh); fill an
  // empty name without overwriting anything the student typed.
  useEffect(() => {
    const name = profile?.display_name?.trim();
    if (!name) return;
    setDraft((current) =>
      current.identity.fullName.trim() ? current : {
        ...current,
        identity: { ...current.identity, fullName: name },
      },
    );
  }, [profile?.display_name]);

  const step = verificationSteps[stepIndex];
  const isLastStep = stepIndex === verificationSteps.length - 1;
  const standing = verification?.status ?? "unverified";
  // Blocked accounts cannot edit their answers; suspended students can correct
  // them before asking for another review.
  const answersLocked = standing === "blocked";

  function updateIdentity(key: keyof VerificationDraft["identity"], value: string) {
    setDraft((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value },
    }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setSaved(false);
  }

  function updateAnswer(id: string, value: string | string[]) {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
    }));
    setErrors((current) => ({ ...current, [id]: "" }));
    setSaved(false);
  }

  function updateConsent(key: keyof VerificationDraft["consents"], value: boolean) {
    setDraft((current) => ({
      ...current,
      consents: { ...current.consents, [key]: value },
    }));
    setErrors((current) => ({ ...current, [`consent_${key}`]: "" }));
    setSaved(false);
  }

  function goToStep(nextIndex: number) {
    setStepIndex(nextIndex);
    setSaveError(null);
    window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleContinue() {
    const stepErrors = validateVerificationStep(step.id as VerificationStepId, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((current) => ({ ...current, ...stepErrors }));
      return;
    }
    goToStep(Math.min(stepIndex + 1, verificationSteps.length - 1));
  }

  async function handleSubmit() {
    setSaveError(null);
    setSaved(false);

    const allErrors = validateVerification(draft);
    if (Object.keys(allErrors).length > 0) {
      setErrors((current) => ({ ...current, ...allErrors }));
      const firstInvalid = verificationSteps.find(
        (entry) => Object.keys(validateVerificationStep(entry.id, draft)).length > 0,
      );
      if (firstInvalid) goToStep(verificationSteps.indexOf(firstInvalid));
      return;
    }

    if (!user) {
      setSaveError("Sign in again before submitting your verification.");
      return;
    }
    if (!supabase) {
      setSaveError("Verification is unavailable because Supabase is not configured.");
      return;
    }

    setSaving(true);
    const result = await submitMyVerification(
      supabase,
      user.id,
      draft,
      verification?.id ?? null,
    );
    setSaving(false);

    if (result.error || !result.verification) {
      setSaveError(result.error ?? "Verification could not be saved.");
      return;
    }

    apply(result.verification);
    setSaved(true);
    setDraft(draftFromVerification(result.verification));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (authStatus === "loading" || loadStatus === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
        <span role="status" className="sr-only">
          Loading your verification
        </span>
        <div className="flex flex-col gap-2 pb-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <FormSkeleton fields={3} />
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
        <ErrorState
          title="Verification is unavailable"
          description={loadError ?? "Please try again in a moment."}
          action={
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-10 sm:px-8 sm:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-muted">
            <Users className="size-3.5 text-accent-soft" aria-hidden="true" />
            Roommate discovery
          </span>
          <Link
            to={standing === "verified" ? "/roommates" : "/explore"}
            className="text-xs font-medium text-muted hover:text-foreground"
          >
            {standing === "verified" ? "Back to roommates" : "Back to Explore"}
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h1
            id={headingId}
            className="text-[1.9rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {rejection
              ? rejection.kind === "blocked"
                ? "Your verification was blocked"
                : "Your verification needs another look"
              : standing === "verified"
                ? "Your verification"
                : "Get verified as a roommate"}
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted">
            {rejection
              ? "Read why it was flagged, correct anything you can, and ask a moderator for another review."
              : standing === "verified"
                ? "You're verified and discovery is open. Update your answers any time — the compatibility score follows."
                : `${questionCount} short questions about who you are and how you live. About five minutes, reviewed instantly by our rules and monitored by moderators.`}
          </p>
        </div>
      </header>

      {verification?.status === "verified" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-positive/25 bg-positive/5 p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <p className="text-sm font-medium text-foreground">Verified — discovery is open</p>
              <p className="text-xs text-subtle">
                Submitted{" "}
                {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
                  new Date(verification.submitted_at),
                )}
                . Updates re-check your answers automatically.
              </p>
            </div>
          </div>
          <Link to="/roommates" className={buttonClasses({ size: "sm" })}>
            Discover roommates
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {saved && (
        <div className="mt-5">
          <InlineAlert tone="positive">
            {standing === "suspended"
              ? "Answers saved. Your access stays paused until a moderator approves your re-review."
              : "Verification saved and open. You can start discovering roommates now."}
          </InlineAlert>
        </div>
      )}

      {rejection && (
        <div className="mt-5">
          <VerificationReview
            rejection={rejection}
            appeal={appeal}
            appealStatus={appealStatus}
            appealLoadError={appealError}
            submitting={appealSubmitting}
            onAppeal={submitAppeal}
          />
        </div>
      )}

      {!answersLocked && (
        <div className="mt-6 flex flex-col gap-4">
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Verification steps">
            {verificationSteps.map((entry, index) => {
              const current = index === stepIndex;
              const complete = index < stepIndex;
              return (
                <li key={entry.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => {
                      if (index <= stepIndex) goToStep(index);
                    }}
                    disabled={index > stepIndex}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-pill border px-2.5 text-[11px] font-medium transition-colors",
                      current
                        ? "border-accent bg-accent text-accent-ink"
                        : complete
                          ? "border-positive/30 bg-positive/10 text-positive"
                          : "border-line bg-panel text-subtle",
                    )}
                  >
                    <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
                    <span className="hidden sm:inline">{entry.title}</span>
                  </button>
                  {index < verificationSteps.length - 1 && (
                    <span aria-hidden="true" className="h-px w-3 bg-line-strong" />
                  )}
                </li>
              );
            })}
          </ol>

          {standing === "suspended" && (
            <div className="rounded-tile border border-caution/30 bg-caution/5 p-3.5 text-xs leading-relaxed text-muted">
              Saving updated answers does not restore access on its own. Request a
              re-review above after you save so a moderator looks again.
            </div>
          )}

          <section
            id="verification-form"
            aria-labelledby={`${headingId}-step`}
            className="scroll-mt-24 flex flex-col gap-5 rounded-card border border-line bg-panel p-5 shadow-panel"
          >
            <div className="flex flex-col gap-1.5 border-b border-line pb-4">
              <p className="text-[11px] font-medium tracking-[0.16em] text-sand uppercase">
                Step {stepIndex + 1} of {verificationSteps.length}
              </p>
              <h2
                id={`${headingId}-step`}
                ref={stepHeadingRef}
                tabIndex={-1}
                className="text-lg font-semibold tracking-tight text-foreground focus:outline-none"
              >
                {step.title}
              </h2>
              <p className="text-xs leading-relaxed text-muted">{step.description}</p>
            </div>

            {saveError && <InlineAlert>{saveError}</InlineAlert>}

            {step.id === "identity" ? (
              <div className="flex flex-col gap-4">
                {identityFields.map((field) => {
                  const key = field.key;
                  const fieldId = `verification-${key}`;
                  return (
                    <Input
                      key={key}
                      id={fieldId}
                      label={`${field.label}${field.optional ? " (optional)" : ""}`}
                      type={field.type}
                      value={draft.identity[key]}
                      onChange={(event) => updateIdentity(key, event.target.value)}
                      placeholder={field.placeholder}
                      description={field.description}
                      autoComplete={field.autoComplete}
                      maxLength={field.maxLength}
                      error={errors[key] || undefined}
                      disabled={saving}
                    />
                  );
                })}

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="verification-study-level"
                    className="text-xs font-medium tracking-wide text-muted"
                  >
                    Level of study
                  </label>
                  <select
                    id="verification-study-level"
                    value={draft.identity.studyLevel}
                    onChange={(event) => updateIdentity("studyLevel", event.target.value)}
                    aria-invalid={errors.studyLevel ? true : undefined}
                    aria-describedby={errors.studyLevel ? "study-level-error" : undefined}
                    className={cn(
                      "h-12 w-full rounded-tile border bg-panel px-3.5 text-sm text-foreground transition-colors hover:border-line-strong focus-visible:border-accent/60",
                      errors.studyLevel ? "border-danger/60" : "border-line",
                    )}
                  >
                    <option value="">Select your level</option>
                    {studyLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError id="study-level-error" message={errors.studyLevel} />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="verification-gender"
                    className="text-xs font-medium tracking-wide text-muted"
                  >
                    Gender (optional)
                  </label>
                  <select
                    id="verification-gender"
                    value={draft.identity.gender}
                    onChange={(event) => updateIdentity("gender", event.target.value)}
                    aria-invalid={errors.gender ? true : undefined}
                    className={cn(
                      "h-12 w-full rounded-tile border bg-panel px-3.5 text-sm text-foreground transition-colors hover:border-line-strong focus-visible:border-accent/60",
                      errors.gender ? "border-danger/60" : "border-line",
                    )}
                  >
                    <option value="">Prefer not to say</option>
                    {genderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-subtle">
                    Helps students who only want to share with a particular gender. Never shown on
                    your public profile.
                  </p>
                  <FieldError id="gender-error" message={errors.gender} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {step.questions.map((question) => {
                  const value = draft.answers[question.id];
                  if (question.kind === "single") {
                    return (
                      <SingleChoice
                        key={question.id}
                        question={question}
                        value={typeof value === "string" ? value : ""}
                        error={errors[question.id] || undefined}
                        onChange={(next) => updateAnswer(question.id, next)}
                      />
                    );
                  }
                  if (question.kind === "multi") {
                    return (
                      <MultiChoice
                        key={question.id}
                        question={question}
                        value={Array.isArray(value) ? value : []}
                        error={errors[question.id] || undefined}
                        onChange={(next) => updateAnswer(question.id, next)}
                      />
                    );
                  }
                  return (
                    <TextAnswer
                      key={question.id}
                      question={question}
                      value={typeof value === "string" ? value : ""}
                      error={errors[question.id] || undefined}
                      onChange={(next) => updateAnswer(question.id, next)}
                    />
                  );
                })}

                {step.id === "trust" && (
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Before you submit
                    </h3>
                    {consentItems.map((item) => {
                      const checked = draft.consents[item.key];
                      const error = errors[`consent_${item.key}`];
                      return (
                        <div key={item.key} className="flex flex-col gap-1.5">
                          <label
                            htmlFor={`consent-${item.key}`}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-tile border p-3 text-xs leading-relaxed transition-colors select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-soft",
                              checked
                                ? "border-accent/50 bg-accent/10 text-foreground"
                                : error
                                  ? "border-danger/40 bg-panel-raised text-muted"
                                  : "border-line bg-panel-raised text-muted hover:border-line-strong",
                            )}
                          >
                            <input
                              id={`consent-${item.key}`}
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => updateConsent(item.key, event.target.checked)}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[0.3rem] border",
                                checked
                                  ? "border-accent bg-accent text-accent-ink"
                                  : "border-line-strong",
                              )}
                            >
                              {checked && <Check className="size-3" />}
                            </span>
                            <span className="min-w-0">{item.label}</span>
                          </label>
                          <FieldError id={`consent-${item.key}-error`} message={error} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => goToStep(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0 || saving}
              icon={<ArrowLeft className="size-4" />}
            >
              Back
            </Button>

            {isLastStep ? (
              <Button
                onClick={() => void handleSubmit()}
                loading={saving}
                icon={<ShieldCheck className="size-4" />}
              >
                {standing === "verified"
                  ? "Update verification"
                  : standing === "suspended"
                    ? "Save updated answers"
                    : "Submit verification"}
              </Button>
            ) : (
              <Button onClick={handleContinue} icon={<ArrowRight className="size-4" />} iconPosition="end">
                Continue
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <Lock className="size-3.5 text-accent-soft" aria-hidden="true" />
              Private by default
            </p>
            <p className="text-[11px] leading-relaxed text-subtle">
              Your name, phone, school email, answers and standing are visible
              only to you and QUARTERS moderators. Other students see your public
              roommate profile and the compatibility traits derived from these
              answers.
            </p>
          </div>
        </div>
      )}

      {verification?.status === "verified" && (
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-line bg-panel p-5">
          <div className="flex items-center gap-2">
            <Badge tone="positive">
              <BadgeCheck className="size-3" aria-hidden="true" />
              Verified
            </Badge>
            {verification.review_state === "flagged" && (
              <Badge tone="caution">In review</Badge>
            )}
          </div>
          <h2 className="text-sm font-semibold text-foreground">Your compatibility traits</h2>
          <p className="text-xs leading-relaxed text-subtle">
            These five scores power the fit percentage other verified students
            see. They update whenever you save new answers.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["tidy", verification.tidy_score],
              ["sleep", verification.sleep_score],
              ["social", verification.social_score],
              ["guests", verification.guest_score],
              ["routine", verification.routine_score],
            ].map(([key, score]) => {
              const trait = traitMeta[key as keyof typeof traitMeta];
              const value = score as number;
              return (
                <li
                  key={key as string}
                  className="flex items-center justify-between gap-3 rounded-tile border border-line bg-panel-raised px-3 py-2"
                >
                  <span className="text-xs text-muted">{trait.label}</span>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-16 overflow-hidden rounded-pill bg-line"
                    >
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${((value - 1) / 4) * 100}%` }}
                      />
                    </span>
                    <span className="text-[11px] font-medium text-foreground">
                      {value.toFixed(1)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {verification.review_state === "flagged" && (
            <p className="text-[11px] leading-relaxed text-subtle">
              Your submission triggered an automatic review flag. Your access
              stays open unless a moderator finds something that needs action.
            </p>
          )}
        </div>
      )}

    </div>
  );
}
