import { MessageCircle, Send, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { RoommateConnection } from "@/roommates/connections";
import { sendListingToRoommate } from "@/roommates/listing-shares";
import {
  formatRoommateLocation,
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";
import { useRoommateConnections } from "@/roommates/use-roommate-connections";

export type SendToRoommateSheetProps = {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
};

/**
 * "Send to a roommate": picks one connected roommate, posts the property card
 * into that thread, then opens the chat so it can be sent with context.
 *
 * Groups of three or more come later; for now one roommate per send.
 */
export function SendToRoommateSheet({
  open,
  onClose,
  listingId,
  listingTitle,
}: SendToRoommateSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connections, status, error } = useRoommateConnections();
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend(connection: RoommateConnection) {
    if (!supabase || !user) return;

    setSendError(null);
    setSendingTo(connection.id);
    const result = await sendListingToRoommate(supabase, {
      profileId: connection.id,
      studentId: user.id,
      senderId: user.id,
      listingId,
      listingTitle,
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
      title="Send to a roommate"
      footer={
        <p className="text-[11px] leading-relaxed text-subtle">
          The room opens in your chat as a card they can tap. Group sending comes
          later.
        </p>
      }
    >
      <p className="text-xs leading-relaxed text-muted">
        Share {listingTitle} so you can decide together.
      </p>

      {sendError && (
        <div className="mt-3">
          <InlineAlert>{sendError}</InlineAlert>
        </div>
      )}

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
            Connect with a roommate first, then you can send rooms to each other.
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
          Sending opens the chat with the room already attached.
        </p>
      )}
    </BottomSheet>
  );
}
