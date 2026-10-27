// @vitest-environment node
/*
 * The offline worker is a classic script in `public/`, so no bundler ever runs it
 * and, until now, only `node --check` touched it: the photograph cache had never
 * been executed. This file boots the real `public/sw.js` in a simulated
 * service-worker global — an in-memory Cache API and a network that can be taken
 * away — and drives its install, activate and fetch handlers. The point is to
 * exercise the code that runs in the browser, not a copy of its rules.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://quarters.example";
const SIGNED_PHOTO =
  "https://abcdefgh.supabase.co/storage/v1/object/sign/listing-photos/room-1.jpg?token=t";
const REST = "https://abcdefgh.supabase.co/rest/v1/saved_listings?select=listing_id";

const SHELL_CACHE = "quarters-shell-v2";
const MEDIA_CACHE = "quarters-media-v1";

const SOURCE = readFileSync(
  fileURLToPath(new URL("../../public/sw.js", import.meta.url)),
  "utf8",
);

const SHELL_HTML = [
  "<!doctype html><html><head>",
  '<link rel="stylesheet" href="/assets/index-abc.css">',
  "</head><body>",
  '<div id="root" data-route="shell"></div>',
  '<script type="module" src="/assets/index-abc.js"></script>',
  "</body></html>",
].join("");

type FakeRequest = { url: string; method: string; mode: string };
type FetchSource = string | FakeRequest;

const absolute = (url: string) => new URL(url, ORIGIN).href;
const keyOf = (input: FetchSource) =>
  typeof input === "string" ? absolute(input) : input.url;

/** The slice of the Cache API the worker uses, backed by a Map. */
class MemoryCache {
  readonly entries = new Map<string, Response>();

  constructor(private readonly fetcher: (input: FetchSource) => Promise<Response>) {}

  async match(input: FetchSource): Promise<Response | undefined> {
    return this.entries.get(keyOf(input))?.clone();
  }

  async put(input: FetchSource, response: Response): Promise<void> {
    this.entries.set(keyOf(input), response.clone());
  }

  async delete(input: FetchSource): Promise<boolean> {
    return this.entries.delete(keyOf(input));
  }

  /** The worker only ever looks at the oldest key. */
  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }

  async addAll(urls: readonly string[]): Promise<void> {
    for (const url of urls) {
      const response = await this.fetcher(absolute(url));
      if (!response.ok) throw new Error(`precache failed for ${url}`);
      await this.put(absolute(url), response);
    }
  }

  async add(url: string): Promise<void> {
    await this.addAll([url]);
  }
}

/**
 * Boots `public/sw.js`. `mode: "dev"` boots it the way the dev server registers
 * it (`?mode=dev`); `photo` lets a test change the bytes on each network read.
 */
function bootWorker({
  mode,
  photo,
}: { mode?: "dev"; photo?: (read: number) => Response } = {}) {
  const handlers = new Map<string, ((event: never) => void)[]>();
  const calls: string[] = [];
  const stores = new Map<string, MemoryCache>();
  let online = true;
  let photoReads = 0;

  const fetcher = async (input: FetchSource): Promise<Response> => {
    const url = keyOf(input);
    calls.push(url);

    if (!online) throw new TypeError("Failed to fetch");

    if (url.startsWith(ORIGIN)) {
      const path = new URL(url).pathname;
      if (path === "/" || path === "/index.html" || path === "/saved") {
        return new Response(SHELL_HTML, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (path === "/manifest.webmanifest") return new Response("{}", { status: 200 });
      if (path.startsWith("/assets/")) return new Response("asset", { status: 200 });
      if (path.startsWith("/icons/") || path === "/favicon.svg") {
        return new Response("icon", { status: 200 });
      }
      return new Response("missing", { status: 404 });
    }

    if (url.includes("/storage/v1/object/sign/")) {
      photoReads += 1;
      return photo ? photo(photoReads) : new Response(`photo-${photoReads}`, { status: 200 });
    }

    return new Response("{}", { status: 200 });
  };

  const cachesApi = {
    async open(name: string) {
      const existing = stores.get(name);
      if (existing) return existing;
      const store = new MemoryCache(fetcher);
      stores.set(name, store);
      return store;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };

  const self = {
    location: {
      href: `${ORIGIN}/sw.js${mode === "dev" ? "?mode=dev" : ""}`,
      origin: ORIGIN,
    },
    addEventListener: (type: string, handler: (event: never) => void) => {
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

  // Same entry point as the browser's worker scope: the script is evaluated once
  // and registers its handlers synchronously.
  new Function("self", "caches", "fetch", "Response", "URL", SOURCE)(
    self,
    cachesApi,
    fetcher,
    Response,
    URL,
  );

  async function dispatch(type: string, event: Record<string, unknown> = {}) {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    const extended = {
      ...event,
      waitUntil: (promise: Promise<unknown>) => void waits.push(promise),
      respondWith: (promise: Promise<Response>) => void (responded = promise),
    };

    for (const handler of handlers.get(type) ?? []) handler(extended as never);
    await Promise.all(waits);
    return responded;
  }

  const request = (url: string, mode: "navigate" | "cors" = "cors"): FakeRequest => ({
    url,
    method: "GET",
    mode,
  });

  return {
    requests: calls,
    photoReads: () => photoReads,
    install: async () => {
      await dispatch("install");
      await dispatch("activate");
    },
    navigate: async (path: string) =>
      dispatch("fetch", { request: request(absolute(path), "navigate") }),
    fetchPhoto: async (url: string = SIGNED_PHOTO) =>
      dispatch("fetch", { request: request(url) }),
    fetchUrl: async (url: string) => dispatch("fetch", { request: request(url) }),
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
    /** Lets fire-and-forget work (the background refresh, eviction) finish. */
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
    cacheNames: async () => [...stores.keys()],
    cacheKeys: async (name: string) => [...(stores.get(name)?.entries.keys() ?? [])],
    mediaCount: () => stores.get(MEDIA_CACHE)?.entries.size ?? 0,
  };
}

describe("service worker shell", () => {
  it("precaches the shell and the fingerprinted chunks the built HTML names", async () => {
    const worker = bootWorker();
    await worker.install();

    const shell = await worker.cacheKeys(SHELL_CACHE);
    expect(shell).toContain(absolute("/"));
    expect(shell).toContain(absolute("/index.html"));
    expect(shell).toContain(absolute("/assets/index-abc.js"));
    expect(shell).toContain(absolute("/assets/index-abc.css"));
    expect(shell).toContain(absolute("/icons/icon-192.png"));
    expect(worker.mediaCount()).toBe(0);
  });

  it("serves a navigation from the cached shell when the network is gone", async () => {
    const worker = bootWorker();
    await worker.install();
    worker.goOffline();

    const response = await worker.navigate("/saved");

    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('data-route="shell"');
  });

  it("never caches database traffic", async () => {
    const worker = bootWorker();
    await worker.install();

    const intercepted = await worker.fetchUrl(REST);

    // No respondWith means the browser performs the read itself: the worker has
    // nothing to say about a REST response, so none can be served stale.
    expect(intercepted).toBeUndefined();
    expect(worker.requests).not.toContain(REST);
  });
});

describe("service worker photograph cache", () => {
  it("serves a signed photograph from cache, then refreshes it in the background", async () => {
    let generation = 1;
    const worker = bootWorker({ photo: () => new Response(`bytes-${generation}`) });
    await worker.install();

    const first = await worker.fetchPhoto();
    expect(await first?.text()).toBe("bytes-1");
    expect(worker.photoReads()).toBe(1);

    // Second read while online: the cached bytes answer, even though the worker
    // starts a quiet refresh behind them...
    generation = 2;
    const second = await worker.fetchPhoto();
    expect(await second?.text()).toBe("bytes-1");

    // ...and that refresh replaces them for the next read.
    await worker.settle();
    expect(worker.photoReads()).toBe(2);

    const third = await worker.fetchPhoto();
    expect(await third?.text()).toBe("bytes-2");
  });

  it("keeps the last photograph when the network drops", async () => {
    const worker = bootWorker();
    await worker.install();

    await (await worker.fetchPhoto())?.text();
    worker.goOffline();

    const offline = await worker.fetchPhoto();

    expect(offline).toBeDefined();
    expect(await offline?.text()).toBe("photo-1");
    expect(worker.mediaCount()).toBe(1);
  });

  it("bounds the cache so a long session cannot fill the device", async () => {
    const worker = bootWorker();
    await worker.install();

    for (let index = 0; index < 121; index += 1) {
      const url = `https://abcdefgh.supabase.co/storage/v1/object/sign/listing-photos/room-${index}.jpg?token=t`;
      await (await worker.fetchPhoto(url))?.arrayBuffer();
      await worker.settle();
    }

    const keys = await worker.cacheKeys(MEDIA_CACHE);
    expect(keys).toHaveLength(120);
    expect(keys.some((key) => key.includes("room-0.jpg"))).toBe(false);
    expect(keys.some((key) => key.includes("room-120.jpg"))).toBe(true);
  });
});

describe("service worker in the dev preview", () => {
  it("registers no shell cache and leaves navigations to Vite", async () => {
    const worker = bootWorker({ mode: "dev" });
    await worker.install();

    // Nothing is precached, so a dev reload can never be pinned to a module graph.
    expect(worker.requests).not.toContain(absolute("/index.html"));
    expect(worker.requests).not.toContain(absolute("/"));
    expect(await worker.cacheNames()).toEqual([]);

    const navigation = await worker.navigate("/explore");
    expect(navigation).toBeUndefined();
  });

  it("still runs the photograph cache, which is the point of registering it", async () => {
    const worker = bootWorker({ mode: "dev" });
    await worker.install();

    const online = await worker.fetchPhoto();
    expect(await online?.text()).toBe("photo-1");

    worker.goOffline();
    const offline = await worker.fetchPhoto();

    expect(await offline?.text()).toBe("photo-1");
    expect(worker.mediaCount()).toBe(1);
  });
});
