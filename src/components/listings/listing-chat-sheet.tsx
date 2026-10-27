import { Flag, MoreVertical, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import {
  MessageActionsSheet,
  MessageOptionsButton,
} from "@/components/chat/message-actions-sheet";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ChatThreadSkeleton } from "@/components/feedback/skeletons";
import { ListingMiniCard } from "@/components/listings/listing-mini-card";
import { ReportListingSheet } from "@/components/listings/report-listing";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  MessageSearchBar,
  filterMessagesByQuery,
} from "@/components/chat/message-search";
import { typingLabel, useTypingIndicator } from "@/chat/typing";
import { IconButton } from "@/components/ui/icon-button";
import { useChatAttachments } from "@/chat/use-chat-attachments";
import {
  LISTING_MESSAGE_MAX_LENGTH,
  type ListingMessage,
} from "@/listings/listing-messages";
import { useListingChat } from "@/listings/use-listing-chat";
import { cn } from "@/lib/cn";

export type ListingChatSheetProps = {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  /** Thread key: the student who opened the conversation. */
  studentId: string;
  viewerId: string;
  /** Who the viewer is talking to — the provider on the student side, the student on the provider side. */
  peerLabel: string;
};

/** The body a photo-only message is stored with; the bubble hides it. */
const PHOTO_ONLY_BODY = "Sent a photo.";

/**
 * One listing conversation, from either side.
 *
 * The student reaches it from the "Listed by" card on a room, the provider from
 * their inbox. Both write into the same (listing, student) thread, so this single
 * sheet keeps the two experiences identical: live messages, "Seen" receipts, the
 * same composer, and photos or property cards alongside text.
 */
export function ListingChatSheet({
  open,
  onClose,
  listingId,
  listingTitle,
  studentId,
  viewerId,
  peerLabel,
}: ListingChatSheetProps) {
  const [actionsFor, setActionsFor] = useState<ListingMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState<string | null>(null);
  /* The student owns this thread's listing; the provider is only answering. */
  const viewingRoom = studentId === viewerId;
  const typing = useTypingIndicator({
    kind: "room",
    conversationId: `${listingId}:${studentId}`,
    viewerId,
    enabled: open,
  });
  const { messages, loading, error, sending, send, reload } = useListingChat({
    enabled: open,
    listingId,
    studentId,
    viewerId,
  });
  const { listings, imageUrls } = useChatAttachments(messages);
  const visibleMessages = filterMessagesByQuery(messages, searchOpen ? query : "");
  const endRef = useRef<HTMLLIElement>(null);

  // Keep the newest message in view, including when a reply arrives live.
  useEffect(() => {
    if (!open) return;
    const anchor = endRef.current;
    // Guarded: not every environment implements scrolling on an element.
    if (typeof anchor?.scrollIntoView === "function") {
      anchor.scrollIntoView({ block: "end" });
    }
  }, [open, messages.length]);

  return (
    <BottomSheet
      open={open}
      /* The message sheet can sit on top, so Escape closes only that one. */
      onClose={() => {
        // The report sheet and the message sheet sit on top; Escape closes those.
        if (!actionsFor && !reportOpen) onClose();
      }}
      title={`Chat with ${peerLabel}`}
      className="min-h-[55dvh]"
      action={
        <>
          <IconButton
            label="Search this conversation"
            variant="outline"
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((current) => !current);
              setQuery("");
            }}
          >
            <Search className="size-4" />
          </IconButton>
          {viewingRoom && (
            <div className="relative">
              <IconButton
                label="Conversation options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <MoreVertical className="size-4" />
              </IconButton>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Conversation options"
                  className="absolute top-full right-0 z-20 mt-1 flex w-64 flex-col gap-0.5 rounded-tile border border-line bg-panel p-1 shadow-float"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                  >
                    <Flag className="size-3.5 shrink-0 text-danger" aria-hidden="true" />
                    Report this room
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      }
      footer={
        <ChatComposer
          inputId="listing-chat-message"
          placeholder="Ask about the rent, the room or a viewing…"
          maxLength={LISTING_MESSAGE_MAX_LENGTH}
          sending={sending}
          mediaKind="room"
          conversationId={listingId}
          onSend={send}
          onTyping={typing.notifyTyping}
          onTypingStop={typing.stopTyping}
        />
      }
    >
      <div className="flex min-h-40 flex-col gap-3">
        <p className="text-[11px] leading-relaxed text-subtle">{listingTitle}</p>

        {searchOpen && (
          <MessageSearchBar
            query={query}
            onQueryChange={setQuery}
            matches={visibleMessages.length}
            total={messages.length}
            onClose={() => {
              setSearchOpen(false);
              setQuery("");
            }}
            label="Search room messages"
          />
        )}

        {error && <InlineAlert>{error}</InlineAlert>}

        {reportNote && <InlineAlert tone="positive">{reportNote}</InlineAlert>}

        {loading && messages.length === 0 && (
          <>
            <span role="status" className="sr-only">
              Loading messages
            </span>
            <ChatThreadSkeleton />
          </>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            No messages yet. Say hello, ask what you need to know, or send a
            photo of what you are looking for.
          </p>
        )}

        {searchOpen && query.trim() && visibleMessages.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            No messages match “{query.trim()}”.
          </p>
        )}

        <ul className="flex list-none flex-col gap-2">
          {visibleMessages.map((message) => {
            const mine = message.sender_id === viewerId;
            const sharedListing = message.shared_listing_id
              ? listings.get(message.shared_listing_id)
              : undefined;
            const imageUrl = message.image_path
              ? imageUrls.get(message.image_path)
              : undefined;
            const body =
              imageUrl && message.body === PHOTO_ONLY_BODY ? "" : message.body;
            return (
              <li
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-tile border px-3 py-2 text-sm leading-relaxed",
                  mine
                    ? "self-end border-accent/30 bg-accent/12 text-foreground"
                    : "self-start border-line bg-panel-raised text-foreground",
                )}
              >
                {message.deleted_at ? (
                  <p className="text-[13px] italic leading-relaxed text-subtle">
                    This message was deleted
                  </p>
                ) : (
                  <>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Shared photo"
                        loading="lazy"
                        className="mb-1.5 max-h-56 w-full rounded-[0.6rem] object-cover"
                      />
                    )}
                    {body && (
                      <p className="whitespace-pre-line break-words">{body}</p>
                    )}
                    {sharedListing && (
                      <ListingMiniCard listing={sharedListing} />
                    )}
                  </>
                )}
                {mine && message.read_at && (
                  <p className="mt-1 text-right text-[10px] text-subtle">Seen</p>
                )}
                <div className="mt-1 flex items-center justify-end gap-2">
                  {message.edited_at && !message.deleted_at && (
                    <span className="text-[10px] text-subtle">Edited</span>
                  )}
                  <MessageOptionsButton
                    label={`Message options${mine ? " for your message" : " for their message"}`}
                    onOpen={() => setActionsFor(message)}
                  />
                </div>
              </li>
            );
          })}
          <li aria-hidden="true" ref={endRef} />
        </ul>

        {typingLabel(typing.typingIds.length) !== "" && (
          <p role="status" className="text-[11px] text-subtle">
            {typingLabel(typing.typingIds.length)}
          </p>
        )}
      </div>

      <MessageActionsSheet
        open={Boolean(actionsFor)}
        onClose={() => setActionsFor(null)}
        kind="room"
        message={
          actionsFor
            ? {
                id: actionsFor.id,
                body: actionsFor.body,
                mine: actionsFor.sender_id === viewerId,
                deleted: Boolean(actionsFor.deleted_at),
              }
            : null
        }
        onChanged={() => void reload({ silent: true })}
      />

      <ReportListingSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        listingId={listingId}
        listingTitle={listingTitle}
        viewerId={viewerId}
        onFiled={(_report, duplicate) => {
          setReportNote(
            duplicate
              ? "You had already reported this room — it is still with our reviewers."
              : "Thanks — an administrator will review this room. The lister is not told who reported it.",
          );
        }}
      />
    </BottomSheet>
  );
}
