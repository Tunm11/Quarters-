import { GraduationCap, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListingMiniCard } from "@/components/listings/listing-mini-card";
import type { CampusGroup } from "@/listings/listing-sort";
import { formatRentShort } from "@/listings/public-listings";
import { cn } from "@/lib/cn";

/** How many areas a campus group lists before it summarises the rest. */
const AREA_LIMIT = 5;

export type NearCampusViewProps = {
  /** Results already grouped by campus, the student's own campus first. */
  groups: CampusGroup[];
  /** The campus the student chose, so its group can be marked as theirs. */
  campus: string | null;
  /** Narrows the catalogue to one campus by searching for it. */
  onFocusCampus: (campus: string) => void;
};

/**
 * The near-campus view: the same published rooms, grouped under the campus each
 * one names rather than listed flat.
 *
 * Distance is not plotted because a listing stores the campus it is near, not
 * coordinates — so this view is honest about what it knows: which campus, which
 * area, and the cheapest stated rent. Nothing here invents a pin or a metre.
 */
export function NearCampusView({ groups, campus, onFocusCampus }: NearCampusViewProps) {
  return (
    <div role="region" aria-label="Near campus view" className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-subtle">
        Grouped by the campus each room names. Pick your campus to bring it to the
        top; plotted distances arrive once listings carry coordinates.
      </p>

      <ol className="flex list-none flex-col gap-3">
        {groups.map((group) => {
          const mine =
            campus != null &&
            !group.unstated &&
            group.name.trim().toLowerCase() === campus.trim().toLowerCase();
          const roomCount = `${group.listings.length} ${
            group.listings.length === 1 ? "room" : "rooms"
          }`;
          const shownAreas = group.neighbourhoods.slice(0, AREA_LIMIT);
          const extraAreas = group.neighbourhoods.length - shownAreas.length;

          return (
            <li key={group.name}>
              <section
                aria-label={`Rooms near ${group.name}`}
                className={cn(
                  "flex flex-col gap-3 rounded-card border bg-panel p-4 shadow-panel",
                  mine ? "border-accent/45" : "border-line",
                )}
              >
                <header className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-tile border",
                      mine
                        ? "border-accent/40 bg-accent/12 text-accent-soft"
                        : "border-line bg-canvas-soft text-accent-soft",
                    )}
                  >
                    <GraduationCap className="size-5" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="min-w-0 text-sm font-semibold text-balance text-foreground">
                        {group.name}
                      </h3>
                      {mine && <Badge tone="accent">Your campus</Badge>}
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                      {roomCount}
                      {group.neighbourhoods.length > 0 &&
                        ` · ${group.neighbourhoods.length} ${
                          group.neighbourhoods.length === 1 ? "area" : "areas"
                        }`}
                    </p>
                  </div>

                  {group.minRent != null && (
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] tracking-[0.14em] text-subtle uppercase">
                        From
                      </span>
                      <span className="block text-xs font-semibold text-foreground">
                        {formatRentShort(group.minRent)}
                      </span>
                    </span>
                  )}
                </header>

                {shownAreas.length > 0 && (
                  <ul
                    aria-label={`Areas near ${group.name}`}
                    className="flex list-none flex-wrap gap-1.5"
                  >
                    {shownAreas.map((area) => (
                      <li key={area}>
                        <span className="inline-flex rounded-pill border border-line bg-panel-raised px-2 py-0.5 text-[10px] font-medium text-muted">
                          {area}
                        </span>
                      </li>
                    ))}
                    {extraAreas > 0 && (
                      <li className="self-center text-[10px] font-medium text-subtle">
                        +{extraAreas} more
                      </li>
                    )}
                  </ul>
                )}

                {!group.unstated && (
                  <button
                    type="button"
                    onClick={() => onFocusCampus(group.name)}
                    aria-label={`Show only rooms near ${group.name}`}
                    className="self-start rounded-pill border border-line bg-panel-raised px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                  >
                    {`Show only these ${group.listings.length}`}
                  </button>
                )}

                <ul className="flex list-none flex-col">
                  {group.listings.map((listing) => (
                    <li key={listing.id}>
                      <ListingMiniCard listing={listing} />
                    </li>
                  ))}
                </ul>
              </section>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
