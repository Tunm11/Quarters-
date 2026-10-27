import {
  BadgeCheck,
  Bath,
  BedDouble,
  Check,
  DoorOpen,
  GraduationCap,
  Lock,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  findActiveBooking,
  loadMyBookings,
  type BookingReceipt,
} from "@/listings/booking-receipt";
import {
  createBookingGroup,
  formatShare,
  leaveBookingGroup,
  loadBookingGroup,
  loadMyBookingGroup,
  payBookingShare,
  splitBookingShare,
  type BookingGroupInfo,
  type BookingParticipant,
} from "@/listings/booking-group";
import {
  buildRoomAvailability,
  loadBookedRooms,
  loadMyRoomReservation,
  type RoomAvailability,
  type RoomReservation,
} from "@/listings/room-bookings";
import type { RoommateConnection } from "@/roommates/connections";
import { initialsOf, roommateCardGradient } from "@/roommates/roommate-profiles";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

const periodLabels: Record<string, string> = {
  week: "/week",
  month: "/month",
  quarter: "/quarter",
  term: "/session",
  year: "/year",
};

const availabilityLabels: Record<string, string> = {
  available: "Available now",
  limited: "Limited spots",
  unavailable: "Currently unavailable",
};

const furnishingLabels: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

const paidDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function paidDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "Paid" : `Paid ${paidDateFormat.format(parsed)}`;
}

export type BookTogetherListing = {
  id: string;
  title: string;
  description: string | null;
  location: string;
  totalRooms: number;
  rentAmount: number | null;
  rentPeriod: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  availability: string | null;
  institution: string | null;
  facilities: string[];
  coverImageUrl: string | null;
  providerName: string | null;
};

export type BookTogetherSheetProps = {
  open: boolean;
  onClose: () => void;
  listing: BookTogetherListing;
  userId: string;
  connections: RoommateConnection[];
  /** Called once a group booking exists or changes, so the host can refresh. */
  onBooked?: () => void;
};

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="truncate text-xs font-medium text-foreground">
        {value ?? "Not stated"}
      </dd>
    </div>
  );
}

/**
 * Booking a room with other people.
 *
 * Step one shows the property in full — the details several people need while
 * deciding — then the room and roommates, with the rent split previewed to the
 * kobo before anything is committed. Step two is the shared booking every
 * member sees: what each person owes, who has paid, and who is still to pay.
 *
 * Leaving is only possible before anyone pays, and the database re-splits the
 * rent across the people still in. Payment is recorded, not processed: this
 * build has no card or transfer step.
 */
export function BookTogetherSheet({
  open,
  onClose,
  listing,
  userId,
  connections,
  onBooked,
}: BookTogetherSheetProps) {
  const [rooms, setRooms] = useState<RoomAvailability[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [info, setInfo] = useState<BookingGroupInfo | null>(null);
  const [participants, setParticipants] = useState<BookingParticipant[]>([]);
  const [reservation, setReservation] = useState<RoomReservation | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingReceipt | null>(null);
  const [groupStatus, setGroupStatus] = useState<"idle" | "loading" | "ready">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "pay" | "leave" | "refresh" | null>(
    null,
  );
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const total = listing.rentAmount ?? 0;
  const headcount = selectedIds.length + 1;
  const preview = useMemo(
    () => splitBookingShare(total, headcount),
    [headcount, total],
  );

  const joined = participants.filter((person) => person.status === "joined");
  const paid = joined.filter((person) => person.paid_at);
  const pending = joined.filter((person) => !person.paid_at);
  const me = participants.find((person) => person.user_id === userId);
  const anyonePaid = participants.some((person) => person.paid_at);
  const collected = paid.reduce((sum, person) => sum + person.share_amount, 0);
  const roommates = connections.filter(
    (connection): connection is RoommateConnection & { user_id: string } =>
      Boolean(connection.user_id) && connection.user_id !== userId,
  );

  // Fresh sheet on every open: rooms, the caller's existing group, and a clean
  // selection.
  useEffect(() => {
    if (!open) return;
    const client = supabase;
    setSelectedRoom(null);
    setSelectedIds([]);
    setGroupId(null);
    setInfo(null);
    setParticipants([]);
    setReservation(null);
    setActiveBooking(null);
    setError(null);
    setLeaveConfirm(false);
    setGroupStatus("loading");

    if (!client) {
      setRoomsStatus("error");
      setError("Booking needs Supabase to be configured.");
      setGroupStatus("idle");
      return;
    }

    let active = true;
    setRoomsStatus("loading");

    void loadBookedRooms(client, listing.id).then((result) => {
      if (!active) return;
      if (result.error) {
        setRooms([]);
        setRoomsStatus("error");
        setError(result.error);
        return;
      }
      setRooms(buildRoomAvailability(listing.totalRooms, result.booked));
      setRoomsStatus("ready");
    });

    void loadMyRoomReservation(client, listing.id).then((result) => {
      if (!active) return;
      setReservation(result.reservation);
    });

    // One active booking at a time: a booked student cannot start another.
    void loadMyBookings(client).then((result) => {
      if (!active) return;
      setActiveBooking(findActiveBooking(result.bookings));
    });

    void loadMyBookingGroup(client, listing.id).then(async (existing) => {
      if (!active) return;
      if (existing.error) {
        setGroupStatus("idle");
        setError(existing.error);
        return;
      }
      if (!existing.groupId) {
        setGroupStatus("idle");
        return;
      }

      setGroupId(existing.groupId);
      const detail = await loadBookingGroup(client, existing.groupId);
      if (!active) return;
      setInfo(detail.info);
      setParticipants(detail.participants);
      setError(detail.error);
      setGroupStatus("ready");
    });

    return () => {
      active = false;
    };
  }, [open, listing.id, listing.totalRooms]);

  async function refreshGroup(targetGroupId: string) {
    const client = supabase;
    if (!client) return;
    const [detail, hold] = await Promise.all([
      loadBookingGroup(client, targetGroupId),
      loadMyRoomReservation(client, listing.id),
    ]);
    setInfo(detail.info);
    setParticipants(detail.participants);
    setReservation(hold.reservation);
    setError(detail.error);
    setGroupStatus("ready");
  }

  async function handleRefresh() {
    if (!groupId || busy) return;
    setBusy("refresh");
    await refreshGroup(groupId);
    setBusy(null);
  }

  function toggleRoommate(id: string) {
    setError(null);
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  async function handleCreate() {
    const client = supabase;
    if (!client || !selectedRoom || busy || activeBooking) return;

    setBusy("create");
    setError(null);
    const result = await createBookingGroup(client, {
      listingId: listing.id,
      roomNumber: selectedRoom,
      memberIds: selectedIds,
    });
    setBusy(null);

    if (result.error || !result.groupId) {
      setError(result.error ?? "Could not start this booking.");
      return;
    }

    setGroupId(result.groupId);
    setGroupStatus("loading");
    await refreshGroup(result.groupId);
    onBooked?.();
  }

  async function handlePay() {
    const client = supabase;
    if (!client || !groupId || busy) return;
    setBusy("pay");
    setError(null);
    const result = await payBookingShare(client, groupId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await refreshGroup(groupId);
    onBooked?.();
  }

  async function handleLeave() {
    const client = supabase;
    if (!client || !groupId || busy) return;
    setBusy("leave");
    setError(null);
    const result = await leaveBookingGroup(client, groupId);
    setBusy(null);
    setLeaveConfirm(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // The database re-splits the remaining shares. Reload so the exact stored
    // amounts replace the old ones.
    await refreshGroup(groupId);
    onBooked?.();
  }

  const takenCount = rooms.filter((room) => !room.available).length;

  const rentLine = `${formatShare(total)}${
    listing.rentPeriod ? ` ${periodLabels[listing.rentPeriod] ?? ""}` : ""
  }`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="tall"
      title={groupId ? "Booking together" : "Book together"}
      footer={
        groupId ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleRefresh()}
              loading={busy === "refresh"}
              icon={<RefreshCw className="size-4" />}
            >
              Refresh
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {me &&
                me.status === "joined" &&
                !me.paid_at &&
                info?.status === "collecting" && (
                  <Button
                    onClick={() => void handlePay()}
                    loading={busy === "pay"}
                    icon={<BadgeCheck className="size-4" />}
                  >
                    Pay my share
                  </Button>
                )}
              {!anyonePaid &&
                info?.status === "collecting" &&
                me?.status === "joined" &&
                !leaveConfirm && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setLeaveConfirm(true);
                    }}
                  >
                    Leave booking
                  </Button>
                )}
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-subtle">
              {selectedRoom
                ? `${headcount} ${headcount === 1 ? "person" : "people"} · Room ${selectedRoom}`
                : "Pick a room and at least one roommate."}
            </p>
            <Button
              className="shrink-0"
              onClick={() => void handleCreate()}
              loading={busy === "create"}
              disabled={!selectedRoom || selectedIds.length === 0 || Boolean(activeBooking)}
              icon={<Users className="size-4" />}
            >
              Start booking
            </Button>
          </div>
        )
      }
    >
      {error && (
        <div className="mb-3">
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}

      {groupStatus === "loading" && (
        <p role="status" className="text-sm text-muted">
          Loading your booking…
        </p>
      )}

      {groupId && info && groupStatus === "ready" && (
        <div className="flex flex-col gap-4">
          {info.status === "cancelled" ? (
            <div className="flex flex-col gap-3 rounded-tile border border-line bg-panel-raised p-4">
              <p className="text-sm font-semibold text-foreground">
                This booking was cancelled
              </p>
              <p className="text-xs leading-relaxed text-muted">
                {info.closed_reason === "room_declined"
                  ? "The lister declined this room, so the booking was closed and the room released. Start a new request with another room when you are ready."
                  : "Everyone left before any share was paid, so nothing is owed. Start a new booking whenever you and your roommates are ready."}
              </p>
              <Button
                size="sm"
                className="w-fit"
                onClick={() => {
                  setGroupId(null);
                  setInfo(null);
                  setParticipants([]);
                  setSelectedIds([]);
                  setSelectedRoom(null);
                  setLeaveConfirm(false);
                }}
                icon={<Users className="size-4" />}
              >
                Start a new booking
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-tile border border-line bg-panel-raised">
                {listing.coverImageUrl && (
                  <img
                    src={listing.coverImageUrl}
                    alt={listing.title}
                    loading="lazy"
                    className="h-28 w-full object-cover"
                  />
                )}
                <div className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {info.listing_title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {listing.location} · Room {info.room_number}
                        </span>
                      </p>
                    </div>
                    <Badge
                      tone={
                        info.status !== "paid"
                          ? "caution"
                          : reservation?.status === "approved"
                            ? "positive"
                            : reservation?.status === "declined"
                              ? "danger"
                              : "caution"
                      }
                    >
                      {info.status !== "paid"
                        ? "Collecting"
                        : reservation?.status === "approved"
                          ? "Room approved"
                          : reservation?.status === "declined"
                            ? "Declined"
                            : "Paid · awaiting lister"}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2.5 sm:grid-cols-3">
                    <Fact label="Rent, whole room" value={rentLine} />
                    <Fact
                      label="Bedrooms"
                      value={
                        listing.bedrooms != null
                          ? String(listing.bedrooms)
                          : null
                      }
                    />
                    <Fact
                      label="Bathrooms"
                      value={
                        listing.bathrooms != null
                          ? String(listing.bathrooms)
                          : null
                      }
                    />
                    <Fact
                      label="Furnishing"
                      value={
                        listing.furnishing
                          ? (furnishingLabels[listing.furnishing] ??
                            listing.furnishing)
                          : null
                      }
                    />
                    <Fact
                      label="Nearest campus"
                      value={listing.institution}
                    />
                    <Fact
                      label="Availability"
                      value={
                        listing.availability
                          ? (availabilityLabels[listing.availability] ??
                            listing.availability)
                          : null
                      }
                    />
                  </dl>

                  <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs text-muted">
                        {paid.length} of {joined.length} shares paid
                      </p>
                      <p className="text-xs font-semibold text-foreground">
                        {formatShare(collected)} of{" "}
                        {formatShare(info.total_amount)}
                      </p>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-pill bg-canvas"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        (collected / Math.max(info.total_amount, 1)) * 100,
                      )}
                      aria-label="Rent collected"
                    >
                      <div
                        className={cn(
                          "h-full rounded-pill transition-[width] duration-500",
                          info.status === "paid" ? "bg-positive" : "bg-accent",
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (collected / Math.max(info.total_amount, 1)) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    {info.status === "paid" ? (
                      <p className="text-[11px] leading-relaxed text-muted">
                        {reservation?.status === "approved"
                          ? "Every share is paid and the lister approved the room. It is held for this group."
                          : reservation?.status === "declined"
                            ? "The lister declined this room. The room is free again and the booking is closed."
                            : "Every share is paid. The lister now has your room request and will confirm it."}
                      </p>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-muted">
                        {pending.length === 0
                          ? "Waiting for the last share to clear."
                          : `Still to pay: ${pending
                              .map((person) =>
                                person.user_id === userId
                                  ? "you"
                                  : person.display_name,
                              )
                              .join(", ")}.`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
                    Who is paying
                  </p>
                  <p className="text-[11px] text-subtle">
                    {formatShare(
                      joined.reduce((sum, person) => sum + person.share_amount, 0),
                    )}{" "}
                    split
                  </p>
                </div>
                <ul className="flex list-none flex-col gap-2">
                  {participants
                    .filter((person) => person.status === "joined")
                    .map((person) => {
                      const isMe = person.user_id === userId;
                      return (
                        <li
                          key={person.user_id}
                          className="flex items-center gap-3 rounded-tile border border-line bg-panel p-2.5"
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-9 shrink-0 place-items-center rounded-pill text-[10px] font-semibold text-white"
                            style={{
                              backgroundImage: roommateCardGradient(
                                person.user_id,
                              ),
                            }}
                          >
                            {initialsOf(person.display_name)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {person.display_name}
                              {isMe ? " (you)" : ""}
                              {person.is_creator ? " · started it" : ""}
                            </span>
                            <span className="text-[11px] text-subtle">
                              {formatShare(person.share_amount)}
                              {person.paid_at
                                ? ` · ${paidDate(person.paid_at)}`
                                : " · still to pay"}
                            </span>
                          </span>
                          {person.paid_at ? (
                            <Badge tone="positive">
                              <Check className="size-3" aria-hidden="true" />
                              Paid
                            </Badge>
                          ) : (
                            <Badge tone="caution">Pending</Badge>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>

              {me?.status === "left" && (
                <p className="rounded-tile border border-line bg-panel-raised px-3 py-2 text-[11px] leading-relaxed text-muted">
                  You left this booking. Your share went back to the group and
                  was split between the roommates who stayed.
                </p>
              )}

              {leaveConfirm && (
                <div className="flex flex-col gap-2 rounded-tile border border-danger/40 bg-danger/10 p-3">
                  <p className="text-xs leading-relaxed text-foreground">
                    Leave this booking? Your share goes back to the group and the
                    rent is split again between the roommates who stay. Nobody
                    has paid yet, so the amounts can still change.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLeaveConfirm(false)}
                      disabled={busy === "leave"}
                    >
                      Keep my spot
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => void handleLeave()}
                      loading={busy === "leave"}
                    >
                      Yes, leave
                    </Button>
                  </div>
                </div>
              )}

              <p className="rounded-tile bg-panel-raised px-3 py-2 text-[11px] leading-relaxed text-muted">
                {anyonePaid
                  ? "A share has already been paid, so the group is locked: nobody can leave and the amounts are fixed."
                  : "Everyone sees this list. If a roommate leaves before anyone pays, the rent is split again between the people who remain. The split locks the moment the first share is paid."}
              </p>

              {me && me.status === "joined" && !me.paid_at && (
                <p className="text-[11px] leading-relaxed text-subtle">
                  Paying here records your share so the group can see it; no card
                  or transfer is processed by this build.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {!groupId && groupStatus !== "loading" && (
        <div className="flex flex-col gap-5">
          {activeBooking && (
            <div className="flex flex-col gap-2 rounded-tile border border-accent/35 bg-accent/10 p-3.5">
              <p className="text-sm font-semibold text-foreground">
                You already have a room booked
              </p>
              <p className="text-[11px] leading-relaxed text-muted">
                Room {activeBooking.roomNumber} at {activeBooking.listingTitle}.
                Renew or cancel that booking from Home before booking another
                room.
              </p>
              <Link
                to="/"
                className="w-fit text-[11px] font-medium text-accent-soft underline"
              >
                Go to Home
              </Link>
            </div>
          )}

          {reservation?.status === "declined" && (
            <InlineAlert>
              The lister declined your request for Room {reservation.roomNumber}.
              The room is free again — choose another room or group.
            </InlineAlert>
          )}

          <div className="overflow-hidden rounded-tile border border-line bg-panel-raised">
            {listing.coverImageUrl && (
              <img
                src={listing.coverImageUrl}
                alt={listing.title}
                loading="lazy"
                className="h-32 w-full object-cover"
              />
            )}
            <div className="flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {listing.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{listing.location}</span>
                  </p>
                </div>
                {listing.availability && (
                  <Badge
                    tone={
                      listing.availability === "available"
                        ? "positive"
                        : listing.availability === "limited"
                          ? "caution"
                          : "neutral"
                    }
                  >
                    {availabilityLabels[listing.availability] ??
                      listing.availability}
                  </Badge>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2.5 sm:grid-cols-3">
                <Fact
                  label="Rent, whole room"
                  value={listing.rentAmount != null ? rentLine : null}
                />
                <Fact
                  label="Bedrooms"
                  value={
                    listing.bedrooms != null ? String(listing.bedrooms) : null
                  }
                />
                <Fact
                  label="Bathrooms"
                  value={
                    listing.bathrooms != null ? String(listing.bathrooms) : null
                  }
                />
                <Fact
                  label="Furnishing"
                  value={
                    listing.furnishing
                      ? (furnishingLabels[listing.furnishing] ??
                        listing.furnishing)
                      : null
                  }
                />
                <Fact label="Nearest campus" value={listing.institution} />
                <Fact
                  label="Rooms"
                  value={`${listing.totalRooms} · ${takenCount} taken`}
                />
              </dl>

              {listing.description && (
                <p className="line-clamp-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
                  {listing.description}
                </p>
              )}

              {listing.facilities.length > 0 && (
                <ul className="flex list-none flex-wrap gap-1.5 border-t border-line pt-2.5">
                  {listing.facilities.slice(0, 8).map((facility) => (
                    <li
                      key={facility}
                      className="rounded-pill border border-line bg-panel px-2 py-0.5 text-[10px] text-muted"
                    >
                      {facility}
                    </li>
                  ))}
                </ul>
              )}

              <p className="flex items-center gap-1.5 border-t border-line pt-2.5 text-[11px] text-subtle">
                <BedDouble className="size-3.5" aria-hidden="true" />
                <Bath className="size-3.5" aria-hidden="true" />
                <GraduationCap className="size-3.5" aria-hidden="true" />
                <span className="truncate">
                  Listed by {listing.providerName ?? "the property agent"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
              Room
            </p>
            {roomsStatus === "error" ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => setError("Reopen the sheet to reload the rooms.")}
                icon={<RefreshCw className="size-4" />}
              >
                Rooms unavailable
              </Button>
            ) : (
              <ul className="grid list-none grid-cols-3 gap-2 sm:grid-cols-5">
                {rooms.map((room) => {
                  const chosen = selectedRoom === room.number;
                  return (
                    <li key={room.number}>
                      <button
                        type="button"
                        aria-label={
                          room.available
                            ? `Room ${room.number}, available`
                            : `Room ${room.number}, already booked`
                        }
                        aria-pressed={chosen}
                        disabled={!room.available}
                        onClick={() => setSelectedRoom(room.number)}
                        className={cn(
                          "flex w-full flex-col items-center gap-1 rounded-tile border px-2 py-2.5 text-center transition-colors",
                          chosen
                            ? "border-accent bg-accent/15 text-foreground"
                            : room.available
                              ? "border-line bg-panel-raised text-foreground hover:border-accent/50"
                              : "cursor-not-allowed border-line bg-canvas/60 text-subtle",
                        )}
                      >
                        {room.available ? (
                          <DoorOpen className="size-4" aria-hidden="true" />
                        ) : (
                          <Lock className="size-4" aria-hidden="true" />
                        )}
                        <span className="text-xs font-semibold">
                          Room {room.number}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
              Roommates
            </p>
            {roommates.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                You have no connected roommates yet.{" "}
                <Link to="/roommates" className="text-accent-soft underline">
                  Find a roommate
                </Link>{" "}
                first, then come back to book together.
              </p>
            ) : (
              <ul className="flex list-none flex-col gap-2">
                {roommates.map((connection) => {
                  const picked = selectedIds.includes(connection.user_id);
                  return (
                    <li key={connection.id}>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => toggleRoommate(connection.user_id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-tile border p-2.5 text-left transition-colors",
                          picked
                            ? "border-accent/50 bg-accent/12"
                            : "border-line bg-panel hover:border-line-strong",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-pill text-[10px] font-semibold text-white"
                          style={{
                            backgroundImage: roommateCardGradient(connection.id),
                          }}
                        >
                          {initialsOf(connection.display_name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {connection.display_name}
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-pill border",
                            picked
                              ? "border-accent bg-accent text-accent-ink"
                              : "border-line-strong text-transparent",
                          )}
                        >
                          <Check className="size-3" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-tile border border-accent/35 bg-accent/12 p-3.5">
            <p className="text-[11px] font-medium tracking-[0.14em] text-accent-soft uppercase">
              Split {headcount} {headcount === 1 ? "way" : "ways"}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatShare(preview[0] ?? total)} each
            </p>
            {preview.length > 1 && new Set(preview).size > 1 && (
              <p className="text-[11px] leading-relaxed text-muted">
                Leftover kobo is shared out, so the parts add up exactly:{" "}
                {preview.map((share) => formatShare(share)).join(" · ")}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted">
              Everyone pays their own share and can see who has paid. If a
              roommate leaves before anyone has paid, the rest is split again
              between whoever remains.
            </p>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
