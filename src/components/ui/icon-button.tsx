import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name: icon-only controls must always describe their action. */
  label: string;
  variant?: "plain" | "outline";
  children: ReactNode;
};

/**
 * Icon-led control for familiar actions (close, filters, share). The visible
 * label is optional, so an accessible name is required.
 */
export function IconButton({
  label,
  variant = "plain",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-pill transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-55",
        variant === "plain"
          ? "text-muted hover:bg-panel hover:text-foreground"
          : "border border-line-strong text-muted hover:border-accent/50 hover:bg-panel hover:text-foreground",
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {children}
      </span>
    </button>
  );
}
