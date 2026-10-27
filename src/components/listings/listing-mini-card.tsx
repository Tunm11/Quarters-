import { ChevronRight, DoorOpen } from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatListingLocation,
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";
import { cn } from "@/lib/cn";

export type ListingMiniCardProps = {
  listing: PublicListing;
  className?: string;
};

/**
 * The compact property card a chat message can carry: the photo, the title, the
 * area and the rent, linking through to the full listing. Shared by group chat
 * and any other thread that needs just the card, without the visit action.
 */
export function ListingMiniCard({ listing, className }: ListingMiniCardProps) {
  const location = formatListingLocation(listing);
  const rent = formatListingRent(listing);

  return (
    <Link
      to={`/property/${listing.id}`}
      className={cn(
        "mt-2 flex w-full items-center gap-2.5 overflow-hidden rounded-tile border border-line bg-panel p-2 transition-colors hover:bg-panel-raised",
        className,
      )}
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
  );
}
