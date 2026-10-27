import { CloudOff, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatSnapshotAge } from "@/offline/offline-store";
import { offlineCopyNotice } from "@/offline/snapshots";
import { useOnlineStatus } from "@/offline/use-online-status";

/**
 * The app-wide offline indicator.
 *
 * It appears the moment the browser loses its connection and disappears when it
 * returns (the screens then reload from Supabase on their own). It says what
 * still works — the saved shortlist and the conversation inbox — rather than
 * only that something is broken.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 border-b border-caution/30 bg-caution/10 px-4 py-2 backdrop-blur-md"
    >
      <p className="mx-auto flex w-full max-w-6xl items-start gap-2 text-xs leading-relaxed text-caution">
        <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          You are offline. Your saved rooms and conversations open from the last
          sync; anything you change is sent once you reconnect.
        </span>
      </p>
    </div>
  );
}

/**
 * The line a screen shows when the list it is rendering came from the offline
 * copy, so cached rows are never mistaken for live ones.
 */
export function OfflineCopyNotice({
  savedAt,
  className,
}: {
  /** ISO timestamp of the read the copy came from. */
  savedAt: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-tile border border-caution/30 bg-caution/10 px-3.5 py-2.5 text-xs leading-relaxed text-caution",
        className,
      )}
    >
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{offlineCopyNotice(formatSnapshotAge(savedAt))}</span>
    </p>
  );
}
