import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "raised" | "accent";
  children: ReactNode;
};

const toneStyles = {
  default: "border-line bg-panel/70",
  raised: "border-line bg-panel-raised shadow-panel",
  accent: "border-accent/30 bg-accent/10",
} as const;

/** Rounded, bordered surface used for grouped content. */
export function Panel({ tone = "default", className, children, ...rest }: PanelProps) {
  return (
    <div
      className={cn("rounded-card border p-5 sm:p-6", toneStyles[tone], className)}
      {...rest}
    >
      {children}
    </div>
  );
}
