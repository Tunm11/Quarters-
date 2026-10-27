import { Check, DoorOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  formatListingLocation,
  formatListingRent,
  loadPublicListings,
  type PublicListing,
} from "@/listings/public-listings";

export type PropertyPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (listing: PublicListing) => void;
  selectedId?: string | null;
};

/**
 * The room picker behind the composer's property-card option: the current public
 * catalogue, one tap to attach. Nothing is sent until the message is.
 */
export function PropertyPickerSheet({
  open,
  onClose,
  onSelect,
  selectedId,
}: PropertyPickerSheetProps) {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const client = supabase;
    if (!client) {
      setListings([]);
      setError("Sign in to share a room.");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void loadPublicListings(client).then((result) => {
      if (!active) return;
      setListings(result.listings);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Attach a property card">
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted">
          The card shows the photo, the title and the rent, and opens the room
          when tapped.
        </p>

        {error && <InlineAlert>{error}</InlineAlert>}

        {loading && (
          <p role="status" className="text-sm text-muted">
            Loading rooms…
          </p>
        )}

        {!loading && !error && listings.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            No rooms are published right now.
          </p>
        )}

        <ul className="flex list-none flex-col gap-2">
          {listings.map((listing) => {
            const location = formatListingLocation(listing);
            const rent = formatListingRent(listing);
            const picked = listing.id === selectedId;
            return (
              <li key={listing.id}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onSelect(listing)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-tile border p-2.5 text-left transition-colors",
                    picked
                      ? "border-accent/50 bg-accent/12"
                      : "border-line bg-panel hover:border-line-strong",
                  )}
                >
                  {listing.cover_image_url ? (
                    <img
                      src={listing.cover_image_url}
                      alt=""
                      loading="lazy"
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
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {listing.title}
                    </span>
                    <span className="truncate text-[11px] text-subtle">
                      {[location, rent].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {picked && (
                    <Check
                      className="size-4 shrink-0 text-accent-soft"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
