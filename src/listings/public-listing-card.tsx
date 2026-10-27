import { PropertyCard } from "@/components/ui/property-card";
import {
  accommodationTypeLabels,
  formatListingLocation,
  type PublicListing,
} from "@/listings/public-listings";

/**
 * Card for a published listing.
 *
 * The public read model already guarantees an approved provider (see the
 * listings RLS policy), so `providerApproved` is backed by the query rather
 * than inferred in the UI. Passing the viewer's saved state and a handler turns
 * the bookmark into a real shortlist control; without them it stays disabled.
 */
export function PublicListingCard({
  listing,
  saved = false,
  onToggleSave,
}: {
  listing: PublicListing;
  saved?: boolean;
  onToggleSave?: (listingId: string) => void;
}) {
  return (
    <PropertyCard
      id={listing.id}
      title={listing.title}
      imageUrl={listing.cover_image_url}
      photoUrls={listing.photo_urls}
      location={formatListingLocation(listing)}
      rentAmount={listing.rent_amount}
      rentPeriod={listing.rent_period}
      propertyType={accommodationTypeLabels[listing.accommodation_type]}
      facilities={listing.facilities}
      availability={listing.availability_status}
      providerApproved
      verifiedAt={listing.verified_at}
      inspectedAt={listing.inspected_at}
      bookmarked={saved}
      onBookmark={onToggleSave}
      href={`/property/${listing.id}`}
      className="h-full w-full"
    />
  );
}
