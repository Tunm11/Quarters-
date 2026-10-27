/*
 * Exercises the shipped service worker against a real production build.
 *
 * Why this exists: `public/sw.js` is copied verbatim into `dist/`, so no bundler
 * or unit test ever runs the file that ships. The worker also only registers in a
 * production build, which meant its shell precache and its signed-photograph
 * cache were reasoned about but never executed. This script reads the built
 * `dist/sw.js`, boots it in a simulated service-worker global, serves the network
 * from `dist/`, and then takes the network away.
 *
 * Checks:
 *   - install precaches the shell and every fingerprinted asset the built HTML
 *     names (a renamed chunk or a missing icon fails here);
 *   - a navigation with no network returns the built shell;
 *   - a signed Storage photograph is served from cache, refreshed in the
 *     background while online, and still shown after the network is gone;
 *   - database traffic is never intercepted.
 *
 * Usage: bun run build && bun scripts/verify-offline-worker.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ORIGIN = "https://quarters.example";
const PHOTO =
  "https://abcdefgh.supabase.co/storage/v1/object/sign/listing-photos/room-1.jpg?token=t";
const REST = "https://abcdefgh.supabase.co/rest/v1/saved_listings?select=listing_id";

const SHELL_CACHE = "quarters-shell-v2";
const MEDIA_CACHE = "quarters-media-v1";

const failures = [];
const passed = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed.push(name);
    return;
  }
  failures.push(detail ? `${name} — ${detail}` : name);
}

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!existsSync(join(DIST, "sw.js"))) {
  die("No dist/sw.js. Run `bun run build` first so the script has a worker to exercise.");
}

const workerSource = readFileSync(join(DIST, "sw.js"), "utf8");
const shellHtml = readFileSync(join(DIST, "index.html"), "utf8");

/** Serves `dist/` the way a static host would, or rejects when "offline". */
function createNetwork() {
  let online = true;
  const reads = [];

  const respond = async (url) => {
    reads.push(url);
    if (!online) throw new TypeError("Failed to fetch");

    if (url.startsWith(ORIGIN)) {
      const path = new URL(url).pathname;
      const file =
        path === "/" || path === "/index.html"
          ? join(DIST, "index.html")
          : join(DIST, path);
      if (!file.startsWith(DIST)) return new Response("forbidden", { status: 403 });
      if (existsSync(file)) return new Response(readFileSync(file), { status: 200 });
      // The static host serves the app shell for any extensionless route.
      if (extname(path) === "") return new Response(shellHtml, { status: 200 });
      return new Response("missing", { status: 404 });
    }

    if (url.includes("/storage/v1/object/sign/")) {
      const read = reads.filter((entry) => entry === url).length;
      return new Response(`photo-${read}`, { status: 200 });
    }

    return new Response("{}", { status: 200 });
  };

  return {
    fetch: (input) =>
      respond(typeof input === "string" ? new URL(input, ORIGIN).href : input.url),
    reads,
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
  };
}

/** The slice of the Cache API the worker uses. */
function createCacheStorage(fetcher) {
  const stores = new Map();
  const absolute = (input) =>
    typeof input === "string" ? new URL(input, ORIGIN).href : input.url;

  const open = async (name) => {
    if (stores.has(name)) return stores.get(name);
    const entries = new Map();
    const cache = {
      entries,
      match: async (input) => entries.get(absolute(input))?.clone(),
      put: async (input, response) => void entries.set(absolute(input), response.clone()),
      delete: async (input) => entries.delete(absolute(input)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      addAll: async (urls) => {
        for (const url of urls) {
          const response = await fetcher(new URL(url, ORIGIN).href);
          if (!response.ok) throw new Error(`precache failed for ${url}`);
          await cache.put(url, response);
        }
      },
    };
    stores.set(name, cache);
    return cache;
  };

  return {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    keysOf: async (name) => [...(stores.get(name)?.entries.keys() ?? [])],
  };
}

function bootWorker() {
  const network = createNetwork();
  const caches = createCacheStorage(network.fetch);
  const handlers = new Map();

  const self = {
    location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
    addEventListener: (type, handler) => {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async () => null,
    },
    registration: { showNotification: async () => {} },
  };

  // Same entry point as the browser's worker scope.
  new Function("self", "caches", "fetch", "Response", "URL", workerSource)(
    self,
    caches,
    network.fetch,
    Response,
    URL,
  );

  async function dispatch(type, request) {
    let responded;
    const waits = [];
    const event = {
      request,
      waitUntil: (promise) => void waits.push(promise),
      respondWith: (promise) => void (responded = promise),
    };
    for (const handler of handlers.get(type) ?? []) handler(event);
    await Promise.all(waits);
    return responded;
  }

  return {
    network,
    caches,
    install: async () => {
      await dispatch("install");
      await dispatch("activate");
    },
    navigate: (path) =>
      dispatch("fetch", {
        url: new URL(path, ORIGIN).href,
        method: "GET",
        mode: "navigate",
      }),
    get: (url) => dispatch("fetch", { url, method: "GET", mode: "cors" }),
  };
}

const worker = bootWorker();

console.log("Booting dist/sw.js against dist/ …");
await worker.install();

const shellKeys = await worker.caches.keysOf(SHELL_CACHE);
for (const required of [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]) {
  check(
    `shell cached: ${required}`,
    shellKeys.includes(new URL(required, ORIGIN).href),
  );
}

const referenced = [
  ...shellHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
].map((match) => new URL(match[1], ORIGIN).href);
check("built HTML names fingerprinted assets", referenced.length > 0);
for (const asset of referenced) {
  check(
    `fingerprinted asset cached: ${new URL(asset).pathname}`,
    shellKeys.includes(asset),
  );
}

// A navigation with no network must open the built shell.
worker.network.goOffline();
const offlineNavigation = await worker.navigate("/saved");
check("offline navigation responds", offlineNavigation !== undefined);
if (offlineNavigation) {
  check("offline navigation is the built shell", (await offlineNavigation.text()) === shellHtml);
}

// The photograph cache, which is the reason the worker runs in the dev preview.
worker.network.goOnline();
const first = await worker.get(PHOTO);
check("photograph read online", (await first?.text()) === "photo-1");
const second = await worker.get(PHOTO);
check("second read is the cached photograph", (await second?.text()) === "photo-1");
await new Promise((resolve) => setTimeout(resolve, 0));
const photoReads = worker.network.reads.filter((url) => url === PHOTO).length;
check(
  "cached read refreshes in the background",
  photoReads === 2,
  `network reads: ${photoReads}`,
);
worker.network.goOffline();
const offlinePhoto = await worker.get(PHOTO);
check(
  "photograph served with no network",
  /^photo-\d+$/.test((await offlinePhoto?.text()) ?? ""),
);
check("photograph cached", (await worker.caches.keysOf(MEDIA_CACHE)).length === 1);

const rest = await worker.get(REST);
check("database traffic is not intercepted", rest === undefined);

console.log(`\n${passed.length} checks passed`);
for (const name of passed) console.log(`  ✓ ${name}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  for (const name of failures) console.error(`  ✖ ${name}`);
  process.exit(1);
}

console.log("\nThe shipped worker precaches the build, opens offline and keeps photographs.\n");
