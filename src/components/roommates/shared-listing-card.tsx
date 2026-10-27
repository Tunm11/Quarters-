import { ChevronRight, DoorOpen, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  formatListingLocation,
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";

export type SharedListingCardProps = {
  listing: PublicListing;
  /** Only the student who shared the room can ask the lister for a joint visit. */
  canRequestGroupVisit: boolean;
  requested: boolean;
  /** How many people the request carries, including the student who asked. */
  partySize?: number | null;
  onRequestGroupVisit: () => void;
  error?: string | null;
  /** Who the lister sees once the request lands; a group, not just a pair. */
  requestedNote?: string;
};

/**
 * The property card a roommate receives in chat: a small photo, the details
 * that matter, and a link through to the full listing. Underneath it, the
 * sender can ask the lister to host the two of them together.
 */
export function SharedListingCard({
  listing,
  canRequestGroupVisit,
  requested,
  partySize = null,
  onRequestGroupVisit,
  error,
  requestedNote,
}: SharedListingCardProps) {
  const location = formatListingLocation(listing);
  const rent = formatListingRent(listing);
  // A roster visit names everyone going, so the card can say how big the party
  // is instead of leaving every request reading like a pair.
  const note =
    requestedNote ??
    (partySize && partySize > 2
      ? `Group visit requested · ${partySize} people going.`
      : "Group visit requested · the lister can see you both.");

  return (
    <div className="mt-1.5 w-full overflow-hidden rounded-tile border border-line bg-panel">
      <Link
        to={`/property/${listing.id}`}
        className="flex items-center gap-2.5 p-2 transition-colors hover:bg-panel-raised"
      >
        {listing.cover_image_url ? (
          <img
            src={listing.cover_image_url}
            alt=""
            loading="lazy"
            className="size-14 shrink-0 rounded-[0.6rem] object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-[0.6rem] bg-sand-wash text-subtle"
          >
            <DoorOpen className="size-5" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-xs leading-snug font-semibold text-foreground">
            {listing.title}
          </span>
          {location && (
            <span className="truncate text-[10px] text-subtle">{location}</span>
          )}
          {rent && (
            <span className="text-[11px] font-medium text-foreground">{rent}</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
      </Link>

      {(canRequestGroupVisit || requested) && (
        <div className="border-t border-line px-2 py-2">
          {requested ? (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-accent-soft">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              {note}
            </p>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={onRequestGroupVisit}
              icon={<Users className="size-4" />}
            >
              Group visit
            </Button>
          )}
          {error && <p className="mt-1 text-[11px] text-caution">{error}</p>}
        </div>
      )}
    </div>
  );
}
