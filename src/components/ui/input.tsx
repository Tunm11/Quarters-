import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  /** Visually hide the label while keeping it available to screen readers. */
  hideLabel?: boolean;
  description?: string;
  /** Field-level error; announced and reflected in the input's styling. */
  error?: string;
  icon?: ReactNode;
  /** Control rendered inside the field's right edge, e.g. a password toggle. */
  trailing?: ReactNode;
  /** Rounded-pill field instead of the default rounded tile (search fields). */
  pill?: boolean;
  className?: string;
  inputClassName?: string;
};

export function Input({
  label,
  hideLabel = false,
  description,
  error,
  icon,
  trailing,
  pill = false,
  className,
  inputClassName,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "text-xs font-medium tracking-wide text-muted",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle"
          >
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-12 w-full border bg-panel text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-55",
            pill ? "rounded-pill" : "rounded-tile",
            error ? "border-danger/60" : "border-line",
            // Padding is computed (not overlapping) because cn does not merge classes.
            icon ? "pl-11" : "pl-4",
            trailing ? "pr-12" : "pr-4",
            inputClassName,
          )}
          {...rest}
        />
        {trailing && (
          <div className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {description && (
        <p id={descriptionId} className="text-xs text-subtle">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
