import {
  BookOpen,
  Car,
  Check,
  CookingPot,
  Droplets,
  ShieldCheck,
  Snowflake,
  Sofa,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Facilities are free text in `public.listings.facilities`, so icons are picked
 * by keyword and anything unrecognised falls back to a neutral tick. Nothing
 * is invented: the label always comes from the stored value.
 */
const iconRules: { pattern: RegExp; icon: LucideIcon }[] = [
  { pattern: /wi-?fi|internet|broadband/i, icon: Wifi },
  { pattern: /water|borehole|tap/i, icon: Droplets },
  { pattern: /power|electric|meter|generator|inverter|solar/i, icon: Zap },
  { pattern: /security|guard|gated|cctv|safe/i, icon: ShieldCheck },
  { pattern: /kitchen|cooking|utensil/i, icon: CookingPot },
  { pattern: /study|reading|library/i, icon: BookOpen },
  { pattern: /laundry|washing|dryer/i, icon: WashingMachine },
  { pattern: /air ?con|ac\b|cooling|fan/i, icon: Snowflake },
  { pattern: /parking|garage/i, icon: Car },
  { pattern: /furnish|sofa|furniture/i, icon: Sofa },
];

export function facilityIconFor(facility: string): LucideIcon {
  return (
    iconRules.find((rule) => rule.pattern.test(facility))?.icon ?? Check
  );
}

export type FacilityIconChipProps = {
  facility: string;
  /** `overlay` sits on photography; `panel` sits on a light card surface. */
  tone?: "panel" | "overlay";
  className?: string;
};

/**
 * Icon-only amenity marker. The stored facility name stays available to screen
 * readers and as a hover title, so the meaning is never lost by dropping the
 * visible label.
 */
export function FacilityIconChip({
  facility,
  tone = "panel",
  className,
}: FacilityIconChipProps) {
  const Icon = facilityIconFor(facility);

  return (
    <span
      role="img"
      aria-label={facility}
      title={facility}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-pill border",
        tone === "panel"
          ? "border-line bg-panel-raised text-muted"
          : "border-white/25 bg-white/10 text-[#f6f3e8]",
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}
