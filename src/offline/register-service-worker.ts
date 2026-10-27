/**
 * Registration for the offline worker.
 *
 * Production builds register `/sw.js` as before. The dev server registers the
 * same file with `?mode=dev`: the worker then leaves the app shell, its modules
 * and every navigation to Vite, and keeps only the signed-photograph cache. That
 * is the piece the shortlist needs offline, and until now it only ever ran in a
 * built app — so it was never exercised while developing.
 */
const WORKER_URL = import.meta.env.DEV ? "/sw.js?mode=dev" : "/sw.js";

export function workerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers after load so the worker never competes with the first paint.
 * Offline support is an enhancement: a refusal (private mode, unsupported
 * browser, blocked worker) is ignored rather than surfaced.
 */
export function registerOfflineWorker(): void {
  if (!workerSupported()) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(WORKER_URL).catch(() => {
      // The app works without a worker; the worker only adds offline copies.
    });
  });
}

/**
 * Registers on demand and resolves once a worker controls this page — used by
 * web push, which needs a live registration before it can subscribe.
 */
export async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!workerSupported()) return null;
  try {
    await navigator.serviceWorker.register(WORKER_URL);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}
