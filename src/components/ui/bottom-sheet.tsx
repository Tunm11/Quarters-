import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Dialog title, referenced by aria-labelledby. */
  title: string;
  children: ReactNode;
  /** Sticky footer content, e.g. the Apply or Done button. */
  footer?: ReactNode;
  /** Extra controls in the header, before the close button (e.g. a chat menu). */
  action?: ReactNode;
  /** "tall" fills most of the viewport, for conversation sheets. */
  size?: "default" | "tall";
  className?: string;
};

/**
 * Mobile bottom sheet rendered above everything — including the floating
 * navigation dock (z-50 vs the dock's z-40). It respects the iPhone safe area
 * in its footer, scrolls internally on short viewports, closes on Escape or
 * backdrop tap, and moves focus into the dialog when it opens.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  action,
  size = "default",
  className,
}: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest close handler without re-running the open effect (which
  // would steal focus back on every parent render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-canvas/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-t-sheet border border-line bg-panel shadow-float focus:outline-none",
          size === "tall"
            ? "h-[88dvh] max-h-[92dvh] max-w-lg sm:h-[85dvh] sm:max-w-xl"
            : "max-h-[85dvh] max-w-lg",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-foreground">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="border-t border-line px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
