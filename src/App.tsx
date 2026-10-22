import { lazy } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/auth/auth-provider";
import { RequireAuth } from "@/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { RouteError } from "@/components/layout/route-error";
import LandingPage from "@/pages/landing";

// Secondary routes are split out of the landing bundle; AppShell renders the
// shared loading fallback while they download.
const ExplorePage = lazy(() => import("@/pages/explore"));
const HowItWorksPage = lazy(() => import("@/pages/how-it-works"));
const AuthPage = lazy(() => import("@/pages/auth"));
const AccountPage = lazy(() => import("@/pages/account"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "explore", element: <ExplorePage /> },
      { path: "how-it-works", element: <HowItWorksPage /> },
      { path: "auth", element: <AuthPage /> },
      {
        path: "account",
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
