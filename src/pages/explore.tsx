import { Check, Compass, Info, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

const cities = ["Lagos", "Ibadan", "Abuja", "Enugu", "Port Harcourt"];
const roomTypes = ["Single room", "Shared room", "Self-contained", "Hostel bed"];

function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-xs font-medium transition-colors",
        active
          ? "border-accent/50 bg-accent/15 text-accent-soft"
          : "border-line bg-panel/60 text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      {active && <Check className="size-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<string | null>(null);

  const hasFilters = query.trim().length > 0 || city !== null || roomType !== null;

  function resetFilters() {
    setQuery("");
    setCity(null);
    setRoomType(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Explore rooms</h1>
          <Badge tone="accent">Preview</Badge>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          This is the shape of QUARTERS: a search field, filters, and room
          results. Listings are not connected to a data source yet, so the
          results area is honestly empty.
        </p>
      </div>

      <Panel className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Search rooms"
              placeholder="Try a campus, area, or room type"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              icon={<Search className="size-4" />}
              className="flex-1"
              description="Search is UI-ready but not connected to any listings yet."
            />
            {hasFilters && (
              <IconButton
                label="Clear all filters"
                variant="outline"
                onClick={resetFilters}
                className="mb-6"
              >
                <X className="size-4" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-subtle uppercase">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Filters
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-medium text-muted">City</legend>
            <div className="flex flex-wrap gap-2">
              {cities.map((option) => (
                <FilterChip
                  key={option}
                  label={option}
                  active={city === option}
                  onToggle={() => setCity(city === option ? null : option)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-medium text-muted">Room type</legend>
            <div className="flex flex-wrap gap-2">
              {roomTypes.map((option) => (
                <FilterChip
                  key={option}
                  label={option}
                  active={roomType === option}
                  onToggle={() => setRoomType(roomType === option ? null : option)}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </Panel>

      <section aria-labelledby="results-heading" className="mt-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="text-lg font-semibold">
            Results
          </h2>
          <Badge tone="outline">0 rooms loaded</Badge>
        </div>

        <EmptyState
          icon={Compass}
          title={hasFilters ? "No rooms match those filters" : "No listings yet"}
          description={
            hasFilters
              ? "Your filters are applied to an empty result set. QUARTERS has no rooms loaded in this build, so nothing can match yet."
              : "Real rooms will appear here once the listings foundation is connected. Until then this screen stays deliberately empty."
          }
          action={
            <>
              <Link to="/how-it-works" className={buttonClasses({ size: "sm" })}>
                <Info className="size-4" aria-hidden="true" />
                What is coming
              </Link>
              {hasFilters && (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              )}
            </>
          }
          note="No placeholder or sample listings are shown anywhere in QUARTERS."
        />
      </section>
    </div>
  );
}
