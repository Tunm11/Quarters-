import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { CrashScreen, NoNetworkScreen } from "@/components/feedback/error-screens";
import { EmptyState } from "@/components/feedback/empty-state";
import { Brand } from "@/components/layout/brand";
import { buttonClasses } from "@/components/ui/button";
import { useOnlineStatus } from "@/offline/use-online-status";

/**
 * Route-level failure UI.
 *
 * A route can fail for two very different reasons, and they need different
 * answers: a dropped connection is fixed by reconnecting, a render bug is fixed
 * by us. The browser's connection state decides which screen the student sees,
 * so an offline tap on a screen that was never cached no longer lands on the
 * generic "this screen did not load" copy.
 */
export function RouteError() {
  const error = useRouteError();
  const online = useOnlineStatus();

  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  if (isNotFound) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-5 py-16">
        <Brand />
        <EmptyState
          title="Page not found"
          description="The page you were looking for does not exist in QUARTERS."
          action={
            <Link to="/" className={buttonClasses({ size: "sm" })}>
              Back home
            </Link>
          }
        />
      </div>
    );
  }

  if (!online) return <NoNetworkScreen />;

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;

  return <CrashScreen details={import.meta.env.DEV ? detail : undefined} />;
}
