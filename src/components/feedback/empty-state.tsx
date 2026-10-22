import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Extra context rendered under the action, e.g. an honest status note. */
  note?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  note,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-card border border-dashed border-line-strong bg-panel/40 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-3">{action}</div>}
      {note && <div className="text-xs leading-relaxed text-subtle">{note}</div>}
    </div>
  );
}
