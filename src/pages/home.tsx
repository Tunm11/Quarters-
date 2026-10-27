import {
  ArrowRight,
  Bell,
  CalendarDays,
  Compass,
  LogIn,
  MessageCircle,
  RefreshCw,
  Search,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { useUnreadCount } from "@/chat/use-unread-count";
import { useNotificationBadge } from "@/notifications/use-notifications";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ActiveBookingCard } from "@/components/listings/active-booking-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { iconButtonClasses } from "@/components/ui/icon-button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicListingCard } from "@/listings/public-listing-card";
import { useMyBooking } from "@/listings/use-my-booking";
import { usePublicListings } from "@/listings/use-public-listings";
import { useSavedListingIds } from "@/listings/use-saved-listings";

/** First token of the display name, falling back to the email handle. */
function firstNameOf(displayName: string | null | undefined, email: string | undefined): string {
  const source = displayName?.trim() || email?.split("@")[0] || "";
  return source.split(/\s+/)[0] ?? "";
}

export default function HomePage() {
  const { status, profile, user } = useAuth();
  const unreadCount = useUnreadCount();
  const notificationCount = useNotificationBadge();
  const isSignedIn = status === "signedIn";
  const name = firstNameOf(profile?.display_name, user?.email);
  const { listings, status: listingsStatus, error, reload } = usePublicListings();
  const { booking, reload: reloadBooking } = useMyBooking();
  const [bookingNotice, setBookingNotice] = useState<string | null>(null);
  const featuredListings = listings.slice(0, 3);

  useEffect(() => {
    if (!bookingNotice) return;
    const timer = window.setTimeout(() => setBookingNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [bookingNotice]);
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { idSet: savedIds, toggle: toggleSaved } = useSavedListingIds({
    userId: user?.id ?? null,
  });

  // Saving needs an account; a signed-out tap goes to sign-in and comes back.
  function handleToggleSave(listingId: string) {
    if (!isSignedIn || !user) {
      navigate(
        `/auth?returnTo=${encodeURIComponent(routeLocation.pathname)}`,
      );
      return;
    }
    void toggleSaved(listingId);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      {/* Visits, messages and the activity feed: icon-only entry points. The
          Bell is a real notification centre now, with its own unread badge. */}
      <div className="-mb-4 flex items-center justify-end gap-2">
        <Link
          to="/visits"
          aria-label="My visits"
          title="My visits"
          className={iconButtonClasses({ variant: "outline", className: "bg-panel" })}
        >
          <CalendarDays className="size-5" aria-hidden="true" />
        </Link>
        <Link
          to="/messages"
          aria-label={
            unreadCount > 0 ? `Messages (${unreadCount} unread)` : "Messages"
          }
          title={unreadCount > 0 ? `${unreadCount} unread messages` : "Messages"}
          className={iconButtonClasses({
            variant: "outline",
            className: "relative bg-panel",
          })}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-pill bg-accent px-1 text-[9px] leading-[18px] font-semibold text-accent-ink"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <Link
          to="/notifications"
          aria-label={
            notificationCount > 0
              ? `Notifications (${notificationCount} unread)`
              : "Notifications"
          }
          title={
            notificationCount > 0
              ? `${notificationCount} unread notifications`
              : "Notifications"
          }
          className={iconButtonClasses({
            variant: "outline",
            className: "relative bg-panel",
          })}
        >
          <Bell className="size-5" aria-hidden="true" />
          {notificationCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-pill bg-accent px-1 text-[9px] leading-[18px] font-semibold text-accent-ink"
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </Link>
      </div>

      {/* A booked room owns the top of Home until it is renewed or cancelled. */}
      {booking && (
        <ActiveBookingCard
          booking={booking}
          onChanged={reloadBooking}
          onNotice={setBookingNotice}
        />
      )}

      {bookingNotice && <InlineAlert tone="positive">{bookingNotice}</InlineAlert>}

      {/* Welcome */}
      <section
        aria-labelledby="welcome-heading"
        className="relative overflow-hidden rounded-tile border border-line-strong bg-panel/60 px-5 py-7 sm:px-8 sm:py-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-sand-wash"
        />
        <div className="relative flex flex-col gap-5">
          <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
            {isSignedIn ? "Welcome back" : "Student living, made simple"}
          </p>
          <div className="flex flex-col gap-3">
            <h1
              id="welcome-heading"
              className="text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {isSignedIn && name ? (
                <>
                  Hi {name}, find your
                  <br className="sm:hidden" /> next room.
                </>
              ) : (
                <>
                  Find a room near
                  <br className="sm:hidden" /> campus.
                </>
              )}
            </h1>
            {!isSignedIn && (
              <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                QUARTERS brings rooms near Nigerian campuses into one calm, honest
                place — with clear costs and no guesswork.
              </p>
            )}
          </div>

          <Link
            to="/explore"
            aria-label="Search rooms"
            className="group flex h-12 w-full items-center gap-3 rounded-pill border border-line bg-panel px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-foreground sm:max-w-md"
          >
            <Search className="size-4 shrink-0 text-sand" aria-hidden="true" />
            <span className="truncate">Search campus, area, or room type</span>
            <ArrowRight
              className="ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>

          {!isSignedIn && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/auth?mode=signup"
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Create account
              </Link>
              <Link
                to="/auth"
                className={buttonClasses({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                <LogIn className="size-4" aria-hidden="true" />
                Sign in
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Featured listings — honest foundation, no fabricated rooms. */}
      <section
        aria-labelledby="featured-heading"
        className="flex flex-col gap-5"
      >
        <SectionHeading
          id="featured-heading"
          eyebrow="Featured"
          title="Rooms near campus"
          description="The newest rooms published by approved providers, closest to the areas students search most."
          action={
            <Link
              to="/explore"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              <Compass className="size-4" aria-hidden="true" />
              Explore
            </Link>
          }
        />

        {listingsStatus === "loading" ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm text-muted">
              Loading published rooms…
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-card border border-line bg-panel"
                >
                  <Skeleton className="aspect-[4/3] rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : listingsStatus === "error" ? (
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
        ) : featuredListings.length > 0 ? (
          <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredListings.map((listing) => (
              <li key={listing.id} className="flex">
                <PublicListingCard
                  listing={listing}
                  saved={savedIds.has(listing.id)}
                  onToggleSave={handleToggleSave}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            title="No rooms are published yet"
            description="Approved providers are the only accounts that can publish. The first room will appear here with its real rent, location and facilities."
            action={
              <Link
                to="/explore"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Open Explore
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
            note="Nothing is invented while the catalogue is empty."
          />
        )}
      </section>

      {/* Account nudge for signed-out visitors. */}
      {!isSignedIn && (
        <Panel tone="raised" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold">Your account stays yours</h2>
            <p className="text-sm leading-relaxed text-muted">
              Profiles are private to you, and sign-in keeps your session on your
              device until you sign out.
            </p>
          </div>
          <Link
            to="/auth"
            className={buttonClasses({ variant: "secondary", size: "md", className: "w-fit shrink-0" })}
          >
            Sign in
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Panel>
      )}
    </div>
  );
}
