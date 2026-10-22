import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type LoadingStateProps = {
  label?: string;
  description?: string;
  /** Use "page" for route-level waits, "inline" inside a section. */
  variant?: "page" | "inline";
  className?: string;
};

export function LoadingState({
  label = "Loading",
  description,
  variant = "inline",
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 text-sm text-muted",
        variant === "page" && "flex-col justify-center py-20 text-center",
        className,
      )}
    >
      <LoaderCircle className="size-5 animate-spin text-accent-soft" aria-hidden="true" />
      <span className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{label}</span>
        {description && <span className="text-xs text-subtle">{description}</span>}
      </span>
    </div>
  );
}
