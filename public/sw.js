/*
 * QUARTERS service worker.
 *
 * Goal: the installed app opens instantly, shows its shell offline, and keeps
 * the photographs of the rooms and threads the app cached data for.
 * Deliberately narrow:
 *   - only GET requests are touched;
 *   - database/API traffic is never cached: the app keeps its own offline copies
 *     of the shortlist and inbox, so a stale REST response can never be mistaken
 *     for a fresh one;
 *   - the one cross-origin exception is signed Storage photographs, which are
 *     served from cache first and refreshed in the background. Without this the
 *     cards in an offline shortlist would have no pictures: the app cannot mint
 *     a new signed URL without the network;
 *   - navigation is network-first with a cached shell fallback;
 *   - fingerprinted /assets files and the icons are cache-first.
 *
 * The worker also runs against the dev server, registered as /sw.js?mode=dev.
 * In that mode it owns nothing but the signed-photograph cache: the dev shell is
 * served by Vite from /src, is not fingerprinted, and must never be cached, so
 * navigations and same-origin assets are passed straight through. That is what
 * lets the media cache be exercised in the preview instead of only in a build.
 */

const CACHE_NAME = "quarters-shell-v2";
const MEDIA_CACHE = "quarters-media-v1";

/** Registered by the dev server; production registers the bare /sw.js. */
const IS_DEV = new URL(self.location.href).searchParams.get("mode") === "dev";

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

async function precacheShell() {
  // Vite serves the dev app from /src with no fingerprints, so there is no
  // stable shell to keep; caching it would pin a module graph across reloads.
  if (IS_DEV) return;

  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_URLS);

  // Vite fingerprints the entry chunks, so read the built HTML and cache the
  // exact files it references. Route chunks are cached as they get visited.
  try {
    const response = await fetch("/index.html", { cache: "reload" });
    if (!response.ok) return;

    const html = await response.text();
    const assets = new Set(
      [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]),
    );

    await Promise.all(
      [...assets].map(async (url) => {
        const asset = await fetch(url);
        if (asset.ok) await cache.put(url, asset);
      }),
    );
  } catch {
    // The shell above is still enough to open the app; assets fill in on use.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, MEDIA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Every route is served the same shell by the static host.
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match("/index.html")) ?? (await cache.match("/"));
    return cached ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Signed Storage photographs: cache first, refreshed in the background.
 *
 * A signed URL is tied to a token that expires, so a cached response can outlive
 * its token — which is exactly what is wanted offline. Online, the next read of
 * the same URL quietly stores the current bytes again.
 */
async function mediaFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    fetch(request)
      .then((response) => {
        if (response.ok) return cache.put(request, response.clone());
      })
      .catch(() => {
        // Offline: the cached copy stands.
      });
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    // Keep the cache bounded so a long browsing session cannot fill the device.
    (async () => {
      const keys = await cache.keys();
      if (keys.length >= 120) await cache.delete(keys[0]);
      await cache.put(request, copy);
    })().catch(() => {});
  }
  return response;
}

/** A signed object in the project's private Storage buckets. */
function isSignedStorageUrl(url) {
  return (
    url.pathname.includes("/storage/v1/object/sign/") &&
    /(^|\.)supabase\.(co|in)$/.test(url.hostname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isSignedStorageUrl(url)) {
    event.respondWith(mediaFirst(request));
    return;
  }

  // Dev: Vite owns the shell, the modules and every navigation.
  if (IS_DEV) return;

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");
  if (isStaticAsset || url.pathname === "/favicon.svg") {
    event.respondWith(cacheFirst(request));
  }
});

/*
 * Web push. The sender posts one message per subscription; everything the
 * notification needs (title, body, destination) arrives in the payload, so the
 * worker never has to call the network to render it.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "QUARTERS";
  const url = typeof payload.href === "string" && payload.href.startsWith("/")
    ? payload.href
    : "/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.id || payload.kind || undefined,
      data: { url },
    }),
  );
});

/*
 * Clicking the notification focuses the app when it is already open (on that
 * route or not) and otherwise opens it at the right screen.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/notifications",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const exact = windows.find((client) => client.url === target);
      if (exact) return exact.focus();

      const open = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(target);
        return;
      }

      return self.clients.openWindow(target);
    })(),
  );
});
