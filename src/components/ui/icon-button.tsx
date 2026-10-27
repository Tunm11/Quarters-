import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "plain" | "outline";
export type IconButtonClassOptions = {
  variant?: IconButtonVariant;
  className?: string;
};

const iconButtonBase =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-55 aria-pressed:bg-panel-raised aria-pressed:text-foreground";

const iconButtonVariants: Record<IconButtonVariant, string> = {
  plain: "hover:bg-panel hover:text-foreground active:bg-panel-raised",
  outline:
    "border border-line-strong hover:border-accent/50 hover:bg-panel hover:text-foreground active:bg-panel-raised",
};

/**
 * Shared icon-button styling so links can use the same 44px touch target and
 * states without duplicating class strings (see the header profile link).
 */
export function iconButtonClasses({
  variant = "plain",
  className,
}: IconButtonClassOptions = {}): string {
  return cn(iconButtonBase, iconButtonVariants[variant], className);
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name: icon-only controls must always describe their action. */
  label: string;
  variant?: IconButtonVariant;
  children: ReactNode;
};

/**
 * Icon-led control for familiar actions (close, filters, password toggle).
 * Keeps a ~44x44 CSS pixel touch target and, because the visible label is
 * optional, always requires an accessible name.
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
      className={iconButtonClasses({ variant, className })}
      {...rest}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {children}
      </span>
    </button>
  );
}
