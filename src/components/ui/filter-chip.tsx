import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type FilterChipProps = {
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  /**
   * Whether tapping the chip opens a sheet. Inline toggles that filter the list
   * in place set this to false so they are not announced as dialogs.
   */
  opensSheet?: boolean;
  /** Opens the chip's filter sheet, or toggles the inline filter. */
  onClick: () => void;
};

/**
 * Compact filter control for the horizontally scrolling filter row. Keeps a
 * 44px touch target, announces that it opens a dialog, and has a subtle
 * pressed state.
 */
export function FilterChip({
  label,
  icon: Icon,
  active = false,
  opensSheet = true,
  onClick,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-haspopup={opensSheet ? "dialog" : undefined}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-xs font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft active:bg-panel-raised",
        active
          ? "border-accent/50 bg-accent/15 text-accent-soft"
          : "border-line bg-panel text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
