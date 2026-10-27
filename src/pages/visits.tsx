import {
  CalendarDays,
  Clock,
  Compass,
  DoorOpen,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ListingChatSheet } from "@/components/listings/listing-chat-sheet";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatListingLocation,
  formatListingRent,
} from "@/listings/public-listings";
import {
  displayStatusFor,
  splitVisits,
  visitDisplayMeta,
  type MyVisit,
} from "@/listings/my-visits";
import { useMyVisits } from "@/listings/use-my-visits";
import {
  formatVisitSlot,
  hoursUntilVisit,
  visitCancellationBlock,
} from "@/listings/viewing-requests";

/**
 * Every visit the student has asked for, in two lists: what is still ahead and
 * what already happened. Each card carries the room, the slot, the lister's
 * answer, and the two things a student needs from here — message the lister, or
 * cancel while the 24-hour cutoff allows it.
 */
export default function VisitsPage() {
  const { status: authStatus, user } = useAuth();
  const signedIn = authStatus === "signedIn" && Boolean(user);
  const { visits, status, error, cancellingId, cancel, reload } = useMyVisits({
    enabled: signedIn,
  });
  const [openChat, setOpenChat] = useState<MyVisit | null>(null);
  const [actionError, setActionError] = useState<{
    visitId: string;
    message: string;
  } | null>(null);

  const { upcoming, past } = splitVisits(visits);
  const loading = status === "loading";
  const isEmpty = status === "ready" && visits.length === 0;

  async function handleCancel(visitId: string) {
    setActionError(null);
    const failure = await cancel(visitId);
    if (failure) setActionError({ visitId, message: failure });
  }

  function renderCard(visit: MyVisit) {
    const { request, listing } = visit;
    const meta = visitDisplayMeta[displayStatusFor(visit)];
    const location = listing ? formatListingLocation(listing) : "";
    const rent = listing ? formatListingRent(listing) : "";
    // The cutoff only matters while the visit is still ahead; a past slot gets
    // no warning, it just moves to the history.
    const blockReason =
      (request.status === "pending" || request.status === "confirmed") &&
      hoursUntilVisit(request.scheduled_for) > 0
        ? visitCancellationBlock(request.scheduled_for)
        : null;
    const canCancel =
      (request.status === "pending" || request.status === "confirmed") &&
      !blockReason;
    const canMessage =
      Boolean(listing) &&
      (request.status === "pending" || request.status === "confirmed");
    const failure =
      actionError?.visitId === request.id ? actionError.message : null;

    return (
      <li key={request.id}>
        <article className="flex flex-col gap-3 rounded-card border border-line bg-panel p-3.5">
          <div className="flex gap-3">
            {listing ? (
              <Link
                to={`/property/${listing.id}`}
                aria-label={`Open ${listing.title}`}
                className="size-20 shrink-0 overflow-hidden rounded-tile bg-sand-wash"
              >
                {listing.cover_image_url ? (
                  <Photo
                    src={listing.cover_image_url}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center text-subtle">
                    <DoorOpen className="size-5" aria-hidden="true" />
                  </span>
                )}
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className="grid size-20 shrink-0 place-items-center rounded-tile bg-sand-wash text-subtle"
              >
                <DoorOpen className="size-5" />
              </span>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm leading-snug font-semibold text-foreground">
                  {listing ? listing.title : "Room no longer listed"}
                </p>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>

              {location && (
                <p className="truncate text-[11px] text-muted">{location}</p>
              )}

              <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {formatVisitSlot(request.scheduled_for)}
              </p>

              {rent && (
                <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                  <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                  {rent}
                </p>
              )}
            </div>
          </div>

          {request.note && (
            <p className="rounded-tile bg-panel-raised px-3 py-2 text-[11px] leading-relaxed text-muted">
              <span className="font-medium text-foreground">Your note:</span>{" "}
              {request.note}
            </p>
          )}

          {failure && <InlineAlert>{failure}</InlineAlert>}
          {!failure && blockReason && canCancel === false && (
            <p className="text-[11px] leading-relaxed text-subtle">{blockReason}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {listing && (
              <Link
                to={`/property/${listing.id}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                View room
              </Link>
            )}
            {canMessage && listing && (
              <Button
                variant="secondary"
                size="sm"
                icon={<MessageCircle className="size-4" />}
                onClick={() => setOpenChat(visit)}
              >
                Message lister
              </Button>
            )}
            {canCancel && (
              <Button
                variant="secondary"
                size="sm"
                loading={cancellingId === request.id}
                onClick={() => void handleCancel(request.id)}
              >
                Cancel visit
              </Button>
            )}
          </div>
        </article>
      </li>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
            Schedule
          </span>
          <Link
            to="/"
            aria-label="Back to Home"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Home
          </Link>
        </div>
        <SectionHeading
          id="visits-heading"
          title="My visits"
          level={1}
          description="Every room you have asked to see, and where each request stands."
        />
      </header>

      {loading && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted">
            Loading your visits…
          </p>
          {[0, 1].map((key) => (
            <div
              key={key}
              className="flex gap-3 rounded-card border border-line bg-panel p-3.5"
            >
              <Skeleton className="size-20 shrink-0 rounded-tile" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
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

      {isEmpty && (
        <div className="rounded-card border border-line bg-panel p-6 text-center sm:p-8">
          <div className="flex flex-col items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-full border border-line bg-canvas-soft text-accent-soft"
            >
              <CalendarDays className="size-5" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold">No visits yet</h2>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
                Open any room and book a visit. Once the lister answers, the
                visit moves to “Coming up” or the history here.
              </p>
            </div>
            <Link
              to="/explore"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <Compass className="size-4" aria-hidden="true" />
              Explore rooms
            </Link>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
          <SectionHeading
            id="upcoming-heading"
            eyebrow={`${upcoming.length} ahead`}
            title="Coming up"
          />
          <ul className="flex list-none flex-col gap-3">
            {upcoming.map(renderCard)}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-heading" className="flex flex-col gap-3">
          <SectionHeading
            id="past-heading"
            eyebrow={`${past.length} earlier`}
            title="History"
          />
          <ul className="flex list-none flex-col gap-3">
            {past.map(renderCard)}
          </ul>
        </section>
      )}

      {user && openChat?.listing && (
        <ListingChatSheet
          open
          onClose={() => setOpenChat(null)}
          listingId={openChat.listing.id}
          listingTitle={openChat.listing.title}
          studentId={user.id}
          viewerId={user.id}
          peerLabel="the lister"
        />
      )}
    </div>
  );
}
