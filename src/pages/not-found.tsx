import { Compass, House } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/feedback/empty-state";
import { buttonClasses } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      <EmptyState
        icon={Compass}
        title="This page is not a room"
        description="The address you opened does not exist in QUARTERS. It may have moved, or it may not be built yet."
        action={
          <>
            <Link to="/" className={buttonClasses({ size: "sm" })}>
              <House className="size-4" aria-hidden="true" />
              Back home
            </Link>
            <Link
              to="/explore"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <Compass className="size-4" aria-hidden="true" />
              Open Explore
            </Link>
          </>
        }
      />
    </div>
  );
}
