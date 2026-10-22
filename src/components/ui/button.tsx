import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-55";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-accent hover:bg-accent-soft active:bg-accent-strong",
  secondary:
    "border border-line-strong bg-panel text-foreground hover:border-accent/50 hover:bg-panel-raised",
  ghost: "text-muted hover:bg-panel hover:text-foreground",
  soft: "bg-accent/15 text-accent-soft hover:bg-accent/25",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/**
 * Shared button styling so links can look like buttons without duplicating
 * class strings (see the landing page CTAs).
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}): string {
  return cn(base, variantStyles[variant], sizeStyles[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and marks the control busy; the label stays visible. */
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "start",
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        icon && iconPosition === "start" && <span aria-hidden="true">{icon}</span>
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === "end" && (
        <span aria-hidden="true">{icon}</span>
      )}
    </button>
  );
}
