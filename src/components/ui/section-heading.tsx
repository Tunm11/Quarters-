import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SectionHeadingProps = {
  /** Unique id so the surrounding section can reference it via aria-labelledby. */
  id: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Optional control aligned to the end of the heading row. */
  action?: ReactNode;
  /** Heading level; defaults to h2 to sit under a page's h1. */
  level?: 1 | 2 | 3;
  className?: string;
};

/**
 * Shared section header: quiet eyebrow, strong title, optional description and
 * trailing action. Keeps hierarchy and spacing identical across screens.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  level,
  className,
}: SectionHeadingProps) {
  const Tag = level === 1 ? "h1" : level === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && (
            <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
              {eyebrow}
            </p>
          )}
          <Tag
            id={id}
            className={cn(
              "font-semibold tracking-tight text-foreground",
              Tag === "h1" ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
            )}
          >
            {title}
          </Tag>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {description && (
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}
