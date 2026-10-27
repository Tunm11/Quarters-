import { useEffect, useRef, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { CrashIllustration, NoNetworkIllustration } from "@/components/feedback/illustrations";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The full-screen failure surfaces.
 *
 * Both are deliberately router-free: they are rendered by the route error
 * element when navigation fails *and* by the root error boundary when the
 * router itself never mounted, so they may not assume any provider, any route
 * or any loaded data. Every recovery action is therefore a plain navigation or
 * a hard reload.
 *
 * The copy keeps the blame off the student: a crash is ours to fix, and the
 * screen says so rather than asking them to report it.
 */

type ErrorScreenProps = {
  illustration: ReactNode;
  /** Short label above the heading, e.g. "No connection". */
  eyebrow: string;
  eyebrowClassName?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  /** Extra, quieter line under the actions. */
  note?: ReactNode;
  /** Technical detail, only ever passed in development. */
  details?: string;
};

function ErrorScreen({
  illustration,
  eyebrow,
  eyebrowClassName,
  title,
  description,
  actions,
  note,
  details,
}: ErrorScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A failure replaces the whole screen, so move focus to the message. Without
  // this a keyboard or screen-reader user is left on an element that no longer
  // exists and never hears what happened.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <a
          href="/"
          className="rounded-tile text-[15px] leading-none font-semibold tracking-[0.22em] text-foreground"
        >
          QUARTERS
        </a>

        <div aria-hidden="true" className="w-full max-w-[15.5rem]">
          {illustration}
        </div>

        <div role="alert" className="flex flex-col items-center gap-3">
          <span
            className={cn(
              "text-[11px] font-semibold tracking-[0.18em] uppercase",
              eyebrowClassName ?? "text-caution",
            )}
          >
            {eyebrow}
          </span>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl leading-snug font-semibold text-foreground outline-none sm:text-[1.75rem]"
          >
            {title}
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>
        </div>

        {actions && (
          <div className="flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
            {actions}
          </div>
        )}

        {details && (
          <p className="w-full overflow-x-auto rounded-tile border border-line bg-panel px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-subtle">
            {details}
          </p>
        )}

        {note && <p className="max-w-sm text-xs leading-relaxed text-subtle">{note}</p>}
      </div>
    </div>
  );
}

export type NoNetworkScreenProps = {
  /** Defaults to a hard reload, which is what recovers a dropped connection. */
  onRetry?: () => void;
  title?: string;
  description?: string;
  className?: string;
};

/**
 * Shown when a screen could not load because there is no connection.
 *
 * It points at what still works offline instead of only reporting the failure,
 * because the saved shortlist and the conversation inbox genuinely do open
 * without a network.
 */
export function NoNetworkScreen({
  onRetry,
  title = "You're offline",
  description = "QUARTERS needs a connection to open this screen. Check your data or Wi-Fi, then try again.",
  className,
}: NoNetworkScreenProps) {
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div className={className}>
      <ErrorScreen
        illustration={<NoNetworkIllustration />}
        eyebrow="No connection"
        title={title}
        description={description}
        actions={
          <>
            <Button onClick={retry}>
              <RotateCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
            <a
              href="/saved"
              className={buttonClasses({ variant: "secondary" })}
            >
              Open saved rooms
            </a>
          </>
        }
        note="Saved rooms and your conversations still open from the last sync, and anything you change is sent once you reconnect."
      />
    </div>
  );
}

export type CrashScreenProps = {
  onReload?: () => void;
  details?: string;
  title?: string;
  description?: string;
  className?: string;
};

/** Shown when the app itself broke, whatever the connection is doing. */
export function CrashScreen({
  onReload,
  details,
  title = "Something broke at our end",
  description = "This one is on us, not you. Our developers are already working on the fix — reload the app and you should land back where you were.",
  className,
}: CrashScreenProps) {
  const reload = onReload ?? (() => window.location.reload());

  return (
    <div className={className}>
      <ErrorScreen
        illustration={<CrashIllustration />}
        eyebrow="Under repair"
        eyebrowClassName="text-danger"
        title={title}
        description={description}
        details={details}
        actions={
          <>
            <Button onClick={reload}>
              <RotateCw className="size-4" aria-hidden="true" />
              Reload the app
            </Button>
            <a href="/" className={buttonClasses({ variant: "secondary" })}>
              Back to home
            </a>
          </>
        }
        note="Nothing you saved was lost. If this keeps happening, give it a few minutes and try again."
      />
    </div>
  );
}
