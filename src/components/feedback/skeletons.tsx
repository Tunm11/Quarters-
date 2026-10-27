import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders shaped like the screens they stand in for.
 *
 * A spinner tells you to wait; a skeleton shows what is arriving and reserves
 * the space for it, so the layout does not jump when the data lands. Each block
 * here mirrors a real screen closely enough to be a preview of it.
 */

export function ListingCardsSkeleton({
  count = 3,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
  className,
}: {
  count?: number;
  columns?: string;
  className?: string;
}) {
  return (
    <ul
      aria-hidden="true"
      className={cn("grid list-none gap-4", columns, className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="overflow-hidden rounded-card border border-line bg-panel"
        >
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-6 w-16 rounded-pill" />
              <Skeleton className="h-6 w-14 rounded-pill" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One published room: gallery, title, price panel, details, contact card. */
export function PropertyDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-2xl pb-6"
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none sm:mt-4 sm:rounded-sheet" />
      <div className="mt-4 flex gap-2 px-4 sm:px-6">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="size-16 rounded-tile" />
        ))}
      </div>
      <div className="flex flex-col gap-4 px-4 pt-5 sm:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-7 w-20 rounded-pill" />
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-card border border-line bg-panel p-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="mt-2 h-11 w-full rounded-pill" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
    </div>
  );
}

/** A roommate profile: portrait, name, chips, budget, habits. */
export function RoommateProfileSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-2xl pb-6">
      <Skeleton className="aspect-[4/3] w-full rounded-none sm:mt-4 sm:rounded-sheet" />
      <div className="flex flex-col gap-4 px-4 pt-5 sm:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-16 rounded-tile" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
        <Skeleton className="h-12 w-full rounded-pill" />
      </div>
    </div>
  );
}

/** A form that is loading: photo row, then evenly spaced fields. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-16 rounded-pill" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-9 w-28 rounded-pill" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-11 w-full rounded-tile" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-pill" />
    </div>
  );
}

/** Stacked cards for list rows: title, one or two lines, a trailing tag. */
export function ListRowsSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <ul aria-hidden="true" className={cn("flex list-none flex-col gap-2.5", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="flex items-start gap-3 rounded-tile border border-line bg-panel p-3.5"
        >
          <Skeleton className="size-10 shrink-0 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-pill" />
        </li>
      ))}
    </ul>
  );
}

/** Bubbles for a chat thread: theirs on the left, yours on the right. */
export function ChatThreadSkeleton({ bubbles = 4 }: { bubbles?: number }) {
  return (
    <ul aria-hidden="true" className="flex list-none flex-col gap-2">
      {Array.from({ length: bubbles }, (_, index) => {
        const mine = index % 2 === 1;
        return (
          <li
            key={index}
            className={cn("flex items-end gap-2", mine && "flex-row-reverse")}
          >
            {!mine && <Skeleton className="size-8 shrink-0 rounded-pill" />}
            <div
              className={cn(
                "flex max-w-[78%] flex-col gap-2 rounded-tile border border-line px-3 py-2.5",
                mine ? "bg-accent/10" : "bg-panel-raised",
              )}
            >
              <Skeleton className={cn("h-3", index === 2 ? "w-24" : "w-40")} />
              {index % 3 === 0 && <Skeleton className="h-3 w-32" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
