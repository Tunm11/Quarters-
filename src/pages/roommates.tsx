import {
  ArrowLeft,
  Check,
  GraduationCap,
  Handshake,
  Inbox,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { EditRoommateProfileSheet } from "@/components/roommates/edit-roommate-profile-sheet";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { iconButtonClasses, IconButton } from "@/components/ui/icon-button";
import { Photo } from "@/components/ui/photo";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import {
  filterRoommateProfiles,
  formatMoveIn,
  formatRoommateBudget,
  formatRoommateBudgetShort,
  formatRoommateGender,
  formatRoommateLocation,
  initialsOf,
  roommateBudgetFilters,
  roommateCardGradient,
  roommateGenderFilters,
  type RoommateBudgetFilter,
  type RoommateGenderFilter,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";
import { useOwnerInterests } from "@/roommates/use-owner-interests";
import { useRoommateConnections } from "@/roommates/use-roommate-connections";
import { useRoommateProfiles } from "@/roommates/use-roommate-profiles";
import { useRoommateVerification } from "@/roommates/use-roommate-verification";
import { compatibilityScore } from "@/roommates/verification";

function RoommateCard({
  profile,
  compatibility,
}: {
  profile: RoommateProfile;
  compatibility: number | null;
}) {
  const location = formatRoommateLocation(profile);
  const moveIn = formatMoveIn(profile.move_in_date);
  const budget =
    profile.budget_amount != null
      ? formatRoommateBudgetShort(profile.budget_amount)
      : null;

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-[1.35rem] border border-line bg-panel shadow-panel transition-colors hover:border-accent/40">
      {/* One stretched link makes the whole card the target, not just the name. */}
      <Link
        to={`/roommate/${profile.id}`}
        aria-label={`Open ${profile.display_name}'s profile`}
        className="absolute inset-0 z-10 rounded-[1.35rem] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-soft"
      />
      <div
        className="relative aspect-[4/5] overflow-hidden"
        style={{ backgroundImage: roommateCardGradient(profile.id) }}
      >
        {profile.avatar_url ? (
          <Photo
            src={profile.avatar_url}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-3xl font-semibold tracking-tight text-white/70"
          >
            {initialsOf(profile.display_name)}
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#1f2110]/85 via-[#1f2110]/15 to-transparent"
        />

        {moveIn && (
          <span className="absolute top-2.5 left-2.5 rounded-pill bg-[#1f2110]/55 px-2 py-1 text-[10px] font-medium text-[#f6f3e8] backdrop-blur-sm">
            From {moveIn}
          </span>
        )}
        {budget && (
          <span
            className="absolute top-2.5 right-2.5 rounded-pill bg-panel/92 px-2 py-1 text-[10px] font-semibold text-foreground backdrop-blur-sm"
            title={`${formatRoommateBudget(profile.budget_amount as number)} per year`}
          >
            {budget}
            <span className="font-normal text-muted">/yr</span>
          </span>
        )}

        <div className="absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 text-white">
          {compatibility != null && (
            <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-pill bg-panel/92 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-sm">
              <Sparkles className="size-2.5 text-accent-soft" aria-hidden="true" />
              {compatibility}% fit
            </span>
          )}
          <h3 className="truncate text-sm font-semibold group-hover:underline">
            {profile.display_name}
          </h3>
          {location && (
            <span className="flex min-w-0 items-center gap-1 text-[10px] text-white/80">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        {formatRoommateGender(profile) && (
          <p className="text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">
            {formatRoommateGender(profile)}
          </p>
        )}
        {profile.headline && (
          <p className="line-clamp-2 text-[11px] leading-snug text-foreground">
            {profile.headline}
          </p>
        )}
        {profile.institution && (
          <p className="flex items-center gap-1 text-[10px] text-subtle">
            <GraduationCap className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{profile.institution}</span>
          </p>
        )}
      </div>
    </article>
  );
}

export default function RoommatesPage() {
  const { profiles, status, error, reload } = useRoommateProfiles();
  const { traits: viewerTraits, standing } = useRoommateVerification();
  const { connections } = useRoommateConnections();
  const { interests, pending, decisionError, decidingId, decide } = useOwnerInterests();
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState<RoommateBudgetFilter>("all");
  const [gender, setGender] = useState<RoommateGenderFilter>("all");
  // Home's message and notification icons deep-link straight into the matching
  // list (?view=connections / ?view=interests), so the icon lands on content
  // instead of the top of the discovery screen.
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const blockedNotice =
    (location.state as { notice?: string } | null)?.notice ?? null;
  const view = searchParams.get("view");
  const [connectionsOpen, setConnectionsOpen] = useState(view === "connections");
  const [interestsOpen, setInterestsOpen] = useState(view === "interests");
  const [editOpen, setEditOpen] = useState(false);
  const searchId = useId();

  const visibleProfiles = filterRoommateProfiles(profiles, {
    query,
    budget,
    gender,
  });
  const trimmedQuery = query.trim();
  const countLabel = `${visibleProfiles.length} ${
    visibleProfiles.length === 1 ? "profile" : "profiles"
  }`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-muted">
            <Users className="size-3.5 text-accent-soft" aria-hidden="true" />
            {status === "ready" ? `${profiles.length} looking` : "Lagos"}
          </span>
          <div className="flex items-center gap-2">
            <IconButton
              label="Edit your profile"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
            </IconButton>
            {pending.length > 0 && (
              <IconButton
                label={`Interested students (${pending.length})`}
                variant="outline"
                className="relative"
                onClick={() => setInterestsOpen(true)}
              >
                <Inbox className="size-4" />
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-1.5 grid min-w-[18px] place-items-center rounded-pill bg-accent px-1 text-[9px] leading-[18px] font-semibold text-accent-ink"
                >
                  {pending.length}
                </span>
              </IconButton>
            )}
            {connections.length > 0 && (
              <IconButton
                label={`Connections (${connections.length})`}
                variant="outline"
                className="relative"
                onClick={() => setConnectionsOpen(true)}
              >
                <Handshake className="size-4" />
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-1.5 grid min-w-[18px] place-items-center rounded-pill bg-accent px-1 text-[9px] leading-[18px] font-semibold text-accent-ink"
                >
                  {connections.length}
                </span>
              </IconButton>
            )}
            <Link
              to="/explore"
              aria-label="Back to Explore"
              className={iconButtonClasses({ variant: "outline" })}
            >
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </div>

        <div>
          <h1
            id="roommates-heading"
            className="text-[1.9rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Find your roommate
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Students near your campus who are looking for the same area and budget.
          </p>
        </div>

        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search roommate profiles
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            placeholder="Search name, area or campus"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-[1.15rem] border border-line bg-panel pr-12 pl-12 text-sm text-foreground shadow-panel transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query.length > 0 && (
            <div className="absolute top-1/2 right-2 -translate-y-1/2">
              <IconButton label="Clear search" onClick={() => setQuery("")}>
                <X className="size-4" />
              </IconButton>
            </div>
          )}
        </div>

        <div
          role="group"
          aria-label="Budget"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 overscroll-x-contain [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {roommateBudgetFilters.map((filter) => {
            const active = budget === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => setBudget(filter.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-pill border px-3.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-ink shadow-accent"
                    : "border-line bg-panel text-muted hover:border-line-strong hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-[0.16em] text-subtle uppercase">
            Gender
          </p>
          <div
            role="group"
            aria-label="Gender"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 overscroll-x-contain [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {roommateGenderFilters.map((filter) => {
              const active = gender === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGender(filter.id)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-pill border px-3.5 text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "border-accent bg-accent text-accent-ink shadow-accent"
                      : "border-line bg-panel text-muted hover:border-line-strong hover:text-foreground",
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {blockedNotice && <InlineAlert tone="positive">{blockedNotice}</InlineAlert>}

      <section aria-labelledby="roommate-results-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="roommate-results-heading" className="text-base font-semibold">
            Near your campus
          </h2>
          <div className="flex items-center gap-2.5">
            {standing === "verified" && (
              <span
                role="img"
                aria-label="Personalised fit"
                title="Personalised fit"
                className="grid size-9 place-items-center rounded-pill border border-accent/35 bg-accent/12 text-accent-soft"
              >
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
            )}
            {/* The count sits inside the pill instead of floating above it: a
                badge that pokes over the top edge collided with the heading. */}
            <span
              role="img"
              aria-label={countLabel}
              title={countLabel}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line-strong px-2.5 text-[11px] font-medium text-muted"
            >
              <UserRound className="size-4" aria-hidden="true" />
              <span aria-hidden="true">{visibleProfiles.length}</span>
            </span>
          </div>
        </div>

        {standing === "verified" && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-subtle">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-accent-soft" aria-hidden="true" />
            Fit percentages compare your verified habits with each profile. Profiles
            without a verification show no score.
          </p>
        )}

        {status === "loading" ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm text-muted">
              Loading roommate profiles…
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-[1.35rem] border border-line bg-panel"
                >
                  <Skeleton className="aspect-[4/5] rounded-none" />
                  <div className="flex flex-col gap-2 p-3">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : status === "error" ? (
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
        ) : visibleProfiles.length > 0 ? (
          <ul className="grid list-none grid-cols-2 gap-3">
            {visibleProfiles.map((profile) => (
              <li key={profile.id} className="flex">
                <RoommateCard
                  profile={profile}
                  compatibility={compatibilityScore(viewerTraits, profile.traits)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title={
              trimmedQuery
                ? `No one matches “${trimmedQuery}” yet.`
                : "No roommates match these filters yet."
            }
            description="Try a different area, campus, budget or gender. Profiles appear here as students publish them."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setBudget("all");
                  setGender("all");
                }}
              >
                Reset filters
              </Button>
            }
          />
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-subtle">
        These are seeded demo profiles while roommate profile creation is being
        built.
      </p>

      {editOpen && (
        <EditRoommateProfileSheet
          open
          onClose={() => setEditOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      <BottomSheet
        open={interestsOpen}
        onClose={() => setInterestsOpen(false)}
        title="Interested students"
      >
        {decisionError && <InlineAlert>{decisionError}</InlineAlert>}
        {interests.length === 0 && (
          <p className="py-6 text-center text-sm leading-relaxed text-muted">
            No one has asked to connect yet. Requests from students who want to
            share with you appear here.
          </p>
        )}
        <ul className="flex list-none flex-col gap-2.5">
          {interests.map((interest) => (
            <li
              key={interest.id}
              className="flex flex-col gap-3 rounded-tile border border-line bg-panel-raised p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-pill border border-line bg-accent/10 text-xs font-semibold text-accent-soft"
                >
                  {initialsOf(interest.sender_name)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium text-foreground">
                    {interest.sender_name}
                  </p>
                  <p className="truncate text-[11px] text-subtle">
                    {interest.sender_detail ?? "Wants to connect with you"}
                  </p>
                </div>
                {interest.status !== "pending" && (
                  <Badge tone={interest.status === "accepted" ? "positive" : "neutral"}>
                    {interest.status === "accepted" ? "Connected" : "Declined"}
                  </Badge>
                )}
              </div>

              {interest.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={<Check className="size-4" />}
                    loading={decidingId === interest.id}
                    onClick={() => void decide(interest.id, "accepted")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={decidingId === interest.id}
                    onClick={() => void decide(interest.id, "declined")}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet
        open={connectionsOpen}
        onClose={() => setConnectionsOpen(false)}
        title="Your connections"
        className="min-h-[60dvh]"
      >
        {connections.length === 0 && (
          <p className="py-6 text-center text-sm leading-relaxed text-muted">
            No connections yet. Accept a request, or send one from a roommate
            profile, and your conversations appear here.
          </p>
        )}
        <ul className="flex list-none flex-col gap-2.5">
          {connections.map((connection) => (
            <li key={connection.id}>
              <div className="flex items-center gap-1.5 rounded-tile border border-line bg-panel-raised p-1.5 transition-colors hover:border-line-strong">
                <Link
                  to={`/roommate/${connection.id}?chat=1`}
                  onClick={() => setConnectionsOpen(false)}
                  aria-label={`Chat with ${connection.display_name}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-tile px-1 py-1"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-pill text-xs font-semibold text-white"
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
                      {formatRoommateLocation(connection)} · Connected
                    </span>
                  </span>
                  <MessageCircle
                    className="size-4 shrink-0 text-accent-soft"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  to={`/roommate/${connection.id}`}
                  onClick={() => setConnectionsOpen(false)}
                  aria-label={`View ${connection.display_name}'s profile`}
                  title="View profile"
                  className={iconButtonClasses()}
                >
                  <UserRound className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  );
}
