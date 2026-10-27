import { FolderPlus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  COLLECTION_NAME_MAX_LENGTH,
  type SavedCollection,
} from "@/listings/saved-collections";
import type { SavedListingsStatus } from "@/listings/use-saved-listings";

export type ShortlistCollectionsSheetProps = {
  open: boolean;
  onClose: () => void;
  collections: SavedCollection[];
  status: SavedListingsStatus;
  error: string | null;
  onCreate: (name: string) => Promise<SavedCollection | null>;
  onRename: (collectionId: string, name: string) => Promise<string | null>;
  onDelete: (collectionId: string) => Promise<string | null>;
};

/**
 * Manage the folders behind the shortlist. Renaming and deleting live here
 * rather than on the chips row so the chips stay a filter, and deleting a
 * collection is explicit about the rooms surviving it.
 */
export function ShortlistCollectionsSheet({
  open,
  onClose,
  collections,
  status,
  error,
  onCreate,
  onRename,
  onDelete,
}: ShortlistCollectionsSheetProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setName("");
    setCreateError(null);
  }, [open]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    setCreateError(null);
    const created = await onCreate(name);
    setCreating(false);

    if (!created) {
      setCreateError("Could not create that collection. Try another name.");
      return;
    }
    setName("");
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Collections"
      footer={
        <p className="text-[11px] leading-relaxed text-subtle">
          A room sits in one collection at a time. Deleting a collection keeps
          every room — they move back to Unsorted.
        </p>
      }
    >
      <form
        onSubmit={(event) => void handleCreate(event)}
        className="flex items-end gap-2"
      >
        <Input
          id="new-collection"
          label="New collection"
          value={name}
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          placeholder="Near campus"
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          loading={creating}
          disabled={name.trim().length === 0}
          icon={<FolderPlus className="size-4" />}
        >
          Add
        </Button>
      </form>

      {createError && (
        <div className="mt-3">
          <InlineAlert>{createError}</InlineAlert>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}

      {status === "loading" ? (
        <div className="mt-4">
          <LoadingState label="Loading your collections" />
        </div>
      ) : collections.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          No collections yet. Make one above, then file saved rooms into it from
          the Saved tab.
        </p>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-2">
          {collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}

function CollectionRow({
  collection,
  onRename,
  onDelete,
}: {
  collection: SavedCollection;
  onRename: (collectionId: string, name: string) => Promise<string | null>;
  onDelete: (collectionId: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState<"rename" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(collection.name);
  }, [collection.name]);

  const changed =
    name.trim().length > 0 && name.trim() !== collection.name.trim();

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (busy || !changed) return;

    setBusy("rename");
    setError(null);
    const failure = await onRename(collection.id, name);
    setBusy(null);
    if (failure) setError(failure);
  }

  async function handleDelete() {
    if (busy) return;

    setBusy("delete");
    setError(null);
    const failure = await onDelete(collection.id);
    setBusy(null);
    if (failure) {
      setError(failure);
      return;
    }
    setConfirming(false);
  }

  return (
    <li className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-2.5">
      <form
        onSubmit={(event) => void handleRename(event)}
        className="flex items-end gap-2"
      >
        <Input
          id={`collection-${collection.id}`}
          label={`Name of the ${collection.name} collection`}
          hideLabel
          value={name}
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={busy === "rename"}
          disabled={!changed}
          className="mb-1.5"
        >
          Save
        </Button>
        <IconButton
          label={`Delete the ${collection.name} collection`}
          variant="outline"
          className="mb-1"
          onClick={() => {
            setError(null);
            setConfirming((current) => !current);
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </form>

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-tile border border-danger/40 bg-danger/10 p-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground">
            Delete “{collection.name}”? Its rooms stay saved under Unsorted.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setConfirming(false)}
          >
            Keep
          </Button>
          <Button
            size="sm"
            variant="soft"
            loading={busy === "delete"}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </li>
  );
}
