import { ListChecks, MessageCircle, Send, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { formatListingRent, type PublicListing } from "@/listings/public-listings";
import { supabase } from "@/lib/supabase";
import type { RoommateConnection } from "@/roommates/connections";
import { sendShortlistToRoommate } from "@/roommates/listing-shares";
import {
  formatRoommateLocation,
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";
import { useRoommateConnections } from "@/roommates/use-roommate-connections";

export type ShareShortlistSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The rooms to send, in the order they appear on the Saved tab. */
  listings: PublicListing[];
  /** The collection that was open, named in the message it posts. */
  collectionName?: string | null;
};

/**
 * "Share shortlist": picks one connected roommate and posts the whole shortlist
 * into that thread as a single message, so comparing rooms happens in chat
 * instead of by screenshot. Sending is not a booking and asks the lister for
 * nothing.
 */
export function ShareShortlistSheet({
  open,
  onClose,
  listings,
  collectionName = null,
}: ShareShortlistSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connections, status, error } = useRoommateConnections();
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const count = listings.length;

  async function handleSend(connection: RoommateConnection) {
    if (!supabase || !user) return;

    setSendError(null);
    setSendingTo(connection.id);
    const result = await sendShortlistToRoommate(supabase, {
      profileId: connection.id,
      studentId: user.id,
      senderId: user.id,
      listingIds: listings.map((listing) => listing.id),
      collectionName,
    });
    setSendingTo(null);

    if (result.error) {
      setSendError(result.error);
      return;
    }

    onClose();
    navigate(`/roommate/${connection.id}?chat=1`);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Share your shortlist"
      footer={
        <p className="text-[11px] leading-relaxed text-subtle">
          One message, not a booking: your roommate sees the same rooms you can,
          and the lister is not contacted.
        </p>
      }
    >
      <p className="text-xs leading-relaxed text-muted">
        Send {count} {count === 1 ? "room" : "rooms"}
        {collectionName ? ` from ${collectionName}` : ""} so you can compare them
        together.
      </p>

      {sendError && (
        <div className="mt-3">
          <InlineAlert>{sendError}</InlineAlert>
        </div>
      )}

      <ul className="mt-3 flex list-none flex-col gap-1.5 rounded-tile border border-line bg-panel-raised p-2.5">
        {listings.map((listing) => (
          <li key={listing.id} className="flex items-center gap-2 text-xs">
            <ListChecks
              className="size-3.5 shrink-0 text-accent-soft"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {listing.title}
            </span>
            <span className="shrink-0 text-[11px] text-subtle">
              {formatListingRent(listing) ?? "Rent not stated"}
            </span>
          </li>
        ))}
      </ul>

      {status === "loading" ? (
        <div className="mt-4">
          <LoadingState label="Loading your roommates" />
        </div>
      ) : status === "error" ? (
        <div className="mt-3">
          <InlineAlert>{error}</InlineAlert>
        </div>
      ) : connections.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-tile border border-line bg-panel-raised p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="size-4 text-accent-soft" aria-hidden="true" />
            No connected roommates yet
          </span>
          <p className="text-xs leading-relaxed text-muted">
            Connect with a roommate first, then you can send your shortlist to
            each other.
          </p>
          <Link
            to="/roommates"
            onClick={onClose}
            className="text-xs font-medium text-accent-soft hover:underline"
          >
            Find a roommate
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-2">
          {connections.map((connection) => (
            <li key={connection.id}>
              <div className="flex items-center gap-3 rounded-tile border border-line bg-panel-raised p-2">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill text-[11px] font-semibold text-white"
                  style={{ backgroundImage: roommateCardGradient(connection.id) }}
                >
                  {connection.avatar_url ? (
                    <img
                      src={connection.avatar_url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    initialsOf(connection.display_name)
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {connection.display_name}
                  </span>
                  <span className="truncate text-[11px] text-subtle">
                    {formatRoommateLocation(connection)}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={count === 0}
                  onClick={() => void handleSend(connection)}
                  loading={sendingTo === connection.id}
                  icon={<Send className="size-4" />}
                >
                  Send
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {connections.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle">
          <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
          Sending opens the chat with the shortlist already attached.
        </p>
      )}
    </BottomSheet>
  );
}
