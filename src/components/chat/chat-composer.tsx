import { DoorOpen, ImagePlus, Plus, Send, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { PropertyPickerSheet } from "@/components/chat/property-picker-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { uploadChatImage, validateChatImage, type ChatMediaKind } from "@/chat/media";
import { supabase } from "@/lib/supabase";
import {
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";

export type ChatComposerSendInput = {
  body: string;
  sharedListingId: string | null;
  imagePath: string | null;
};

export type ChatComposerProps = {
  inputId: string;
  placeholder: string;
  maxLength: number;
  sending: boolean;
  /** Which storage folder an uploaded photo belongs to. */
  mediaKind: ChatMediaKind;
  conversationId: string;
  onSend: (input: ChatComposerSendInput) => Promise<string | null>;
  /** Called as the draft changes, so the thread can broadcast "typing…". */
  onTyping?: () => void;
  /** Called once a send succeeds, to clear the viewer's typing signal. */
  onTypingStop?: () => void;
};

/**
 * The composer every thread shares: text, plus a "+" beside Send for a photo or
 * a property card. A photo is uploaded when the message is sent (so cancelling
 * costs nothing), and a message may carry text, an attachment, or both.
 *
 * The body always has something in it — the tables require 1–1000 characters —
 * so an attachment sent on its own gets a short caption that still reads well in
 * a notification.
 */
export function ChatComposer({
  inputId,
  placeholder,
  maxLength,
  sending,
  mediaKind,
  conversationId,
  onSend,
  onTyping,
  onTypingStop,
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A local preview without uploading yet; revoked as soon as it is replaced.
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const busy = sending || uploading;
  const ready = Boolean(draft.trim() || file || listing);

  // One line tall until the message needs more, so the input, the "+" and Send
  // all sit on the same 44px line; beyond that the row grows upward and the
  // controls stay anchored to its bottom edge.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [draft]);

  function pickFile(next: File | null) {
    setError(null);
    if (!next) return;
    const invalid = validateChatImage(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setFile(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;

    setError(null);
    let imagePath: string | null = null;

    if (file) {
      const client = supabase;
      if (!client) {
        setError("Sign in to send a photo.");
        return;
      }
      setUploading(true);
      const uploaded = await uploadChatImage(client, {
        kind: mediaKind,
        conversationId,
        file,
      });
      setUploading(false);
      if (!uploaded.path || uploaded.error) {
        setError(uploaded.error ?? "Could not upload that photo.");
        return;
      }
      imagePath = uploaded.path;
    }

    const body =
      draft.trim() ||
      (listing
        ? `Have a look at ${listing.title}.`
        : "Sent a photo.");

    const failure = await onSend({
      body,
      sharedListingId: listing?.id ?? null,
      imagePath,
    });
    if (failure) {
      setError(failure);
      return;
    }

    setDraft("");
    setFile(null);
    setListing(null);
    onTypingStop?.();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {error && <InlineAlert>{error}</InlineAlert>}

        {(file || listing) && (
          <div className="flex flex-wrap items-end gap-2">
            {file && (
              <div className="relative">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Photo to send"
                    className="size-16 rounded-tile border border-line object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-tile border border-line bg-panel-raised text-[10px] text-subtle">
                    Photo
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setFile(null)}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-pill border border-line-strong bg-panel text-muted hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            )}

            {listing && (
              <div className="flex max-w-full items-center gap-2 rounded-tile border border-line bg-panel px-2.5 py-2">
                <ImagePlus
                  className="size-4 shrink-0 text-accent-soft"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-foreground">
                    {listing.title}
                  </span>
                  <span className="block truncate text-[10px] text-subtle">
                    {formatListingRent(listing) || "Property card"}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Remove property card"
                  onClick={() => setListing(null)}
                  className="grid size-6 shrink-0 place-items-center rounded-pill text-muted hover:bg-panel-raised hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value.trim()) onTyping?.();
            }}
            rows={1}
            maxLength={maxLength}
            placeholder={placeholder}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-tile border border-line bg-panel-raised px-3 py-2.5 text-sm text-foreground placeholder:text-subtle focus-visible:border-accent/50"
            disabled={busy}
          />
          <IconButton
            label="Add a photo or property card"
            variant="outline"
            onClick={() => setMenuOpen(true)}
            disabled={busy}
          >
            <Plus className="size-4" />
          </IconButton>
          <Button
            type="submit"
            loading={busy}
            disabled={!ready}
            icon={<Send className="size-4" />}
          >
            Send
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a photo"
          className="sr-only"
          onChange={(event) => {
            pickFile(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </form>

      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Add to your message"
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              fileInputRef.current?.click();
            }}
            className="flex items-start gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
            >
              <ImagePlus className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">Photo</span>
              <span className="text-[11px] leading-relaxed text-subtle">
                JPEG, PNG or WebP, up to 8MB.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPickerOpen(true);
            }}
            className="flex items-start gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
            >
              <DoorOpen className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">
                Property card
              </span>
              <span className="text-[11px] leading-relaxed text-subtle">
                Share a room from the catalogue as a tappable card.
              </span>
            </span>
          </button>
        </div>
      </BottomSheet>

      <PropertyPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedId={listing?.id ?? null}
        onSelect={(picked) => {
          setListing(picked);
          setError(null);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
