import { Check, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  formatListingLocation,
  formatListingRent,
  type PublicListing,
} from "@/listings/public-listings";
import {
  loadRoommateConnections,
  type RoommateConnection,
} from "@/roommates/connections";
import { planGroupVisit } from "@/roommates/listing-shares";
import {
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";

export type PlanGroupVisitSheetProps = {
  open: boolean;
  onClose: () => void;
  listing: PublicListing | null;
  viewerId: string | null;
  /**
   * The roommate profile whose thread the card sits in. Ticked once the
   * connections load, so the two-person case is still one tap.
   */
  preferredRoommateProfileId?: string | null;
  onRequested: (listingId: string, partySize: number) => void;
};

/**
 * Picking who comes to the viewing.
 *
 * A group visit is not limited to the two people in a roommate thread: the
 * student is always in the party and ticks as many connected roommates as are
 * actually house-hunting with them. The database stores the whole roster, so a
 * three- or four-person household asks for one viewing instead of a pair of
 * requests the lister would have to join up themselves.
 */
export function PlanGroupVisitSheet({
  open,
  onClose,
  listing,
  viewerId,
  preferredRoommateProfileId = null,
  onRequested,
}: PlanGroupVisitSheetProps) {
  const [invitees, setInvitees] = useState<
    (RoommateConnection & { user_id: string })[]
  >([]);
  const [connectionsStatus, setConnectionsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connections load when the sheet opens, not with every profile view; each
  // open starts clean, then ticks the roommate whose thread it came from.
  useEffect(() => {
    if (!open) return;
    const client = supabase;

    setSelected([]);
    setError(null);
    setBusy(false);
    setConnectionsError(null);

    if (!client || !viewerId) {
      setInvitees([]);
      setConnectionsStatus("ready");
      return;
    }

    let active = true;
    setConnectionsStatus("loading");

    void loadRoommateConnections(client, viewerId).then((result) => {
      if (!active) return;

      const people = result.connections.filter(
        (connection): connection is RoommateConnection & { user_id: string } =>
          Boolean(connection.user_id) && connection.user_id !== viewerId,
      );
      setInvitees(people);
      setConnectionsError(result.error);
      setConnectionsStatus(result.error ? "error" : "ready");

      const preselect = people.find(
        (connection) => connection.id === preferredRoommateProfileId,
      );
      setSelected(preselect ? [preselect.user_id] : []);
    });

    return () => {
      active = false;
    };
  }, [open, viewerId, preferredRoommateProfileId, reloadKey]);

  function toggle(userId: string) {
    setError(null);
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function handleRequest() {
    const client = supabase;
    if (!client || !listing || !viewerId) {
      setError("Sign in to plan a group visit.");
      return;
    }
    if (selected.length === 0) {
      setError("Choose at least one roommate to visit with.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await planGroupVisit(client, {
      listingId: listing.id,
      viewerId,
      memberIds: selected,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onRequested(listing.id, result.partySize ?? selected.length + 1);
    onClose();
  }

  const partySize = selected.length + 1;
  const title = listing ? listing.title : "this room";
  const location = listing ? formatListingLocation(listing) : "";
  const rent = listing ? formatListingRent(listing) : "";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Plan a group visit"
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-[11px] leading-relaxed text-subtle">
            {selected.length === 0
              ? "Choose at least one roommate. You are always in the party."
              : `${partySize} people · the lister sees the whole party.`}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleRequest()}
              loading={busy}
              disabled={selected.length === 0}
              icon={<Users className="size-4" />}
            >
              Request group visit
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-tile border border-line bg-panel-raised p-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {location && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          )}
          {rent && (
            <p className="text-[11px] font-medium text-foreground">{rent}</p>
          )}
        </div>

        <p className="text-sm leading-relaxed text-muted">
          Ask the lister to host everyone at one viewing. This is not a booking
          — the lister still answers with a time that works.
        </p>

        {error && <InlineAlert>{error}</InlineAlert>}

        <section
          aria-labelledby="group-visit-party-heading"
          className="flex flex-col gap-2"
        >
          <h3
            id="group-visit-party-heading"
            className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase"
          >
            Who is coming
          </h3>

          <p className="flex items-center gap-2 rounded-tile border border-accent/35 bg-accent/12 px-3 py-2 text-xs text-foreground">
            <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-accent/20 text-[10px] font-semibold text-accent-soft">
              1
            </span>
            You · always included
          </p>

          {connectionsStatus === "loading" && (
            <p role="status" className="text-sm text-muted">
              Loading your roommates…
            </p>
          )}

          {connectionsStatus === "error" && (
            <div className="flex flex-col gap-2">
              <InlineAlert>{connectionsError}</InlineAlert>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                Try again
              </Button>
            </div>
          )}

          {connectionsStatus === "ready" && invitees.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              You have no connected roommates to invite yet.{" "}
              <Link to="/roommates" className="text-accent-soft underline">
                Find a roommate
              </Link>{" "}
              first, or plan this visit with the roommate in this chat.
            </p>
          ) : null}

          {connectionsStatus === "ready" && invitees.length > 0 && (
            <ul className="flex list-none flex-col gap-2">
              {invitees.map((connection) => {
                const picked = selected.includes(connection.user_id);
                return (
                  <li key={connection.id}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      aria-label={`${connection.display_name}${
                        picked ? ", coming" : ", not coming yet"
                      }`}
                      onClick={() => toggle(connection.user_id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-tile border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft",
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
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {connection.display_name}
                        </span>
                        <span className="truncate text-[11px] text-subtle">
                          {connection.institution ?? "Connected roommate"}
                        </span>
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
        </section>
      </div>
    </BottomSheet>
  );
}
