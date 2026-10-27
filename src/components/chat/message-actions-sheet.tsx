import { EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  canEditMessage,
  deleteChatMessageForEveryone,
  editChatMessage,
  hideChatMessage,
  type ChatMessageKind,
} from "@/chat/message-management";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

/** The message the sheet is acting on, as the thread already knows it. */
export type MessageActionsTarget = {
  id: string;
  body: string;
  /** The viewer wrote it, so edit and "for everyone" are available. */
  mine: boolean;
  /** Already withdrawn: only hiding it from this viewer is left. */
  deleted: boolean;
};

export type MessageActionsSheetProps = {
  open: boolean;
  onClose: () => void;
  kind: ChatMessageKind;
  message: MessageActionsTarget | null;
  /** The thread should reload: something about this message changed. */
  onChanged: () => void;
};

type Mode = "menu" | "edit" | "delete-everyone";

const surfaceLabels: Record<ChatMessageKind, string> = {
  room: "this room chat",
  roommate: "this roommate chat",
  group: "this group",
};

/**
 * One place to manage a single message: rewrite it, drop it from your own view,
 * or withdraw it for everyone in the thread. Edits and withdrawals are the
 * sender's alone; hiding is personal and never touches anyone else's copy.
 */
export function MessageActionsSheet({
  open,
  onClose,
  kind,
  message,
  onChanged,
}: MessageActionsSheetProps) {
  const [mode, setMode] = useState<Mode>("menu");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Every open starts from the message's current text.
  useEffect(() => {
    if (!open || !message) return;
    setMode("menu");
    setDraft(message.deleted ? "" : message.body);
    setError(null);
    setBusy(false);
  }, [open, message]);

  useEffect(() => {
    if (mode !== "edit") return;
    draftRef.current?.focus();
  }, [mode]);

  const editable =
    message != null &&
    canEditMessage({ mine: message.mine, deleted: message.deleted });
  const changed = message != null && draft.trim() !== message.body.trim();

  async function handleSaveEdit() {
    const client = supabase;
    if (!client || !message || busy) return;

    setBusy(true);
    setError(null);
    const result = await editChatMessage(client, {
      kind,
      messageId: message.id,
      body: draft,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  async function handleHide() {
    const client = supabase;
    if (!client || !message || busy) return;

    setBusy(true);
    setError(null);
    const result = await hideChatMessage(client, {
      kind,
      messageId: message.id,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  async function handleDeleteForEveryone() {
    const client = supabase;
    if (!client || !message || busy) return;

    setBusy(true);
    setError(null);
    const result = await deleteChatMessageForEveryone(client, {
      kind,
      messageId: message.id,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Message">
      <div className="flex flex-col gap-3 pb-1">
        {error && <InlineAlert>{error}</InlineAlert>}

        {mode === "menu" && (
          <>
            <p className="rounded-tile border border-line bg-panel-raised px-3 py-2 text-sm leading-relaxed break-words text-muted">
              {message?.deleted
                ? "This message was deleted for everyone."
                : message?.body}
            </p>

            {editable && (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className={actionRowClasses}
              >
                <Pencil className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-foreground">Edit message</span>
                  <span className="text-[11px] text-subtle">
                    Everyone sees the new text, marked edited.
                  </span>
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleHide()}
              disabled={busy}
              className={actionRowClasses}
            >
              <EyeOff className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-foreground">Delete for me</span>
                <span className="text-[11px] text-subtle">
                  Removes it from your view only.
                </span>
              </span>
            </button>

            {editable && (
              <button
                type="button"
                onClick={() => setMode("delete-everyone")}
                className={cn(actionRowClasses, "text-danger")}
              >
                <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-foreground">
                    Delete for everyone
                  </span>
                  <span className="text-[11px] text-subtle">
                    Withdraws it from {surfaceLabels[kind]}. This cannot be
                    undone.
                  </span>
                </span>
              </button>
            )}
          </>
        )}

        {mode === "edit" && message && (
          <>
            <label
              htmlFor="message-edit-body"
              className="text-[11px] font-medium tracking-wide text-subtle uppercase"
            >
              Edit message
            </label>
            <textarea
              id="message-edit-body"
              ref={draftRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              className="min-h-[5.5rem] w-full resize-y rounded-tile border border-line bg-panel-raised px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-subtle focus-visible:border-accent/50"
            />
            <p className="text-[11px] text-subtle">
              {CHAT_MESSAGE_MAX_LENGTH - draft.length} characters left
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("menu")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveEdit()}
                loading={busy}
                disabled={!changed}
              >
                Save changes
              </Button>
            </div>
          </>
        )}

        {mode === "delete-everyone" && (
          <>
            <div className="flex flex-col gap-1.5 rounded-tile border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm leading-relaxed text-foreground">
                Delete this message for everyone?
              </p>
              <p className="text-[11px] leading-relaxed text-subtle">
                It is replaced with “This message was deleted” in{" "}
                {surfaceLabels[kind]}, and any photo or property card in it is
                removed. This cannot be undone.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setMode("menu")}
                disabled={busy}
              >
                Keep it
              </Button>
              <Button
                size="sm"
                variant="soft"
                className="text-danger"
                onClick={() => void handleDeleteForEveryone()}
                loading={busy}
                icon={<Trash2 className="size-4" />}
              >
                Delete for everyone
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

const actionRowClasses =
  "flex w-full items-center gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-55";

/**
 * The small per-bubble control that opens the sheet. A plain button rather than
 * IconButton: a message row needs a quieter target than the 44px header controls.
 */
export function MessageOptionsButton({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className="grid size-8 place-items-center rounded-pill text-subtle transition-colors hover:bg-panel hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
    >
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </button>
  );
}
