import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

/**
 * Text-only QUARTERS wordmark.
 *
 * The reference direction calls for a quiet wordmark rather than a symbol, so
 * this stays typographic and inherits the current accent/foreground tokens.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="QUARTERS home"
      className={cn(
        "inline-flex min-w-0 flex-col rounded-tile text-foreground",
        className,
      )}
    >
      <span className="text-[15px] leading-none font-semibold tracking-[0.22em]">
        QUARTERS
      </span>
      <span className="mt-1 text-[8px] leading-none font-medium tracking-[0.24em] text-muted uppercase">
        Rooms near campus
      </span>
    </Link>
  );
}
