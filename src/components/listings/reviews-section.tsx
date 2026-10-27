import { MessageSquareQuote, PenLine, Star, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewSheet } from "@/components/listings/review-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAverageScore,
  formatReviewDate,
  loadListingReviews,
  loadMyReview,
  loadReviewBasis,
  reviewBasisLabels,
  saveListingReview,
  type ListingReview,
  type ListingReviewSummary,
  type ReviewBasis,
} from "@/listings/listing-reviews";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

export type ReviewsSectionProps = {
  listingId: string;
  listingTitle: string;
  /** Null for a signed-out visitor, who can read reviews but not write one. */
  viewerId: string | null;
  /** Sends a signed-out visitor to sign in and back to this listing. */
  onRequireAuth: () => void;
};

const emptySummary: ListingReviewSummary = {
  total: 0,
  average: null,
  distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
};

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={cn(
            "size-3.5",
            value <= rating ? "fill-accent text-accent" : "text-line-strong",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Ratings and reviews for one listing.
 *
 * Who may write one is decided by `listing_review_basis` in the database, the
 * same rule the write enforces — so the button is never shown to an account the
 * insert would refuse. A student without a visit or a reservation still sees
 * every review; they just see why they cannot add one.
 */
export function ReviewsSection({
  listingId,
  listingTitle,
  viewerId,
  onRequireAuth,
}: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<ListingReview[]>([]);
  const [summary, setSummary] = useState<ListingReviewSummary>(emptySummary);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [basis, setBasis] = useState<ReviewBasis | null>(null);
  const [myReview, setMyReview] = useState<ListingReview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setStatus("error");
      setError("Reviews are unavailable because Supabase is not configured.");
      return;
    }

    const request = requestId.current + 1;
    requestId.current = request;
    setStatus((current) => (current === "ready" ? current : "loading"));

    const result = await loadListingReviews(client, listingId);
    if (request !== requestId.current) return;

    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }

    setReviews(result.reviews);
    setSummary(result.summary);
    setError(null);
    setStatus("ready");

    if (!viewerId) {
      setBasis(null);
      setMyReview(null);
      return;
    }

    const [viewerBasis, ownReview] = await Promise.all([
      loadReviewBasis(client, listingId),
      loadMyReview(client, listingId),
    ]);
    if (request !== requestId.current) return;
    setBasis(viewerBasis);
    setMyReview(ownReview);
  }, [listingId, viewerId]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const average = formatAverageScore(summary.average);

  return (
    <section
      aria-labelledby="reviews-heading"
      className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="reviews-heading" className="text-sm font-semibold text-foreground">
            Reviews
          </h2>
          {status === "ready" && summary.total > 0 && average ? (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <Stars rating={Math.round(summary.average ?? 0)} />
              <span className="font-semibold text-foreground">{average}</span>
              <span>
                · {summary.total} review{summary.total === 1 ? "" : "s"}
              </span>
            </p>
          ) : null}
        </div>
        {status === "ready" && basis ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            icon={<PenLine className="size-4" />}
            onClick={() => setSheetOpen(true)}
          >
            {myReview ? "Edit review" : "Write a review"}
          </Button>
        ) : null}
      </div>

      {status === "loading" && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-2.5 rounded-tile border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void reload()}
              className="w-fit rounded-pill border border-line px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <>
          {summary.total > 0 && (
            <ul className="flex flex-col gap-1.5">
              {summary.distribution.map((row) => {
                const share = summary.total > 0 ? row.count / summary.total : 0;
                return (
                  <li key={row.stars} className="flex items-center gap-2 text-[11px]">
                    <span className="w-6 text-subtle tabular-nums">{row.stars}★</span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-panel-raised">
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-subtle tabular-nums">
                      {row.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {reviews.length === 0 ? (
            <div className="flex items-start gap-3 rounded-tile border border-line bg-panel-raised p-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
              >
                <MessageSquareQuote className="size-4" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">No reviews yet</p>
                <p className="text-xs leading-relaxed text-muted">
                  Reviews come from students who visited or reserved a room here.
                  Nothing is written on a provider&apos;s behalf.
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="flex flex-col gap-1.5 rounded-tile border border-line bg-panel-raised p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <Badge tone="accent" className="px-2 py-0.5">
                      {reviewBasisLabels[review.basis]}
                    </Badge>
                    <span className="text-[11px] text-subtle">
                      {formatReviewDate(review.created_at)}
                    </span>
                    {myReview?.id === review.id && (
                      <span className="text-[11px] font-medium text-accent-soft">
                        Your review
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-line text-muted">
                    {review.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {notice && (
            <p role="status" className="text-[11px] text-positive">
              {notice}
            </p>
          )}

          {!viewerId ? (
            <Button variant="ghost" size="sm" className="w-fit" onClick={onRequireAuth}>
              Sign in to review this room
            </Button>
          ) : !basis ? (
            <p className="text-[11px] leading-relaxed text-subtle">
              Only students who completed a visit or reserved a room here can
              review it — that is why the ratings mean something. Book a visit and
              the option opens up afterwards.
            </p>
          ) : null}
        </>
      )}

      {viewerId && basis && (
        <ReviewSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          listingTitle={listingTitle}
          basis={basis}
          existing={myReview}
          onSubmit={async ({ rating, body }) => {
            const client = supabase;
            if (!client) return { error: "Reviews are unavailable right now." };
            return saveListingReview(client, {
              listingId,
              rating,
              body,
              basis,
            });
          }}
          onSaved={() => {
            setNotice(myReview ? "Your review is updated." : "Your review is published.");
            void reload();
          }}
        />
      )}
    </section>
  );
}
