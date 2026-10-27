import {
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ImageOff,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FacilityIconChip } from "@/components/ui/facility-icon";
import { IconButton } from "@/components/ui/icon-button";
import { Photo } from "@/components/ui/photo";
import { listingTrustBadges } from "@/listings/listing-trust";
import { cn } from "@/lib/cn";
import type { Database } from "@/lib/database.types";

/** Mirrors public.listings.availability_status. */
export type PropertyAvailability = Database["public"]["Enums"]["availability_status"];

/** Mirrors public.listings.rent_period. */
export type PropertyRentPeriod = Database["public"]["Enums"]["rent_period"];

export type PropertyCardProps = {
  id: string;
  title: string;
  /** Main photograph. When absent, an honest placeholder is shown — never a fake photo. */
  imageUrl?: string | null;
  /**
   * Every photo for the listing, cover first. With more than one the card
   * becomes a small catalogue: arrows and a counter browse in place without
   * leaving the list.
   */
  photoUrls?: string[] | null;
  location?: string | null;
  rentAmount?: number | null;
  /** Payment period from the schema. Rendered only when provided. */
  rentPeriod?: PropertyRentPeriod | null;
  propertyType?: string | null;
  /** Selected facilities; omitted entirely when empty. */
  facilities?: string[] | null;
  /** Omitted entirely when unknown — availability is never guessed. */
  availability?: PropertyAvailability | null;
  /**
   * Provider approval (authorisation to publish). Rendered only when backed by
   * real data. This is NOT identity verification or property inspection.
   */
  providerApproved?: boolean | null;
  /**
   * Moderator-stamped checks on this listing (not on its provider). Rendered
   * only when the database holds them; a room nobody checked carries neither.
   */
  verifiedAt?: string | null;
  inspectedAt?: string | null;
  /** Local toggle state for the bookmark control. */
  bookmarked?: boolean;
  /**
   * Persist/bookmark handler. When absent the control is visibly disabled so
   * it never implies saved state that does not exist.
   */
  onBookmark?: (id: string) => void;
  /** Future details route. When absent the card is not interactive. */
  href?: string;
  className?: string;
};

const rentFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const periodLabels: Record<PropertyRentPeriod, string> = {
  week: "/week",
  month: "/month",
  quarter: "/quarter",
  term: "/session",
  year: "/year",
};

const availabilityLabels: Record<PropertyAvailability, { label: string; className: string }> = {
  available: { label: "Available now", className: "text-positive" },
  limited: { label: "Limited spots", className: "text-caution" },
  unavailable: { label: "Currently unavailable", className: "text-muted" },
};

/**
 * Photography-led accommodation card, prepared for the listings phase.
 *
 * Every optional field degrades honestly: no image shows a neutral placeholder,
 * missing rent/location/facilities render nothing rather than placeholder
 * values, and verification/availability appear only when real data provides
 * them. The bookmark control sits outside the card's navigation target so it
 * can never trigger a details link.
 */
export function PropertyCard({
  id,
  title,
  imageUrl,
  photoUrls,
  location,
  rentAmount,
  rentPeriod,
  propertyType,
  facilities,
  availability,
  providerApproved,
  verifiedAt = null,
  inspectedAt = null,
  bookmarked = false,
  onBookmark,
  href,
  className,
}: PropertyCardProps) {
  const titleId = `property-${id}-title`;
  const visibleFacilities = (facilities ?? []).filter(Boolean).slice(0, 4);
  const extraFacilities = (facilities ?? []).length - visibleFacilities.length;
  const availabilityStyle = availability ? availabilityLabels[availability] : null;
  const trustBadges = listingTrustBadges({ verifiedAt, inspectedAt });

  const photos = (photoUrls ?? []).filter(Boolean);
  const [photoIndex, setPhotoIndex] = useState(0);
  const activeIndex = photos.length > 0 ? Math.min(photoIndex, photos.length - 1) : 0;
  const currentPhoto = photos[activeIndex] ?? imageUrl ?? null;

  const media = currentPhoto ? (
    // Off-screen cards stay idle until they are nearly visible, which keeps a
    // page full of full-resolution photographs from blocking the first paint.
    <Photo
      key={currentPhoto}
      src={currentPhoto}
      className="size-full object-cover"
    />
  ) : (
    <div className="flex size-full items-center justify-center bg-sand-wash">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-pill border border-line bg-panel/70 text-subtle"
      >
        <ImageOff className="size-5" />
      </span>
    </div>
  );

  return (
    <article className={cn("relative overflow-hidden rounded-card border border-line bg-panel", className)}>
      <div className="relative aspect-[4/3] overflow-hidden bg-panel-raised">
        {media}

        {photos.length > 1 && (
          <>
            <div className="pointer-events-none absolute inset-x-1.5 inset-y-0 z-20 flex items-center justify-between">
              <button
                type="button"
                aria-label={`Previous photo of ${title}`}
                onClick={() =>
                  setPhotoIndex((current) =>
                    current === 0 ? photos.length - 1 : current - 1,
                  )
                }
                className="pointer-events-auto grid size-8 place-items-center rounded-pill bg-[#1f2110]/55 text-[#f6f3e8] backdrop-blur-sm"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Next photo of ${title}`}
                onClick={() =>
                  setPhotoIndex((current) => (current + 1) % photos.length)
                }
                className="pointer-events-auto grid size-8 place-items-center rounded-pill bg-[#1f2110]/55 text-[#f6f3e8] backdrop-blur-sm"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
            <span className="absolute right-2.5 bottom-3 z-20 rounded-pill bg-[#1f2110]/70 px-2 py-0.5 text-[10px] font-medium text-[#f6f3e8] backdrop-blur-sm">
              {activeIndex + 1}/{photos.length}
            </span>
          </>
        )}

        {availabilityStyle && (
          <span
            className={cn(
              "absolute bottom-3 left-3 inline-flex items-center rounded-pill border border-line bg-canvas/90 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm",
              availabilityStyle.className,
            )}
          >
            {availabilityStyle.label}
          </span>
        )}
      </div>

      {/* The bookmark stays a sibling of every link, so it can never navigate. */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <IconButton
          label={
            onBookmark
              ? bookmarked
                ? `Remove ${title} from saved`
                : `Save ${title}`
              : `Saving ${title} is not available yet`
          }
          aria-pressed={onBookmark ? bookmarked : undefined}
          disabled={!onBookmark}
          onClick={() => onBookmark?.(id)}
          className={cn(
            "size-11 border border-line bg-canvas/85 backdrop-blur-sm",
            // `!` because cn does not merge classes and the base text-muted
            // rule is emitted after text-accent-soft in the stylesheet.
            bookmarked && "text-accent-soft!",
          )}
        >
          <Bookmark className={cn("size-5", bookmarked && "fill-current")} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-col gap-1">
          <h3
            id={titleId}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {href ? (
              // The stretched link makes the whole card the navigation target
              // while keeping a real heading for assistive technology.
              <Link
                to={href}
                className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent-soft"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>

          {location && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{location}</span>
            </p>
          )}
        </div>

        {(rentAmount != null || propertyType) && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {rentAmount != null ? (
              <p className="text-lg font-semibold text-foreground">
                {rentFormatter.format(rentAmount)}
                {rentPeriod && (
                  <span className="text-xs font-normal text-muted">
                    {" "}
                    {periodLabels[rentPeriod]}
                  </span>
                )}
              </p>
            ) : (
              <span />
            )}
            {propertyType && <Badge tone="outline">{propertyType}</Badge>}
          </div>
        )}

        {visibleFacilities.length > 0 && (
          <ul
            aria-label="Amenities"
            className="flex flex-wrap items-center gap-1.5"
          >
            {visibleFacilities.map((facility) => (
              <li key={facility}>
                <FacilityIconChip facility={facility} />
              </li>
            ))}
            {extraFacilities > 0 && (
              <li>
                <span className="text-[11px] font-medium text-subtle">
                  +{extraFacilities}
                </span>
              </li>
            )}
          </ul>
        )}

        {trustBadges.length > 0 && (
          <ul aria-label="Listing checks" className="flex flex-wrap items-center gap-1.5">
            {trustBadges.map((badge) => (
              <li key={badge.key}>
                <Badge tone="positive">
                  {badge.key === "inspected" ? (
                    <ClipboardCheck className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                  )}
                  {badge.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {providerApproved === true && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-soft">
            <BadgeCheck className="size-4" aria-hidden="true" />
            Approved provider
          </p>
        )}
      </div>
    </article>
  );
}
