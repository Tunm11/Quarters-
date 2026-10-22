import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="QUARTERS home"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-tile text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-8 shrink-0 rounded-[9px] border border-line-strong"
      >
        <rect width="32" height="32" rx="9" fill="#141319" />
        <path d="M16 5.5a10.5 10.5 0 0 1 10.5 10.5H16Z" fill="#b3a6ff" />
        <path d="M16 16h10.5A10.5 10.5 0 0 1 16 26.5Z" fill="#8f7bf6" />
        <path d="M16 16v10.5A10.5 10.5 0 0 1 5.5 16Z" fill="#5d4bbd" />
        <path d="M16 5.5V16H5.5A10.5 10.5 0 0 1 16 5.5Z" fill="#2b2740" />
      </svg>
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tracking-[0.22em]">QUARTERS</span>
        <span className="text-[11px] font-medium text-accent-soft">2.0</span>
      </span>
    </Link>
  );
}
