import { MessageCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ListingChatSheet } from "@/components/listings/listing-chat-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import type { ListingChatThread } from "@/listings/listing-messages";
import { useListingChatThreads } from "@/listings/use-listing-chat-threads";
import { useAuth } from "@/auth/use-auth";
import { initialsOf } from "@/roommates/roommate-profiles";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The provider's side of listing chat: one row per student conversation across
 * their rooms, with unread counts, opening the same sheet the student sees.
 */
export function ProviderChatInbox({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const { threads, status, error, reload } = useListingChatThreads({ enabled });
  const [openThread, setOpenThread] = useState<ListingChatThread | null>(null);

  if (!enabled) return null;

  return (
    <section aria-labelledby="provider-inbox-heading" className="mt-8 flex flex-col gap-4">
      <SectionHeading
        id="provider-inbox-heading"
        eyebrow="Messages"
        title="Students asking about your rooms"
        description="Every conversation about a room you have listed, newest first. Replies appear in the student's chat straight away."
      />

      {status === "loading" && (
        <Panel className="flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </Panel>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3">
          <InlineAlert>{error}</InlineAlert>
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => void reload()}
            icon={<RefreshCw className="size-4" />}
          >
            Try again
          </Button>
        </div>
      )}

      {status === "ready" && threads.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          description="When a student asks about one of your rooms, the conversation appears here."
          note="Only conversations on your own listings are ever shown."
        />
      )}

      {status === "ready" && threads.length > 0 && (
        <ul className="flex list-none flex-col gap-2.5">
          {threads.map((thread) => (
            <li key={`${thread.listing_id}-${thread.student_id}`}>
              <button
                type="button"
                onClick={() => setOpenThread(thread)}
                className="flex w-full items-start gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-pill border border-line bg-accent/10 text-xs font-semibold text-accent-soft"
                >
                  {initialsOf(thread.student_name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {thread.student_name}
                    </span>
                    <span className="shrink-0 text-[10px] text-subtle">
                      {timeFormatter.format(new Date(thread.last_message_at))}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-muted">
                    {thread.listing_title}
                  </span>
                  <span className="truncate text-[11px] text-subtle">
                    {thread.last_body}
                  </span>
                </span>
                {thread.unread_count > 0 && (
                  <Badge tone="accent">{`${thread.unread_count} new`}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {user && openThread && (
        <ListingChatSheet
          open
          onClose={() => setOpenThread(null)}
          listingId={openThread.listing_id}
          listingTitle={openThread.listing_title}
          studentId={openThread.student_id}
          viewerId={user.id}
          peerLabel={openThread.student_name}
        />
      )}
    </section>
  );
}
