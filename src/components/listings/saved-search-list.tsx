import {
  ArrowRight,
  BellRing,
  BellOff,
  Compass,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ListRowsSkeleton } from "@/components/feedback/skeletons";
import { Button, buttonClasses } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  criteriaFromSavedSearch,
  savedSearchParams,
  summarizeSavedSearch,
  type SavedSearch,
} from "@/listings/saved-searches";
import type { SavedSearchesStatus } from "@/listings/use-saved-searches";

export type SavedSearchListProps = {
  searches: SavedSearch[];
  status: SavedSearchesStatus;
  error: string | null;
  /** The search whose write is in flight, if any. */
  busyId: string | null;
  onSetNotify: (searchId: string, notify: boolean) => Promise<string | null>;
  onRename: (searchId: string, name: string) => Promise<string | null>;
  onRemove: (searchId: string) => Promise<string | null>;
  onReload: () => void;
};

/**
 * The saved searches an account is watching, each with the switch that decides
 * whether a newly published match writes an activity alert.
 *
 * "View results" reopens the search on Explore through the URL, so the results
 * screen is the same one the search was built on and the link can be reloaded
 * or shared.
 */
export function SavedSearchList({
  searches,
  status,
  error,
  busyId,
  onSetNotify,
  onRename,
  onRemove,
  onReload,
}: SavedSearchListProps) {
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm text-muted">
          Loading your saved searches…
        </p>
        <ListRowsSkeleton rows={3} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{error}</InlineAlert>
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={onReload}
          icon={<RefreshCw className="size-4" />}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (searches.length === 0) {
    return (
      <EmptyState
        icon={BellRing}
        title="No saved searches yet"
        description="Filter Explore the way you like — area, budget, room type and facilities — then tap Save search. QUARTERS keeps it here and can tell you the moment a new room matches."
        action={
          <Link to="/explore" className={buttonClasses({ size: "sm" })}>
            <Compass className="size-4" aria-hidden="true" />
            Build a search
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex list-none flex-col gap-3">
      {searches.map((search) => (
        <SavedSearchRow
          key={search.id}
          search={search}
          busy={busyId === search.id}
          onSetNotify={onSetNotify}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function SavedSearchRow({
  search,
  busy,
  onSetNotify,
  onRename,
  onRemove,
}: {
  search: SavedSearch;
  busy: boolean;
  onSetNotify: (searchId: string, notify: boolean) => Promise<string | null>;
  onRename: (searchId: string, name: string) => Promise<string | null>;
  onRemove: (searchId: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(search.name);
  const [editing, setEditing] = useState(false);
  const [busyAction, setBusyAction] = useState<"rename" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(search.name);
  }, [search.name]);

  const summary = summarizeSavedSearch(criteriaFromSavedSearch(search));
  const changed = name.trim().length > 0 && name.trim() !== search.name.trim();
  const resultsHref = `/explore?${savedSearchParams(
    criteriaFromSavedSearch(search),
  ).toString()}`;

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (busyAction || !changed) return;

    setBusyAction("rename");
    setError(null);
    const failure = await onRename(search.id, name);
    setBusyAction(null);

    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
  }

  async function handleDelete() {
    if (busyAction) return;

    setBusyAction("delete");
    setError(null);
    const failure = await onRemove(search.id);
    setBusyAction(null);
    if (failure) setError(failure);
  }

  async function handleNotify(next: boolean) {
    setError(null);
    const failure = await onSetNotify(search.id, next);
    if (failure) setError(failure);
  }

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel">
      {editing ? (
        <form
          onSubmit={(event) => void handleRename(event)}
          className="flex items-end gap-2"
        >
          <Input
            id={`saved-search-name-${search.id}`}
            label={`Name of the ${search.name} search`}
            hideLabel
            value={name}
            maxLength={SAVED_SEARCH_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1"
            disabled={busyAction !== null}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={busyAction === "rename"}
            disabled={!changed}
            className="mb-1.5"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mb-1.5"
            disabled={busyAction !== null}
            onClick={() => {
              setName(search.name);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-tile border border-line bg-canvas-soft text-accent-soft"
          >
            <Search className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-sm leading-snug font-semibold text-balance text-foreground">
              {search.name}
            </h3>
            <p className="text-xs leading-relaxed text-muted">{summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={`Rename ${search.name}`}
              variant="outline"
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
            >
              <Pencil className="size-4" />
            </IconButton>
            <IconButton
              label={`Delete ${search.name}`}
              variant="outline"
              onClick={() => {
                setError(null);
                setConfirming((current) => !current);
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      )}

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-tile border border-danger/40 bg-danger/10 p-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground">
            Delete “{search.name}”? You stop hearing about rooms that match it.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyAction !== null}
            onClick={() => setConfirming(false)}
          >
            Keep
          </Button>
          <Button
            size="sm"
            variant="soft"
            loading={busyAction === "delete"}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link
          to={resultsHref}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          View results
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
            search.notify ? "text-accent-soft" : "text-subtle"
          }`}
        >
          {search.notify ? (
            <BellRing className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <BellOff className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          {search.notify ? "Alerts on" : "Alerts off"}
        </span>
      </div>

      <Switch
        label={`Notify me when a new room matches ${search.name}`}
        description="One activity alert — and a push where you turned it on — each time an approved provider publishes a room that fits this search."
        checked={search.notify}
        onChange={(next) => void handleNotify(next)}
        disabled={busy}
      />

      {error && (
        <p role="alert" className="text-[11px] leading-relaxed text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
