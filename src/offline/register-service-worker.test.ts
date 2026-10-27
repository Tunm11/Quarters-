import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readyServiceWorker,
  registerOfflineWorker,
} from "@/offline/register-service-worker";

/** jsdom has no worker container, so stand one in. */
function stubServiceWorker() {
  const registration = { scope: "/" } as unknown as ServiceWorkerRegistration;
  const register = vi.fn(async () => registration);
  const ready = Promise.resolve(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready },
  });
  return { register };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("offline worker registration", () => {
  it("registers after load, in the media-only mode the dev server uses", async () => {
    const { register } = stubServiceWorker();

    registerOfflineWorker();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));

    // Vite runs in development under test, so this is the dev URL. The worker
    // keeps only the photograph cache in this mode; the preview therefore
    // exercises the real caching code instead of waiting for a build.
    expect(register).toHaveBeenCalledWith("/sw.js?mode=dev");
  });

  it("does nothing where the browser has no worker support", () => {
    const listen = vi.spyOn(window, "addEventListener");

    registerOfflineWorker();

    expect("serviceWorker" in navigator).toBe(false);
    expect(listen).not.toHaveBeenCalled();
  });

  it("resolves a controlled worker for push, and null when registration fails", async () => {
    stubServiceWorker();
    await expect(readyServiceWorker()).resolves.toBeTruthy();

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => Promise.reject(new Error("blocked")), ready: Promise.resolve(null) },
    });
    await expect(readyServiceWorker()).resolves.toBeNull();
  });
});
