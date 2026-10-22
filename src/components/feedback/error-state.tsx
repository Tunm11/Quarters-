import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Optional technical detail for developers (never shown to end users by default). */
  details?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Failure surface for a section or route. Rendered with alert semantics so the
 * message is announced when it appears; it never pretends a retry succeeded.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "That request could not be completed. Please try again in a moment.",
  details,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-4 rounded-card border border-danger/25 bg-danger/5 p-6",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-tile border border-danger/25 bg-panel text-danger"
      >
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {details && (
        <p className="w-full overflow-x-auto rounded-tile border border-line bg-canvas-soft px-3 py-2 font-mono text-xs text-subtle">
          {details}
        </p>
      )}
      {action && <div className="flex flex-wrap items-center gap-3">{action}</div>}
    </div>
  );
}
