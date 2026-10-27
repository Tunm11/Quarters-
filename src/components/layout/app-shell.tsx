import { Suspense } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { LoadingState } from "@/components/feedback/loading-state";
import { OfflineBanner } from "@/components/feedback/offline-banner";
import { BottomNav } from "@/components/layout/bottom-nav";
import { RecoveryRedirect } from "@/auth/recovery-redirect";

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <RecoveryRedirect />
      <OfflineBanner />

      <main id="main" className="flex-1">
        <Suspense
          fallback={
            <LoadingState
              variant="page"
              label="Loading QUARTERS"
              description="Fetching this screen"
              className="mx-auto w-full max-w-6xl px-5"
            />
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
