import { MoreVertical, Search, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ManageGroupSheet } from "@/components/chat/manage-group-sheet";
import {
  MessageActionsSheet,
  MessageOptionsButton,
} from "@/components/chat/message-actions-sheet";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ChatThreadSkeleton } from "@/components/feedback/skeletons";
import { SharedListingCard } from "@/components/roommates/shared-listing-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { IconButton } from "@/components/ui/icon-button";
import {
  GROUP_MESSAGE_MAX_LENGTH,
  readReceiptLabel,
  readersForMessage,
  type ChatGroupMessage,
} from "@/chat/groups";
import {
  MessageSearchBar,
  filterMessagesByQuery,
} from "@/components/chat/message-search";
import { typingLabel, useTypingIndicator } from "@/chat/typing";
import { useGroupVisits } from "@/chat/use-group-visits";
import { useChatAttachments } from "@/chat/use-chat-attachments";
import { useGroupChat } from "@/chat/use-group-chat";
import { cn } from "@/lib/cn";
import {
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";

export type GroupChatSheetProps = {
  open: boolean;
  onClose: () => void;
  group: {
    groupId: string;
    name: string;
    memberNames?: string;
    createdBy: string;
    avatarPath: string | null;
  } | null;
  viewerId: string;
  /** Signed URL for the group picture, when it has one. */
  avatarUrl?: string | null;
  /** Name, picture or membership changed. */
  onGroupChanged?: () => void;
  /** The viewer left the group. */
  onLeft?: () => void;
};

/** The body a photo-only message is stored with; the bubble hides it. */
const PHOTO_ONLY_BODY = "Sent a photo.";

/**
 * One group conversation: every member's messages, newest at the bottom, with
 * the sender named above each bubble. Opening it clears the group's unread
 * badge for this member only. Bubbles can carry a photo, a property card, or
 * both alongside text.
 */
export function GroupChatSheet({
  open,
  onClose,
  group,
  viewerId,
  avatarUrl = null,
  onGroupChanged,
  onLeft,
}: GroupChatSheetProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ChatGroupMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typing = useTypingIndicator({
    kind: "group",
    conversationId: group?.groupId ?? "",
    viewerId,
    enabled: open && Boolean(group),
  });
  const {
    messages,
    readers = [],
    loading,
    error,
    sending,
    send,
    reload,
  } = useGroupChat({
    enabled: open && Boolean(group),
    groupId: group?.groupId ?? "",
    viewerId,
  });
  const { listings, imageUrls } = useChatAttachments(messages);
  const sharedListingIds = [
    ...new Set(
      messages
        .map((message) => message.shared_listing_id)
        .filter((listingId): listingId is string => Boolean(listingId)),
    ),
  ];
  const visits = useGroupVisits({
    enabled: open && Boolean(group),
    groupId: group?.groupId ?? "",
    listingIds: sharedListingIds,
    viewerId,
  });
  const visibleMessages = filterMessagesByQuery(messages, searchOpen ? query : "");
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false);
      setSearchOpen(false);
      setQuery("");
      return;
    }
    const anchor = endRef.current;
    if (typeof anchor?.scrollIntoView === "function") {
      anchor.scrollIntoView({ block: "end" });
    }
  }, [open, messages.length]);

  return (
    <BottomSheet
      open={open}
      /* While settings or message actions are open they sit on top, so Escape
         closes only the sheet in front. */
      onClose={() => {
        if (!settingsOpen && !actionsFor) onClose();
      }}
      title={group?.name ?? "Group"}
      size="tall"
      action={
        group ? (
          <>
            <IconButton
              label="Search this group"
              variant="outline"
              aria-pressed={searchOpen}
              onClick={() => {
                setSearchOpen((current) => !current);
                setQuery("");
              }}
            >
              <Search className="size-4" />
            </IconButton>
            <IconButton
              label="Group settings"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
            >
              <MoreVertical className="size-4" />
            </IconButton>
          </>
        ) : undefined
      }
      footer={
        <ChatComposer
          inputId="group-chat-message"
          placeholder="Message the group…"
          maxLength={GROUP_MESSAGE_MAX_LENGTH}
          sending={sending}
          mediaKind="group"
          conversationId={group?.groupId ?? ""}
          onSend={send}
          onTyping={typing.notifyTyping}
          onTypingStop={typing.stopTyping}
        />
      }
    >
      <div className="flex min-h-40 flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-pill border border-line bg-accent/10 text-accent-soft">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <UsersRound className="size-4" aria-hidden="true" />
            )}
          </span>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-relaxed text-subtle">
            <span className="min-w-0 break-words">
              {group?.memberNames || "Group conversation"}
            </span>
          </p>
        </div>
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
            label="Search group messages"
          />
        )}

        {error && <InlineAlert>{error}</InlineAlert>}
        {visits.error && <InlineAlert>{visits.error}</InlineAlert>}

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
            No messages yet. Say hello, share a room, or send a photo to get
            started.
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
                  "flex items-end gap-2",
                  mine ? "flex-row-reverse" : "flex-row",
                )}
              >
                {/* Your own messages are labelled "You"; everyone else gets
                    their initials, so a busy group stays readable. */}
                {!mine && (
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-pill text-[10px] font-semibold text-white"
                    style={{
                      backgroundImage: roommateCardGradient(message.sender_id),
                    }}
                  >
                    {initialsOf(message.sender_name)}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-tile border px-3 py-2 text-sm leading-relaxed",
                    mine
                      ? "border-accent/30 bg-accent/12 text-foreground"
                      : "border-line bg-panel-raised text-foreground",
                  )}
                >
                  <p
                    className={cn(
                      "mb-0.5 text-[10px] font-medium text-accent-soft",
                      mine && "text-right",
                    )}
                  >
                    {mine ? "You" : message.sender_name}
                  </p>
                  {message.deleted_at ? (
                    <p className="text-[13px] italic leading-relaxed text-subtle">
                      This message was deleted
                    </p>
                  ) : (
                    <>
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt={`Photo from ${message.sender_name}`}
                          loading="lazy"
                          className="mb-1.5 max-h-56 w-full rounded-[0.6rem] object-cover"
                        />
                      )}
                      {body && (
                        <p className="whitespace-pre-line break-words">{body}</p>
                      )}
                      {sharedListing && (
                        <SharedListingCard
                          listing={sharedListing}
                          canRequestGroupVisit
                          requested={visits.requested.has(sharedListing.id)}
                          onRequestGroupVisit={() =>
                            void visits.request(sharedListing.id)
                          }
                          requestedNote="Group visit requested · the lister can see the whole group."
                        />
                      )}
                    </>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {message.edited_at && !message.deleted_at && (
                      <span className="text-[10px] text-subtle">Edited</span>
                    )}
                    <MessageOptionsButton
                      label={`Message options${mine ? " for your message" : ` for ${message.sender_name}'s message`}`}
                      onOpen={() => setActionsFor(message)}
                    />
                  </div>
                  {mine && !message.deleted_at && (
                    <p className="mt-0.5 text-right text-[10px] text-subtle">
                      {readReceiptLabel(
                        readersForMessage(readers, message).map(
                          (reader) => reader.display_name,
                        ),
                      )}
                    </p>
                  )}
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
        kind="group"
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

      {group && (
        <ManageGroupSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          group={{
            groupId: group.groupId,
            name: group.name,
            createdBy: group.createdBy,
            avatarPath: group.avatarPath,
          }}
          avatarUrl={avatarUrl}
          viewerId={viewerId}
          onChanged={() => onGroupChanged?.()}
          onLeft={() => {
            setSettingsOpen(false);
            onLeft?.();
          }}
        />
      )}
    </BottomSheet>
  );
}
