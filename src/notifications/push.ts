import type { TypedSupabaseClient } from "@/lib/supabase";
import { readyServiceWorker } from "@/offline/register-service-worker";

/**
 * Web push, browser side.
 *
 * There is no account-level "push on" switch: a subscription belongs to one
 * browser, so this module talks to the local PushManager and mirrors the
 * resulting subscription into `push_subscriptions`. The VAPID public key is
 * build configuration; the private key lives only in the sender's secrets.
 */
export type PushState =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "default"
  | "subscribed"
  | "error";

const USER_AGENT_LIMIT = 300;

function vapidPublicKey(): string | null {
  const configured = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const key = configured?.trim();
  return key ? key : null;
}

/** Push needs a worker, the Push API and the Notification API together. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushConfigured(): boolean {
  return vapidPublicKey() !== null;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/**
 * Push needs a controlled worker. The shell registers it on load, so this only
 * has to cover enabling push before that happened — registering twice is a
 * no-op — and it uses the same URL for the build and the dev preview.
 */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await readyServiceWorker();
  if (!registration) fail("This browser could not start the notification worker.");
  return registration;
}

function fail(message: string): never {
  throw new Error(message);
}

/** What the current browser's push state looks like right now. */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!pushConfigured()) return "unconfigured";
  if (Notification.permission === "denied") return "denied";

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) return "subscribed";
    return "default";
  } catch {
    return "error";
  }
}

function mapSubscriptionError(error: { code?: string; message?: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Push subscriptions are not enabled on this database yet. Apply the web push migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in again to turn on push notifications.";
  }
  return "Could not save this browser for push. Please try again.";
}

export const PUSH_DENIED_MESSAGE =
  "Notifications are blocked for this site. Allow them in your browser settings, then try again.";

/**
 * Asks for permission, subscribes this browser, and records the subscription.
 * A browser that is already subscribed re-saves the same endpoint, so turning
 * push on twice is harmless.
 */
export async function enablePush(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ state: PushState; error: string | null }> {
  if (!pushSupported()) {
    return { state: "unsupported", error: null };
  }

  const key = vapidPublicKey();
  if (!key) {
    return { state: "unconfigured", error: null };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      state: permission === "denied" ? "denied" : "default",
      error: permission === "denied" ? PUSH_DENIED_MESSAGE : "Permission was not granted.",
    };
  }

  try {
    const registration = await readyRegistration();
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));

    const serialized = subscription.toJSON();
    const { error } = await client.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: serialized.keys?.p256dh ?? "",
      auth: serialized.keys?.auth ?? "",
      user_agent:
        typeof navigator.userAgent === "string"
          ? navigator.userAgent.slice(0, USER_AGENT_LIMIT)
          : null,
    });

    // The endpoint is unique: re-enabling an already stored browser is a
    // duplicate, not a failure.
    if (error && error.code !== "23505") {
      return { state: "error", error: mapSubscriptionError(error) };
    }

    return { state: "subscribed", error: null };
  } catch {
    return {
      state: "error",
      error: "Could not subscribe this browser. Please try again.",
    };
  }
}

/** Unsubscribes this browser and removes its stored endpoint. */
export async function disablePush(
  client: TypedSupabaseClient,
): Promise<{ state: PushState; error: string | null }> {
  if (!pushSupported()) return { state: "unsupported", error: null };

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint ?? null;

    if (subscription) await subscription.unsubscribe();

    if (endpoint) {
      const { error } = await client
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);
      if (error) {
        return { state: "subscribed", error: mapSubscriptionError(error) };
      }
    }

    return { state: "default", error: null };
  } catch {
    return {
      state: "error",
      error: "Could not turn push off on this browser. Please try again.",
    };
  }
}

/** The status line under the toggle, kept next to the states it describes. */
export function pushStateDescription(state: PushState): string {
  switch (state) {
    case "loading":
      return "Checking this browser…";
    case "subscribed":
      return "On for this browser. Activity arrives even when the app is closed.";
    case "default":
      return "Get notified about interests, visits and room decisions, even when the app is closed.";
    case "denied":
      return "Blocked in this browser. Allow notifications for this site, then come back.";
    case "unconfigured":
      return "Push is not configured for this build.";
    case "unsupported":
      return "This browser cannot receive push. On iPhone, add QUARTERS to your Home Screen first.";
    case "error":
      return "Push status could not be read. Reload to try again.";
    default:
      return "";
  }
}
