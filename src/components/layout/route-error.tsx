import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { ErrorState } from "@/components/feedback/error-state";
import { Brand } from "@/components/layout/brand";
import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Route-level failure UI. Stays inside the app's visual language and reports
 * exactly what happened instead of rendering a blank screen.
 */
export function RouteError() {
  const error = useRouteError();

  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  const title = isNotFound ? "Page not found" : "This screen did not load";
  const description = isNotFound
    ? "The page you were looking for does not exist in QUARTERS."
    : "Something interrupted this screen. You can reload or head back home; nothing was saved.";

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-5 py-16">
      <Brand />
      <ErrorState
        title={title}
        description={description}
        details={import.meta.env.DEV ? detail : undefined}
        action={
          <>
            <Link to="/" className={buttonClasses({ size: "sm" })}>
              Back home
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </>
        }
      />
      <p className="text-xs text-subtle">
        If this keeps happening, the route could not render. No data was
        changed.
      </p>
    </div>
  );
}
