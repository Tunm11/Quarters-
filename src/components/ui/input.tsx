import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  /** Visually hide the label while keeping it available to screen readers. */
  hideLabel?: boolean;
  description?: string;
  icon?: ReactNode;
  className?: string;
  inputClassName?: string;
};

export function Input({
  label,
  hideLabel = false,
  description,
  icon,
  className,
  inputClassName,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

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
          aria-describedby={descriptionId}
          className={cn(
            "h-12 w-full rounded-tile border border-line bg-panel text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-55",
            icon ? "pr-4 pl-11" : "px-4",
            inputClassName,
          )}
          {...rest}
        />
      </div>
      {description && (
        <p id={descriptionId} className="text-xs text-subtle">
          {description}
        </p>
      )}
    </div>
  );
}
