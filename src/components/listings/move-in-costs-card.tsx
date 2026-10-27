import { Info, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeMoveInCosts,
  formatNaira,
  type ListingCostFields,
} from "@/listings/move-in-costs";

export type MoveInCostsCardProps = {
  listing: ListingCostFields;
  /** Opens the provider chat, for the costs they have not stated. */
  onAskProvider?: () => void;
};

/**
 * The full price of moving in, itemised.
 *
 * The rent headline alone hides an agency fee, a caution deposit and utilities.
 * Every line the provider stated is shown with its own amount and period; every
 * line they left out is named, and the total is labelled "at least" so a student
 * is never told a lower bound is the whole bill.
 */
export function MoveInCostsCard({ listing, onAskProvider }: MoveInCostsCardProps) {
  const costs = computeMoveInCosts(listing);

  if (!costs.hasAny) {
    return (
      <section
        aria-labelledby="costs-heading"
        className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel"
      >
        <h2 id="costs-heading" className="text-sm font-semibold text-foreground">
          Move-in costs
        </h2>
        <div className="flex items-start gap-3 rounded-tile border border-line bg-panel-raised p-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
          >
            <Wallet className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              The provider has not broken down the costs
            </p>
            <p className="text-xs leading-relaxed text-muted">
              No rent, agency fee, caution deposit or utilities figure is listed.
              Ask before you pay anything — especially before a transfer.
            </p>
          </div>
        </div>
        {onAskProvider && (
          <Button variant="secondary" size="sm" className="w-fit" onClick={onAskProvider}>
            Ask the provider
          </Button>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="costs-heading"
      className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="costs-heading" className="text-sm font-semibold text-foreground">
          Move-in costs
        </h2>
        <span className="text-[10px] tracking-[0.14em] text-subtle uppercase">
          {costs.unstated.length === 0 ? "Complete" : "Partly stated"}
        </span>
      </div>

      <dl className="flex flex-col gap-2">
        {costs.lines.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0">
              <span className="text-xs font-medium text-foreground">{line.label}</span>
              {line.note && (
                <span className="ml-1.5 text-[11px] text-subtle">{line.note}</span>
              )}
            </dt>
            <dd
              className={
                line.stated
                  ? "shrink-0 text-xs font-medium text-foreground tabular-nums"
                  : "shrink-0 text-xs text-subtle"
              }
            >
              {line.amount != null ? formatNaira(line.amount) : "Not stated"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
        <p className="text-xs font-semibold text-foreground">
          {costs.unstated.length === 0 ? "Total at move-in" : "At least"}
        </p>
        <p className="text-base font-semibold text-foreground tabular-nums">
          {costs.total != null ? formatNaira(costs.total) : "Rent not stated"}
        </p>
      </div>

      {costs.utilitiesExcluded && costs.lines.some((line) => line.id === "utilities" && line.stated) && (
        <p className="text-[10px] leading-relaxed text-subtle">
          Utilities are charged on a different period from the rent, so they are
          shown separately rather than added to the total.
        </p>
      )}

      {costs.unstated.length > 0 && (
        <p className="flex items-start gap-2 rounded-tile border border-line bg-panel-raised px-3 py-2 text-[11px] leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent-soft" aria-hidden="true" />
          <span>
            The provider has not stated {costs.unstated.join(", ").toLowerCase()}.
            Ask before you commit — these are payable on top of the rent shown.
          </span>
        </p>
      )}
    </section>
  );
}
