import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "outline" | "positive";

const toneStyles: Record<BadgeTone, string> = {
  neutral: "border-line bg-panel text-muted",
  accent: "border-accent/35 bg-accent/12 text-accent-soft",
  outline: "border-line-strong bg-transparent text-muted",
  positive: "border-positive/30 bg-positive/10 text-positive",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        toneStyles[tone],
        className,
      )}
      {...rest}
    />
  );
}
