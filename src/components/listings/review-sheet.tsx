import { Star } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  reviewBasisLabels,
  validateReview,
  type ListingReview,
  type ReviewBasis,
} from "@/listings/listing-reviews";

export type ReviewSheetProps = {
  open: boolean;
  onClose: () => void;
  listingTitle: string;
  /** The evidence the reviewer has; it decides the badge shown on the review. */
  basis: ReviewBasis;
  /** An existing review to correct, or null for a first one. */
  existing: ListingReview | null;
  onSubmit: (input: { rating: number; body: string }) => Promise<{ error: string | null }>;
  onSaved: () => void;
};

const starValues = [1, 2, 3, 4, 5];

/**
 * One review per student, editable. The rating is five native radio inputs
 * behind star labels, so arrow keys and screen readers work without a custom
 * keyboard handler, and the focus ring lands on the star that is chosen.
 */
export function ReviewSheet({
  open,
  onClose,
  listingTitle,
  basis,
  existing,
  onSubmit,
  onSaved,
}: ReviewSheetProps) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the sheet starts from the review being corrected, or from an empty
  // draft — never from whatever was last typed for a different room.
  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setBody(existing?.body ?? "");
    setError(null);
    setSaving(false);
  }, [open, existing?.id, existing?.rating, existing?.body]);

  const trimmed = body.trim();
  const clientError = validateReview({ rating, body });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const validation = validateReview({ rating, body });
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onSubmit({ rating, body: trimmed });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? "Edit your review" : "Review this room"}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form="listing-review-form"
            loading={saving}
            disabled={clientError != null}
            className="flex-1"
          >
            {existing ? "Save changes" : "Publish review"}
          </Button>
        </div>
      }
    >
      <form
        id="listing-review-form"
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{listingTitle}</p>
          <p className="text-[11px] text-muted">
            Shown as <span className="text-accent-soft">{reviewBasisLabels[basis]}</span> — the
            badge students see next to your review.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium tracking-wide text-muted">
            Your rating
          </legend>
          <div className="flex items-center gap-1">
            {starValues.map((value) => (
              <label
                key={value}
                className="relative grid size-10 cursor-pointer place-items-center rounded-tile transition-colors hover:bg-panel-raised focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-soft"
              >
                <input
                  type="radio"
                  name="listing-rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  className="sr-only"
                />
                <Star
                  aria-hidden="true"
                  className={cn(
                    "size-7 transition-colors",
                    value <= rating
                      ? "fill-accent text-accent"
                      : "text-subtle",
                  )}
                />
                <span className="sr-only">
                  {value} star{value === 1 ? "" : "s"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="listing-review-body"
            className="text-xs font-medium tracking-wide text-muted"
          >
            Your review
          </label>
          <textarea
            id="listing-review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={REVIEW_BODY_MAX}
            placeholder="What was the room actually like? Mention the condition, the neighbourhood, and whether the costs matched the listing."
            className="w-full resize-none rounded-tile border border-line bg-panel p-4 text-sm leading-relaxed text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
            aria-describedby="listing-review-body-help"
          />
          <div className="flex items-start justify-between gap-3">
            <p id="listing-review-body-help" className="text-[11px] leading-relaxed text-subtle">
              At least {REVIEW_BODY_MIN} characters. Reviews are public and
              anonymous — your name is never shown.
            </p>
            <span className="shrink-0 text-[11px] text-subtle tabular-nums">
              {trimmed.length}/{REVIEW_BODY_MAX}
            </span>
          </div>
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </BottomSheet>
  );
}
