import {
  ArrowRight,
  BadgeCheck,
  Compass,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button, buttonClasses } from "@/components/ui/button";
import { useRoommateVerification } from "@/roommates/use-roommate-verification";
import { verificationRejectionNotice } from "@/roommates/verification-review";

const verificationIncludes = [
  {
    icon: UserRound,
    title: "Identity",
    body: "Your name from your QUARTERS profile, school, level and a reachable phone number.",
  },
  {
    icon: ListChecks,
    title: "Habits & social life",
    body: "Around 20 questions on tidiness, sleep, guests and how you like to live.",
  },
  {
    icon: ShieldCheck,
    title: "Instant, monitored",
    body: "Verification opens discovery immediately. Moderators can suspend or block suspicious profiles.",
  },
];

/**
 * Gate in front of roommate discovery.
 *
 * Signed-out visitors are handled by RequireAuth before this renders. Here a
 * student without a verified record sees what verification involves instead of
 * other people's profiles, which mirrors the RLS rules on roommate_profiles.
 */
export function RequireRoommateVerification({ children }: { children: ReactNode }) {
  const { verification, status, error, standing, reload } = useRoommateVerification();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
        <LoadingState
          variant="page"
          label="Checking your roommate verification"
          description="Discovery opens as soon as your verification is on file."
        />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
        <ErrorState
          title="We could not check your verification"
          description={error ?? "Please try again in a moment."}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void reload()}
              icon={<RefreshCw className="size-4" />}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (standing === "suspended" || standing === "blocked") {
    const notice = verification ? verificationRejectionNotice(verification) : null;
    const blocked = standing === "blocked";

    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-10 pb-8 sm:px-8">
        <div className="flex flex-col gap-5 rounded-card border border-danger/25 bg-panel p-6 shadow-panel">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-tile border border-danger/25 bg-danger/5 text-danger"
          >
            <ShieldAlert className="size-6" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {blocked
                ? "Your verification was blocked"
                : "Your verification was paused"}
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              {blocked
                ? "A QUARTERS moderator has blocked this account from roommate discovery after a review."
                : "Roommate discovery is paused while a QUARTERS moderator reviews your verification."}
            </p>
          </div>

          {notice && <InlineAlert>{notice}</InlineAlert>}

          <p className="text-xs leading-relaxed text-subtle">
            Your verification details are kept private. The reason above is the
            moderator's decision. You can read the full explanation, correct
            anything you can, and request a re-review.
          </p>

          <div className="flex flex-wrap gap-2">
            <Link to="/roommates/verify" className={buttonClasses({ size: "sm" })}>
              Why was this rejected?
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link to="/explore" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              <Compass className="size-4" aria-hidden="true" />
              Browse rooms instead
            </Link>
          </div>
        </div>

      </div>
    );
  }

  if (standing !== "verified") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-10 pb-8 sm:px-8">
        <div className="flex flex-col gap-5">
          <div className="relative overflow-hidden rounded-card border border-line bg-panel p-6 shadow-panel">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-sand-wash"
            />
            <div className="relative flex flex-col gap-5">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
              >
                <BadgeCheck className="size-6" />
              </span>

              <div className="flex flex-col gap-2">
                <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
                  Verify before you discover roommates
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-muted">
                  Every discoverable roommate on QUARTERS is a verified student.
                  It takes one sitting — about five minutes — and unlocks the
                  whole discovery screen, including compatibility scores.
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {verificationIncludes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-tile border border-line bg-panel-raised text-accent-soft"
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <span className="text-xs leading-relaxed text-muted">
                          {item.body}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Link
                  to="/roommates/verify"
                  className={buttonClasses({ className: "w-fit" })}
                >
                  Start verification
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/explore"
                  className={buttonClasses({ variant: "ghost", size: "md" })}
                >
                  Browse rooms instead
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return <>{children}</>;
}
