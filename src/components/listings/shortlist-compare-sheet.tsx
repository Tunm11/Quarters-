import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/cn";
import {
  buildComparison,
  MAX_COMPARE,
  MIN_COMPARE,
} from "@/listings/compare-listings";
import type { PublicListing } from "@/listings/public-listings";

export type ShortlistCompareSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The rooms to compare, in the order the viewer picked them. */
  listings: PublicListing[];
};

/**
 * The shortlist side by side: one column per room, one row per fact. Facts the
 * lister did not state read "Not stated" rather than being left blank, so a gap
 * is visible instead of being mistaken for a preference.
 */
export function ShortlistCompareSheet({
  open,
  onClose,
  listings,
}: ShortlistCompareSheetProps) {
  const comparison = useMemo(() => buildComparison(listings), [listings]);
  const count = listings.length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="tall"
      title={count > 0 ? `Compare ${count} rooms` : "Compare rooms"}
      footer={
        <p className="text-[11px] leading-relaxed text-subtle">
          Pick up to {MAX_COMPARE} rooms from your shortlist — {MIN_COMPARE} is the
          fewest that compares anything. These are the published details, not a
          booking or a hold.
        </p>
      }
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full border-collapse text-left align-top">
          <caption className="sr-only">
            Side-by-side comparison of your shortlisted rooms
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-20 bg-panel pr-2 pb-2 text-[10px] font-medium tracking-[0.14em] text-subtle uppercase"
              >
                Room
              </th>
              {listings.map((listing) => (
                <th
                  key={listing.id}
                  scope="col"
                  className="min-w-[9.5rem] px-2 pb-2 align-bottom"
                >
                  <Link
                    to={`/property/${listing.id}`}
                    className="flex flex-col gap-1.5 transition-colors hover:text-accent-soft"
                  >
                    <span className="block aspect-[4/3] w-full overflow-hidden rounded-tile border border-line bg-panel-raised">
                      {listing.cover_image_url ? (
                        <Photo
                          src={listing.cover_image_url}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="block size-full bg-sand-wash" />
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-snug font-semibold text-foreground">
                      {listing.title}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-panel py-2.5 pr-2 align-top text-[11px] leading-snug font-medium text-subtle"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => {
                  const cheapest =
                    row.key === "rent" && comparison.cheapestIndex === index;
                  return (
                    <td
                      key={listings[index]?.id ?? index}
                      className={cn(
                        "px-2 py-2.5 align-top text-[11px] leading-snug text-foreground",
                        value === null && "text-subtle",
                      )}
                    >
                      {value ?? "Not stated"}
                      {cheapest && value !== null && (
                        <span className="mt-1 block w-fit rounded-pill border border-accent/35 bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent-soft">
                          Lowest
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BottomSheet>
  );
}
