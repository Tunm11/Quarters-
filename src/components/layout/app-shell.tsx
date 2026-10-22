import { Suspense } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { LoadingState } from "@/components/feedback/loading-state";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <SiteHeader />

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

      <SiteFooter />
      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
