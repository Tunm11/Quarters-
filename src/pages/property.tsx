import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  GraduationCap,
  Heart,
  ImageOff,
  Info,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { PropertyDetailSkeleton } from "@/components/feedback/skeletons";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { FacilityIconChip } from "@/components/ui/facility-icon";
import { iconButtonClasses } from "@/components/ui/icon-button";
import { Photo } from "@/components/ui/photo";
import {
  formatRentAmount,
  formatRentTerm,
  formatRentTermShort,
  type PublicListingDetail,
} from "@/listings/listing-detail";
import {
  LISTING_TRUST_DISCLAIMER,
  listingTrustChecks,
} from "@/listings/listing-trust";
import { accommodationTypeLabels, formatListingLocation } from "@/listings/public-listings";
import { useListingDetail } from "@/listings/use-listing-detail";
import {
  BookTogetherSheet,
  type BookTogetherListing,
} from "@/components/listings/book-together-sheet";
import { AvailabilitySection } from "@/components/listings/availability-section";
import { ListingChatSheet } from "@/components/listings/listing-chat-sheet";
import { MoveInCostsCard } from "@/components/listings/move-in-costs-card";
import { ReportListing } from "@/components/listings/report-listing";
import { ReviewsSection } from "@/components/listings/reviews-section";
import { SendToRoommateSheet } from "@/components/listings/send-to-roommate-sheet";
import {
  formatShare,
  loadBookingGroup,
  loadMyBookingGroup,
} from "@/listings/booking-group";
import {
  loadMyRoomReservation,
  type RoomReservation,
} from "@/listings/room-bookings";
import { useRoommateConnections } from "@/roommates/use-roommate-connections";
import {
  CANCELLATION_CUTOFF_HOURS,
  VISIT_TIMES,
  buildVisitDays,
  cancelViewingRequest,
  formatVisitSlot,
  hoursUntilVisit,
  loadOpenViewingRequest,
  requestViewing,
  scheduledForFromSlot,
  visitCancellationBlock,
  validateVisitSelection,
  type ViewingRequestSummary,
} from "@/listings/viewing-requests";
import { useSavedListingIds } from "@/listings/use-saved-listings";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Availability = Database["public"]["Enums"]["availability_status"];
type Furnishing = Database["public"]["Enums"]["furnishing_status"];

const availabilityMeta: Record<
  Availability,
  { label: string; tone: BadgeTone }
> = {
  available: { label: "Available now", tone: "positive" },
  limited: { label: "Limited spots", tone: "caution" },
  unavailable: { label: "Currently unavailable", tone: "neutral" },
};

const furnishingLabels: Record<Furnishing, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

const monthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
});

const checkDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The day a moderator checked a listing; "not recorded" if it cannot be read. */
function formatCheckDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date not recorded";
  return checkDateFormatter.format(date);
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function Dash() {
  return <span className="text-subtle">Not stated</span>;
}

function StatCell({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
      <Icon className="size-4 text-accent-soft" aria-hidden="true" />
      <span className="text-[11px] leading-tight font-medium break-words text-foreground">
        {value ?? "—"}
      </span>
      <span className="text-[10px] leading-tight text-subtle">{label}</span>
    </li>
  );
}

function SectionCard({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel",
        className,
      )}
    >
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const { listing, status, error, reload } = useListingDetail(id ?? "");

  if (status === "loading") {
    return (
      <>
        <p role="status" className="sr-only">
          Loading this room
        </p>
        <PropertyDetailSkeleton />
      </>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-8 sm:px-6">
        <ErrorState
          title="This room could not be loaded"
          description={error ?? "Please try again in a moment."}
          action={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void reload()}
                icon={<RefreshCw className="size-4" />}
              >
                Try again
              </Button>
              <Link
                to="/explore"
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                Back to Explore
              </Link>
            </>
          }
        />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-8 sm:px-6">
        <ErrorState
          title="This room is not available"
          description="It may have been unpublished, archived or hidden. Only published rooms from approved providers are visible."
          action={
            <Link to="/explore" className={buttonClasses({ size: "sm" })}>
              Browse published rooms
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  return <PropertyDetail listing={listing} />;
}

function PropertyDetail({ listing }: { listing: PublicListingDetail }) {
  const { status: authStatus, user } = useAuth();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { idSet: savedIds, toggle: toggleSaved } = useSavedListingIds({
    userId: user?.id ?? null,
  });
  const saved = savedIds.has(listing.id);

  const photos = listing.photos;
  const photo = photos[photoIndex] ?? null;
  const location = formatListingLocation(listing);
  const availability = availabilityMeta[listing.availability_status];
  const rentTerm = formatRentTerm(listing.rent_period, listing.rent_session_months);
  const termShort = formatRentTermShort(
    listing.rent_period,
    listing.rent_session_months,
  );
  const description = listing.description ?? "";

  async function handleShare() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: listing.title, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage("Link copied to your clipboard.");
        return;
      }
      setShareMessage("Copy this page's address from your browser.");
    } catch {
      setShareMessage("Could not share this room.");
    }
  }

  function scrollToSchedule() {
    const target = document.getElementById("schedule-visit");
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /** Opening the chat needs an account: the provider has to be able to reply. */
  function openChat() {
    if (authStatus !== "signedIn" || !user) {
      navigate(`/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`);
      return;
    }
    setChatOpen(true);
  }

  function requireAccount() {
    navigate(`/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-6">
      {/* Gallery + identity sheet */}
      <div className="relative">
        <div className="relative aspect-[4/3] overflow-hidden bg-panel-raised sm:mt-4 sm:rounded-sheet">
          {photo?.url ? (
            <Photo
              key={photo.url}
              src={photo.url}
              alt={photo.alt ?? listing.title}
              eager
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center bg-sand-wash text-subtle">
              <span className="flex flex-col items-center gap-2">
                <ImageOff className="size-7" aria-hidden="true" />
                <span className="text-[11px]">No photo supplied</span>
              </span>
            </div>
          )}

          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3">
            <Link
              to="/explore"
              aria-label="Back to Explore"
              className={iconButtonClasses({
                variant: "outline",
                className:
                  "border-transparent bg-panel/90 text-foreground shadow-panel backdrop-blur-sm",
              })}
            >
              <ArrowLeft className="size-5" />
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Send this room to a roommate"
                title="Send to a roommate"
                onClick={() => {
                  if (authStatus !== "signedIn" || !user) {
                    navigate(
                      `/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`,
                    );
                    return;
                  }
                  setSendOpen(true);
                }}
                className={iconButtonClasses({
                  variant: "outline",
                  className:
                    "border-transparent bg-panel/90 text-foreground shadow-panel backdrop-blur-sm",
                })}
              >
                <Send className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Share this room"
                onClick={() => void handleShare()}
                className={iconButtonClasses({
                  variant: "outline",
                  className:
                    "border-transparent bg-panel/90 text-foreground shadow-panel backdrop-blur-sm",
                })}
              >
                <Share2 className="size-5" />
              </button>
              <button
                type="button"
                aria-label={saved ? "Remove this room from saved" : "Save this room"}
                aria-pressed={saved}
                onClick={() => {
                  if (authStatus !== "signedIn" || !user) {
                    navigate(
                      `/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`,
                    );
                    return;
                  }
                  void toggleSaved(listing.id);
                }}
                className={iconButtonClasses({
                  variant: "outline",
                  className: cn(
                    "border-transparent bg-panel/90 text-foreground shadow-panel backdrop-blur-sm",
                    saved && "text-accent-soft!",
                  ),
                })}
              >
                <Heart className={cn("size-5", saved && "fill-current")} />
              </button>
            </div>
          </div>

          {photos.length > 1 && (
            <>
              <div className="pointer-events-none absolute inset-y-0 inset-x-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() =>
                    setPhotoIndex((current) =>
                      current === 0 ? photos.length - 1 : current - 1,
                    )
                  }
                  className="pointer-events-auto grid size-9 place-items-center rounded-pill border border-transparent bg-[#1f2110]/55 text-[#f6f3e8] backdrop-blur-sm"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() =>
                    setPhotoIndex((current) => (current + 1) % photos.length)
                  }
                  className="pointer-events-auto grid size-9 place-items-center rounded-pill border border-transparent bg-[#1f2110]/55 text-[#f6f3e8] backdrop-blur-sm"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
              <span className="absolute right-3 bottom-9 rounded-pill bg-[#1f2110]/70 px-2.5 py-1 text-[11px] font-medium text-[#f6f3e8] backdrop-blur-sm">
                {photoIndex + 1}/{photos.length}
              </span>
            </>
          )}
        </div>

        <div className="relative -mt-6 rounded-t-sheet bg-panel px-4 pt-5 pb-4 sm:mx-3 sm:rounded-sheet sm:border sm:border-line sm:shadow-panel">
          {photos.length > 1 && (
            <div
              role="group"
              aria-label="Room photo catalogue"
              className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {photos.map((entry, index) => (
                <button
                  key={entry.path}
                  type="button"
                  aria-label={`Show photo ${index + 1} of ${photos.length}`}
                  aria-pressed={index === photoIndex}
                  onClick={() => setPhotoIndex(index)}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-tile border transition-opacity",
                    index === photoIndex
                      ? "border-accent"
                      : "border-line opacity-75 hover:opacity-100",
                  )}
                >
                  {entry.url ? (
                    <Photo
                      src={entry.url}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center bg-panel-raised text-subtle">
                      <ImageOff className="size-4" aria-hidden="true" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1
                id="property-heading"
                className="text-xl leading-snug font-semibold tracking-tight text-balance text-foreground"
              >
                {listing.title}
              </h1>
              {location && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{location}</span>
                </p>
              )}
              {listing.institution && (
                <p className="flex items-center gap-1.5 text-xs text-subtle">
                  <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    Near {listing.institution}
                  </span>
                </p>
              )}
            </div>
            <Badge tone={availability.tone} className="shrink-0">
              {availability.label}
            </Badge>
          </div>

          <ul className="mt-4 grid grid-cols-4 gap-1 rounded-tile border border-line bg-panel-raised py-3">
            <StatCell
              icon={BedDouble}
              label="Bedrooms"
              value={listing.bedrooms != null ? String(listing.bedrooms) : null}
            />
            <StatCell
              icon={Bath}
              label="Bathrooms"
              value={listing.bathrooms != null ? String(listing.bathrooms) : null}
            />
            <StatCell
              icon={DoorOpen}
              label="Rooms"
              value={listing.total_rooms != null ? String(listing.total_rooms) : null}
            />
            <StatCell icon={CalendarDays} label="Term" value={termShort} />
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 px-4 sm:px-3">
        {/* Price + primary action */}
        <div className="flex items-end justify-between gap-3 rounded-card border border-line bg-panel p-4 shadow-panel">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.16em] text-subtle uppercase">
              Price
            </p>
            {listing.rent_amount != null ? (
              <p className="mt-0.5 text-xl font-semibold text-foreground">
                {formatRentAmount(listing.rent_amount)}
                {rentTerm && (
                  <span className="text-xs font-normal text-muted"> / {rentTerm}</span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted">Rent not stated</p>
            )}
            {listing.rent_session_months != null && (
              <p className="mt-0.5 text-[11px] text-subtle">
                Covers {listing.rent_session_months} month
                {listing.rent_session_months === 1 ? "" : "s"} of the rent session.
              </p>
            )}
          </div>
          <Button
            className="shrink-0"
            onClick={scrollToSchedule}
            icon={<CalendarDays className="size-4" />}
          >
            Book a Visit
          </Button>
        </div>

        {shareMessage && (
          <p role="status" className="text-xs text-muted">
            {shareMessage}
          </p>
        )}

        {/* What was actually checked, separately from provider approval. */}
        <SectionCard id="checks-heading" title="What QUARTERS checked">
          <ul className="flex flex-col gap-3">
            {listingTrustChecks({
              // A provider row is only readable here while it is approved, so
              // its presence is the approval signal.
              providerApproved: Boolean(listing.provider),
              verifiedAt: listing.verified_at,
              inspectedAt: listing.inspected_at,
            }).map((check) => (
              <li key={check.key} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border",
                    check.inForce
                      ? "border-positive/30 bg-positive/10 text-positive"
                      : "border-line bg-panel-raised text-subtle",
                  )}
                >
                  {check.inForce ? (
                    <BadgeCheck className="size-3" />
                  ) : (
                    <Info className="size-3" />
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-xs font-medium text-foreground">{check.label}</p>
                  <p className="text-[11px] leading-relaxed text-muted">
                    {check.detail}
                  </p>
                  <p className="text-[11px] text-subtle">
                    {check.inForce
                      ? check.checkedAt
                        ? `Checked ${formatCheckDate(check.checkedAt)}`
                        : "On record"
                      : check.key === "provider"
                        ? "Not approved"
                        : "Not checked yet"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-subtle">
            {LISTING_TRUST_DISCLAIMER}
          </p>
        </SectionCard>

        {/* The rent headline is not the whole bill. */}
        <MoveInCostsCard listing={listing} onAskProvider={openChat} />

        {/* About */}
        {description && (
          <SectionCard id="about-heading" title="About this property">
            <p
              className={cn(
                "text-sm leading-relaxed whitespace-pre-line text-muted",
                !expanded && "line-clamp-3",
              )}
            >
              {description}
            </p>
            {description.length > 180 && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex w-fit items-center gap-1 rounded-pill border border-line bg-panel-raised px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
              >
                {expanded ? "Read less" : "Read more"}
                <ChevronRight
                  className={cn("size-3.5 transition-transform", expanded && "-rotate-90")}
                  aria-hidden="true"
                />
              </button>
            )}
          </SectionCard>
        )}

        {/* At a glance */}
        <SectionCard id="facts-heading" title="At a glance">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Room type</dt>
              <dd className="font-medium text-foreground">
                {accommodationTypeLabels[listing.accommodation_type]}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Furnishing</dt>
              <dd className="font-medium text-foreground">
                {listing.furnishing_status ? (
                  furnishingLabels[listing.furnishing_status]
                ) : (
                  <Dash />
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Rooms available</dt>
              <dd className="font-medium text-foreground">
                {listing.total_rooms != null ? listing.total_rooms : <Dash />}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Rent session</dt>
              <dd className="font-medium text-foreground">
                {rentTerm ?? <Dash />}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Availability</dt>
              <dd className="font-medium text-foreground">{availability.label}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-subtle">Nearest campus</dt>
              <dd className="font-medium text-foreground">
                {listing.institution ?? <Dash />}
              </dd>
            </div>
          </dl>
        </SectionCard>

        {/* Month-by-month availability, from the dates the provider stated */}
        <AvailabilitySection
          listingId={listing.id}
          availableFrom={listing.available_from}
          availabilityStatus={listing.availability_status}
          totalRooms={listing.total_rooms}
        />

        {/* Amenities */}
        {listing.facilities.length > 0 && (
          <SectionCard id="amenities-heading" title="Amenities">
            <ul className="grid grid-cols-2 gap-2">
              {listing.facilities.map((facility) => (
                <li
                  key={facility}
                  className="flex min-w-0 items-center gap-2 rounded-tile border border-line bg-panel-raised px-2.5 py-2"
                >
                  <FacilityIconChip facility={facility} className="size-7" />
                  <span className="min-w-0 truncate text-xs text-foreground">
                    {facility}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* House rules */}
        {listing.property_rules.length > 0 && (
          <SectionCard id="rules-heading" title="House rules">
            <ul className="flex flex-col gap-2">
              {listing.property_rules.map((rule) => (
                <li key={rule} className="flex items-start gap-2 text-xs text-muted">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
                  >
                    <BadgeCheck className="size-3" />
                  </span>
                  <span className="min-w-0">{rule}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* Owner / agent */}
        <SectionCard id="provider-heading" title="Listed by">
          {listing.provider ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-pill bg-accent text-sm font-semibold text-accent-ink"
                >
                  {initialsOf(listing.provider.display_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {listing.provider.display_name}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted">
                    <BadgeCheck className="size-3.5 text-accent-soft" aria-hidden="true" />
                    {listing.provider.kind === "landlord" ? "Landlord" : "Agent"} ·
                    approved provider
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-subtle">
                Listing on QUARTERS since{" "}
                {monthYearFormatter.format(new Date(listing.provider.created_at))}.
                Approval covers the account, not this particular room — the checks
                on the room itself are listed under "What QUARTERS checked". Phone
                numbers and emails are not published; message them here or book a
                visit.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                icon={<MessageCircle className="size-4" />}
                onClick={openChat}
              >
                Message {listing.provider.kind === "landlord" ? "landlord" : "agent"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">
              Provider details are not available for this room.
            </p>
          )}
        </SectionCard>

        <ReviewsSection
          listingId={listing.id}
          listingTitle={listing.title}
          viewerId={user?.id ?? null}
          onRequireAuth={requireAccount}
        />

        <VisitScheduler listing={listing} />

        <ReportListing
          listingId={listing.id}
          listingTitle={listing.title}
          viewerId={user?.id ?? null}
          onRequireAuth={requireAccount}
        />
      </div>

      {user && listing.provider && (
        <ListingChatSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          listingId={listing.id}
          listingTitle={listing.title}
          studentId={user.id}
          viewerId={user.id}
          peerLabel={listing.provider.display_name}
        />
      )}

      {user && (
        <SendToRoommateSheet
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          listingId={listing.id}
          listingTitle={listing.title}
        />
      )}
    </div>
  );
}

function VisitScheduler({ listing }: { listing: PublicListingDetail }) {
  const { status: authStatus, user } = useAuth();
  const listingId = listing.id;
  const totalRooms = listing.total_rooms;
  const { connections } = useRoommateConnections();
  const navigate = useNavigate();
  const location = useLocation();

  const days = useMemo(() => buildVisitDays(), []);
  const [dayIso, setDayIso] = useState<string | null>(days[0]?.iso ?? null);
  const [time, setTime] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<ViewingRequestSummary | null>(null);
  const [cancelWarning, setCancelWarning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);
  const [bookTogetherOpen, setBookTogetherOpen] = useState(false);
  const [bookingSummary, setBookingSummary] = useState<{
    roomNumber: number;
    paidCount: number;
    headcount: number;
    collected: number;
    totalAmount: number;
    status: string;
    reservationStatus: RoomReservation["status"] | null;
  } | null>(null);
  const [roomReservation, setRoomReservation] = useState<RoomReservation | null>(
    null,
  );
  const [bookingReloadKey, setBookingReloadKey] = useState(0);
  const cancellationBlock = openRequest
    ? visitCancellationBlock(openRequest.scheduled_for)
    : null;
  const confirmedVisit = openRequest?.status === "confirmed";
  // A completed viewing, or a confirmed slot whose time has passed, turns the
  // schedule card into the booking card.
  const visitDone =
    openRequest?.status === "completed" ||
    (openRequest?.status === "confirmed" &&
      hoursUntilVisit(openRequest.scheduled_for) <= 0);

  const signedIn = authStatus === "signedIn" && Boolean(user);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    let active = true;
    void loadOpenViewingRequest(supabase, listingId).then((result) => {
      if (active && result.request) setOpenRequest(result.request);
    });
    return () => {
      active = false;
    };
  }, [signedIn, listingId]);

  // A group booking is the group's, so show its progress here too: a roommate
  // should see what they owe and who has paid without opening the sheet.
  // Members who joined someone else's group may never have requested their own
  // visit, so this loads for any signed-in student, not only a confirmed one.
  useEffect(() => {
    if (!signedIn || !supabase) {
      setBookingSummary(null);
      setRoomReservation(null);
      return;
    }

    let active = true;

    void (async () => {
      const [existing, hold] = await Promise.all([
        loadMyBookingGroup(supabase, listingId),
        loadMyRoomReservation(supabase, listingId),
      ]);
      if (!active) return;

      setRoomReservation(hold.reservation);
      if (existing.error || !existing.groupId) {
        setBookingSummary(null);
        return;
      }

      const detail = await loadBookingGroup(supabase, existing.groupId);
      if (!active || detail.error || !detail.info) {
        setBookingSummary(null);
        return;
      }

      const joined = detail.participants.filter(
        (person) => person.status === "joined",
      );
      const paid = joined.filter((person) => person.paid_at);

      setBookingSummary({
        roomNumber: detail.info.room_number,
        paidCount: paid.length,
        headcount: joined.length,
        collected: paid.reduce((sum, person) => sum + person.share_amount, 0),
        totalAmount: detail.info.total_amount,
        status: detail.info.status,
        reservationStatus: hold.reservation?.status ?? null,
      });
    })();

    return () => {
      active = false;
    };
  }, [signedIn, listingId, bookingReloadKey]);

  const bookTogetherListing: BookTogetherListing = useMemo(
    () => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      location: formatListingLocation(listing),
      totalRooms: Math.max(totalRooms ?? 1, 1),
      rentAmount: listing.rent_amount,
      rentPeriod: listing.rent_period,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      furnishing: listing.furnishing_status,
      availability: listing.availability_status,
      institution: listing.institution,
      facilities: listing.facilities,
      coverImageUrl: listing.cover_image_url,
      providerName: listing.provider?.display_name ?? null,
    }),
    [listing, totalRooms],
  );

  async function handleCancelVisit() {
    if (!openRequest || !supabase) return;
    setCancelError(null);

    const block = visitCancellationBlock(openRequest.scheduled_for);
    if (block) {
      setCancelWarning(false);
      setCancelError(block);
      return;
    }

    setCancelling(true);
    const result = await cancelViewingRequest(supabase, openRequest.id);
    setCancelling(false);

    if (result.error) {
      setCancelError(result.error);
      return;
    }
    setOpenRequest(null);
    setCancelWarning(false);
    setCancelledMessage("Visit cancelled. You can book another slot any time.");
  }

  async function handleConfirm() {
    setError(null);

    if (!signedIn || !user) {
      navigate(`/auth?returnTo=${encodeURIComponent(location.pathname)}`);
      return;
    }

    const selectionError = validateVisitSelection(dayIso, time);
    if (selectionError) {
      setError(selectionError);
      return;
    }

    if (!supabase) {
      setError("Visit requests are unavailable because Supabase is not configured.");
      return;
    }

    setPending(true);
    const result = await requestViewing(supabase, {
      listingId,
      requesterId: user.id,
      scheduledFor: scheduledForFromSlot(dayIso as string, time as string),
    });
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.request) {
      setOpenRequest(result.request);
    }
  }

  return (
    <>
    {visitDone ? (
      <section
        aria-labelledby="book-room-heading"
        className="scroll-mt-24 rounded-card border border-accent/40 bg-panel p-4 shadow-panel"
      >
        <h2
          id="book-room-heading"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <BadgeCheck className="size-4 shrink-0 text-accent-soft" aria-hidden="true" />
          {bookingSummary ? "Pay for room" : "Book this room"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Your visit is done
          {openRequest ? ` (${formatVisitSlot(openRequest.scheduled_for)})` : ""}.{" "}
          {bookingSummary
            ? bookingSummary.status === "paid"
              ? bookingSummary.reservationStatus === "approved"
                ? `Room ${bookingSummary.roomNumber} is fully paid and approved by the lister.`
                : bookingSummary.reservationStatus === "declined"
                  ? `Room ${bookingSummary.roomNumber} · the lister declined this room, so the booking is closed.`
                  : `Room ${bookingSummary.roomNumber} is fully paid. The lister now has your room request.`
              : `Room ${bookingSummary.roomNumber} · ${bookingSummary.paidCount} of ${bookingSummary.headcount} shares paid · ${formatShare(bookingSummary.collected)} of ${formatShare(bookingSummary.totalAmount)} collected.`
            : roomReservation?.status === "declined"
              ? `The lister declined your request for Room ${roomReservation.roomNumber}. Pick another room or group and try again.`
              : "Choose the room you want, invite your roommates and split the rent."}
        </p>
        <Button
          size="lg"
          className="mt-3 w-full font-semibold"
          onClick={() => setBookTogetherOpen(true)}
          icon={<BadgeCheck className="size-4" />}
        >
          {bookingSummary
            ? bookingSummary.status === "paid" &&
              bookingSummary.reservationStatus === "approved"
              ? "View booking"
              : "Pay for room"
            : "Book this room"}
        </Button>
      </section>
    ) : (
    <section
      id="schedule-visit"
      aria-labelledby="schedule-heading"
      className="scroll-mt-24 rounded-card border border-line bg-panel p-4 shadow-panel"
    >
      <h2 id="schedule-heading" className="text-sm font-semibold text-foreground">
        Schedule a Visit
      </h2>
      <p className="mt-1 text-xs text-muted">
        Free viewing · the provider confirms the time.
      </p>

      {openRequest ? (
        <div className="mt-3 flex flex-col gap-2">
          <InlineAlert tone="positive">
            Visit requested for {formatVisitSlot(openRequest.scheduled_for)}.
          </InlineAlert>
          <p className="text-[11px] text-subtle">
            {confirmedVisit
              ? "Confirmed by the provider."
              : "Awaiting the provider's confirmation."}
          </p>

          {cancelError && <InlineAlert>{cancelError}</InlineAlert>}

          {cancelWarning ? (
            <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3">
              <p className="text-xs leading-relaxed text-foreground">
                Cancel this visit? The provider will see it as cancelled and you
                can book another slot. Visits can only be cancelled more than{" "}
                {CANCELLATION_CUTOFF_HOURS} hours before they start.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCancelWarning(false)}
                  disabled={cancelling}
                >
                  Keep visit
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => void handleCancelVisit()}
                  loading={cancelling}
                  icon={<X className="size-4" />}
                >
                  Yes, cancel visit
                </Button>
              </div>
            </div>
          ) : cancellationBlock ? (
            <p className="text-[11px] leading-relaxed text-subtle">
              {cancellationBlock}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                onClick={() => {
                  setCancelError(null);
                  setCancelWarning(true);
                }}
                icon={<X className="size-4" />}
              >
                Cancel visit
              </Button>
            </div>
          )}

        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {cancelledMessage && (
            <InlineAlert tone="positive">{cancelledMessage}</InlineAlert>
          )}
          <div
            role="group"
            aria-label="Visit day"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {days.map((day) => {
              const active = day.iso === dayIso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDayIso(day.iso)}
                  className={cn(
                    "flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-tile border px-3 py-2 text-center transition-colors",
                    active
                      ? "border-accent bg-accent text-accent-ink shadow-accent"
                      : "border-line bg-panel-raised text-muted hover:border-line-strong hover:text-foreground",
                  )}
                >
                  <span className="text-[10px] tracking-wide uppercase opacity-80">
                    {day.weekday}
                  </span>
                  <span className="text-xs font-semibold">
                    {day.day} {day.month}
                  </span>
                </button>
              );
            })}
          </div>

          <div role="group" aria-label="Visit time" className="grid grid-cols-4 gap-2">
            {VISIT_TIMES.map((slot) => {
              const active = slot === time;
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTime(slot)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-tile border py-2 text-[11px] font-medium transition-colors",
                    active
                      ? "border-accent bg-accent text-accent-ink shadow-accent"
                      : "border-line bg-panel-raised text-muted hover:border-line-strong hover:text-foreground",
                  )}
                >
                  <Clock className="size-3" aria-hidden="true" />
                  {slot}
                </button>
              );
            })}
          </div>

          {!signedIn && (
            <p className="text-[11px] text-subtle">
              You will be asked to sign in before the request is sent.
            </p>
          )}

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button
            className="w-full"
            onClick={() => void handleConfirm()}
            loading={pending}
            icon={<ArrowRight className="size-4" />}
            iconPosition="end"
          >
            {signedIn ? "Confirm booking" : "Sign in to book"}
          </Button>
        </div>
      )}
    </section>
    )}

    {signedIn && !visitDone && (bookingSummary || confirmedVisit) && (
      <section
        aria-labelledby="book-together-heading"
        className="mt-3 rounded-card border border-accent/35 bg-panel p-4 shadow-panel"
      >
        <h2
          id="book-together-heading"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Users className="size-4 shrink-0 text-accent-soft" aria-hidden="true" />
          Book together
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {bookingSummary
            ? bookingSummary.status === "paid"
              ? `Room ${bookingSummary.roomNumber} · fully paid. The room is held for whoever started the booking.`
              : `Room ${bookingSummary.roomNumber} · ${bookingSummary.paidCount} of ${bookingSummary.headcount} shares paid · ${formatShare(bookingSummary.collected)} of ${formatShare(bookingSummary.totalAmount)} collected.`
            : "Sharing this room with roommates? Split the rent, pay your own share, and see who is still to pay."}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 w-fit"
          onClick={() => setBookTogetherOpen(true)}
          icon={<Users className="size-4" />}
        >
          {bookingSummary ? "Open booking" : "Split the rent"}
        </Button>
      </section>
    )}

    {user && (
      <BookTogetherSheet
        open={bookTogetherOpen}
        onClose={() => setBookTogetherOpen(false)}
        listing={bookTogetherListing}
        userId={user.id}
        connections={connections}
        onBooked={() => setBookingReloadKey((current) => current + 1)}
      />
    )}
  </>
  );
}
