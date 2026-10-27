import { BellRing, BookmarkPlus, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  suggestSavedSearchName,
  summarizeSavedSearch,
  type SavedSearch,
  type SavedSearchCriteria,
} from "@/listings/saved-searches";

export type SaveSearchSheetProps = {
  open: boolean;
  onClose: () => void;
  criteria: SavedSearchCriteria;
  /** How many of the rooms on screen match right now; null while unknown. */
  matchCount: number | null;
  onCreate: (input: {
    name: string;
    criteria: SavedSearchCriteria;
    notify: boolean;
  }) => Promise<{ search: SavedSearch | null; error: string | null }>;
  /** Called with the stored search once the row exists. */
  onSaved?: (search: SavedSearch) => void;
};

/**
 * Names the search currently built on Explore and saves it to the account.
 *
 * The alert switch is the whole point of saving a search, so it sits in the
 * sheet rather than behind a second screen. It only promises what the database
 * actually does: a newly published room that matches writes one activity row
 * (and therefore one push, where the student subscribed).
 */
export function SaveSearchSheet({
  open,
  onClose,
  criteria,
  matchCount,
  onCreate,
  onSaved,
}: SaveSearchSheetProps) {
  const summary = summarizeSavedSearch(criteria);
  const [name, setName] = useState(() => suggestSavedSearchName(criteria));
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every time the sheet opens — or the search behind it changes — it offers a
  // name for the search as it stands, rather than the name of the last one.
  // The summary string identifies the search, so re-renders that leave the
  // search alone do not overwrite what has been typed.
  useEffect(() => {
    if (!open) return;
    setName(suggestSavedSearchName(criteria));
    setNotify(true);
    setError(null);
  }, [open, summary]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (name.trim().length === 0) {
      setError("Give this search a name first.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onCreate({ name, criteria, notify });
    setSaving(false);

    if (result.error || !result.search) {
      setError(result.error ?? "Could not save this search. Please try again.");
      return;
    }
    onSaved?.(result.search);
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Save this search"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form="save-search-form"
            loading={saving}
            className="flex-1"
            icon={<BookmarkPlus className="size-4" />}
          >
            Save search
          </Button>
        </div>
      }
    >
      <form
        id="save-search-form"
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex items-start gap-3 rounded-tile border border-line bg-panel-raised p-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
          >
            <Search className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[11px] font-medium tracking-[0.16em] text-sand uppercase">
              What you are watching
            </p>
            <p className="text-sm leading-relaxed text-foreground">{summary}</p>
            <p className="text-xs leading-relaxed text-muted">
              {matchCount == null
                ? "Matching rooms are counted as the catalogue loads."
                : matchCount === 0
                  ? "No published room matches this search yet — saving it is how you hear about the first one."
                  : `${matchCount} of the rooms loaded so far ${
                      matchCount === 1 ? "matches" : "match"
                    } this search.`}
            </p>
          </div>
        </div>

        <Input
          id="saved-search-name"
          label="Name this search"
          value={name}
          maxLength={SAVED_SEARCH_NAME_MAX_LENGTH}
          placeholder="Akoka under ₦700k"
          description={`Up to ${SAVED_SEARCH_NAME_MAX_LENGTH} characters. It appears in the alert you receive.`}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
        />

        <div className="rounded-tile border border-line bg-panel-raised px-3">
          <Switch
            label="Notify me when a room matches"
            description="One activity alert — and a push where you turned it on — when an approved provider publishes a room that fits this search."
            checked={notify}
            onChange={setNotify}
            disabled={saving}
          />
        </div>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-subtle">
          <BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Alerts follow the account, so they reach every device you sign in
          with. Saved rooms already have their own rent and availability alerts
          in Settings.
        </p>

        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </BottomSheet>
  );
}
