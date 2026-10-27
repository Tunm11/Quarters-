import { CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type InlineAlertTone = "danger" | "positive";

const toneStyles: Record<InlineAlertTone, string> = {
  danger: "border-danger/30 bg-danger/5 text-danger",
  positive: "border-positive/30 bg-positive/10 text-positive",
};

const toneIcons: Record<InlineAlertTone, LucideIcon> = {
  danger: TriangleAlert,
  positive: CircleCheck,
};

export type InlineAlertProps = {
  tone?: InlineAlertTone;
  children: ReactNode;
  className?: string;
};

/**
 * Compact message rendered inside forms and cards. Danger messages use alert
 * semantics so they are announced; positive messages use status semantics.
 */
export function InlineAlert({ tone = "danger", children, className }: InlineAlertProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-tile border px-3.5 py-3 text-sm",
        toneStyles[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
