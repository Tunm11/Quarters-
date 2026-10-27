import { Search, X } from "lucide-react";

/** Any message shape a thread renders; only the body and tombstone matter here. */
export type SearchableMessage = {
  body: string;
  deleted_at?: string | null;
};

/**
 * Narrow a loaded thread to the messages containing the query.
 *
 * Search runs over what is already in the sheet — the threads are loaded in one
 * go — so it is instant and needs no round trip. Withdrawn messages are skipped:
 * their text no longer exists for anyone.
 */
export function filterMessagesByQuery<T extends SearchableMessage>(
  messages: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return messages;
  return messages.filter(
    (message) =>
      !message.deleted_at && message.body.toLowerCase().includes(needle),
  );
}

export type MessageSearchBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** How many messages the query matched. */
  matches: number;
  /** How many messages are in the thread. */
  total: number;
  onClose: () => void;
  /** Accessible name for the field, e.g. "Search this group". */
  label: string;
};

/**
 * The search strip a chat sheet shows under its header: one field, a live match
 * count, and a way out that restores the whole thread.
 */
export function MessageSearchBar({
  query,
  onQueryChange,
  matches,
  total,
  onClose,
  label,
}: MessageSearchBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-tile border border-line bg-panel-raised px-2.5 py-1.5">
      <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label={label}
        placeholder="Search this conversation"
        autoFocus
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground placeholder:text-subtle focus:outline-none"
      />
      {query.trim() !== "" && (
        <span
          role="status"
          className="shrink-0 text-[11px] tabular-nums text-subtle"
        >
          {matches} of {total}
        </span>
      )}
      <button
        type="button"
        aria-label="Close search"
        title="Close search"
        onClick={onClose}
        className="grid size-8 shrink-0 place-items-center rounded-pill text-subtle transition-colors hover:bg-panel hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
