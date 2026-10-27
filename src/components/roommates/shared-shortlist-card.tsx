import { ChevronRight, DoorOpen, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatListingLocation,
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";

export type SharedShortlistCardProps = {
  /** The rooms the sender named that are still published, in the sent order. */
  listings: PublicListing[];
  /**
   * Rooms the message named that no longer resolve. Reported honestly instead of
   * silently shortening the list.
   */
  missing?: number;
};

/**
 * The shortlist a roommate receives in chat: one room per row, each linking
 * through to the full listing. Sending a shortlist is not a booking and asks the
 * lister nothing, so the card stays a reading list.
 */
export function SharedShortlistCard({
  listings,
  missing = 0,
}: SharedShortlistCardProps) {
  return (
    <div className="mt-1.5 w-full overflow-hidden rounded-tile border border-line bg-panel">
      <p className="flex items-center gap-1.5 border-b border-line px-2.5 py-2 text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">
        <ListChecks className="size-3.5 shrink-0 text-accent-soft" aria-hidden="true" />
        Shortlist · {listings.length} {listings.length === 1 ? "room" : "rooms"}
      </p>

      <ul className="flex list-none flex-col">
        {listings.map((listing, index) => {
          const location = formatListingLocation(listing);
          const rent = formatListingRent(listing);
          return (
            <li
              key={listing.id}
              className={index === 0 ? undefined : "border-t border-line"}
            >
              <Link
                to={`/property/${listing.id}`}
                className="flex items-center gap-2.5 p-2 transition-colors hover:bg-panel-raised"
              >
                {listing.cover_image_url ? (
                  <img
                    src={listing.cover_image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-12 shrink-0 rounded-[0.6rem] object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-[0.6rem] bg-sand-wash text-subtle"
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
                    <span className="text-[11px] font-medium text-foreground">
                      {rent}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-subtle"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {missing > 0 && (
        <p className="border-t border-line px-2.5 py-2 text-[10px] leading-relaxed text-subtle">
          {missing} {missing === 1 ? "room" : "rooms"} in this shortlist{" "}
          {missing === 1 ? "is" : "are"} no longer published.
        </p>
      )}
    </div>
  );
}
