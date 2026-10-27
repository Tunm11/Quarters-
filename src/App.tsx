import { lazy, useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/auth/auth-provider";
import { RequireAuth } from "@/auth/require-auth";
import { RequireRoommateVerification } from "@/roommates/require-roommate-verification";
import { AppShell } from "@/components/layout/app-shell";
import { RouteError } from "@/components/layout/route-error";
import {
  applyReduceMotionPreference,
  loadDevicePreferences,
} from "@/settings/preferences";

// Home is the root screen of the application itself; secondary routes are
// split out of the main bundle and AppShell renders the shared loading
// fallback while they download.
const HomePage = lazy(() => import("@/pages/home"));
const ExplorePage = lazy(() => import("@/pages/explore"));
const SavedPage = lazy(() => import("@/pages/saved"));
const VisitsPage = lazy(() => import("@/pages/visits"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const RoommatesPage = lazy(() => import("@/pages/roommates"));
const RoommatePage = lazy(() => import("@/pages/roommate"));
const RoommateVerifyPage = lazy(() => import("@/pages/roommate-verify"));
const HowItWorksPage = lazy(() => import("@/pages/how-it-works"));
const AuthPage = lazy(() => import("@/pages/auth"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const AccountPage = lazy(() => import("@/pages/account"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ProviderPage = lazy(() => import("@/pages/provider"));
const PropertyPage = lazy(() => import("@/pages/property"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "explore", element: <ExplorePage /> },
      {
        path: "saved",
        element: (
          <RequireAuth>
            <SavedPage />
          </RequireAuth>
        ),
      },
      {
        path: "visits",
        element: (
          <RequireAuth>
            <VisitsPage />
          </RequireAuth>
        ),
      },
      {
        path: "messages",
        element: (
          <RequireAuth>
            <MessagesPage />
          </RequireAuth>
        ),
      },
      {
        path: "notifications",
        element: (
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        ),
      },
      {
        path: "roommates/verify",
        element: (
          <RequireAuth>
            <RoommateVerifyPage />
          </RequireAuth>
        ),
      },
      {
        path: "roommates",
        element: (
          <RequireAuth>
            <RequireRoommateVerification>
              <RoommatesPage />
            </RequireRoommateVerification>
          </RequireAuth>
        ),
      },
      {
        path: "roommate/:id",
        element: (
          <RequireAuth>
            <RequireRoommateVerification>
              <RoommatePage />
            </RequireRoommateVerification>
          </RequireAuth>
        ),
      },
      { path: "how-it-works", element: <HowItWorksPage /> },
      { path: "auth", element: <AuthPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "property/:id", element: <PropertyPage /> },
      {
        path: "account",
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },
      {
        path: "settings",
        element: (
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        ),
      },
      {
        path: "provider",
        element: (
          <RequireAuth>
            <ProviderPage />
          </RequireAuth>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function DevicePreferenceEffects() {
  useEffect(() => {
    applyReduceMotionPreference(loadDevicePreferences().reduceMotion);
  }, []);
  return null;
}

export function App() {
  return (
    <AuthProvider>
      <DevicePreferenceEffects />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
