import { Component, type ErrorInfo, type ReactNode } from "react";
import { CrashScreen, NoNetworkScreen } from "@/components/feedback/error-screens";
import { looksLikeNetworkFailure } from "@/lib/network-error";

/**
 * The last line of defence against a blank screen.
 *
 * React unmounts the whole tree when a render throws, which used to leave a
 * white page with nothing to act on. This catches that throw at the root and
 * renders a real screen instead: the network screen when the connection is
 * gone, the crash screen otherwise. It sits outside the router so it also
 * covers a failure while the router is being created.
 *
 * Error boundaries only catch render, lifecycle and lazy-load errors — event
 * handlers and promises still need their own handling, which the individual
 * screens already do.
 */

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: unknown;
  failed: boolean;
};

function describe(error: unknown): string | undefined {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  return undefined;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // No crash-reporting service is wired up yet. Until one is, keep the trace
    // in the console so it can be recovered from the user's own browser.
    console.error("QUARTERS crashed while rendering", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, failed } = this.state;
    if (!failed) return this.props.children;

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline && looksLikeNetworkFailure(error)) {
      return <NoNetworkScreen onRetry={this.handleReload} />;
    }

    return (
      <CrashScreen
        onReload={this.handleReload}
        details={import.meta.env.DEV ? describe(error) : undefined}
      />
    );
  }
}
