import { cn } from "@/lib/cn";

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible row label. */
  label: string;
  /** Optional supporting copy under the label. */
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Row-shaped toggle. The whole row is a button with role="switch", so it has a
 * large tap target on mobile while still exposing checked state to assistive
 * technology.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-tile px-1 py-3 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-canvas-soft/60",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs leading-relaxed text-muted">{description}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors",
          checked
            ? "border-accent bg-accent"
            : "border-line-strong bg-canvas-soft",
        )}
      >
        <span
          className={cn(
            "absolute size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
