import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Placeholder block for content that is still loading. Hidden from assistive
 * technology; pair it with a live status message when the wait is meaningful.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-line", className)}
      {...rest}
    />
  );
}
