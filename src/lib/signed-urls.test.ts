import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedSignedUrl,
  cachedSignedUrls,
  clearSignedUrlCache,
} from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";

function makeClient() {
  let counter = 0;
  const createSignedUrls = vi.fn(async (paths: string[]) => {
    counter += 1;
    return {
      data: paths.map((path) => ({
        path,
        signedUrl: `https://storage.test/${path}?sig=${counter}`,
        error: null,
      })),
      error: null,
    };
  });

  const client = {
    storage: { from: () => ({ createSignedUrls }) },
  } as unknown as TypedSupabaseClient;

  return { client, createSignedUrls };
}

beforeEach(() => {
  clearSignedUrlCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cachedSignedUrls", () => {
  it("signs once and reuses the same URL afterwards", async () => {
    const { client, createSignedUrls } = makeClient();

    const first = await cachedSignedUrls(client, "listing-images", [
      "a.jpg",
      "b.jpg",
    ]);
    const second = await cachedSignedUrls(client, "listing-images", [
      "a.jpg",
      "b.jpg",
    ]);

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(second.get("a.jpg")).toBe(first.get("a.jpg"));
    expect(second.get("b.jpg")).toBe(first.get("b.jpg"));
  });

  it("only asks for the paths it does not have yet", async () => {
    const { client, createSignedUrls } = makeClient();

    await cachedSignedUrls(client, "listing-images", ["a.jpg"]);
    await cachedSignedUrls(client, "listing-images", ["a.jpg", "c.jpg"]);

    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(createSignedUrls).toHaveBeenLastCalledWith(["c.jpg"], expect.any(Number));
  });

  it("keeps buckets apart", async () => {
    const { client, createSignedUrls } = makeClient();

    await cachedSignedUrls(client, "listing-images", ["cover.jpg"]);
    await cachedSignedUrls(client, "roommate-avatars", ["cover.jpg"]);

    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("re-signs once the URL is close to expiring", async () => {
    const { client, createSignedUrls } = makeClient();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00.000Z"));
    await cachedSignedUrls(client, "listing-images", ["a.jpg"], 3600);

    // Still inside the lifetime minus the refresh margin.
    vi.setSystemTime(new Date("2026-10-25T10:40:00.000Z"));
    await cachedSignedUrls(client, "listing-images", ["a.jpg"], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);

    // Past it: the photo is signed again rather than served from an expired URL.
    vi.setSystemTime(new Date("2026-10-25T10:56:00.000Z"));
    await cachedSignedUrls(client, "listing-images", ["a.jpg"], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty request", async () => {
    const { client, createSignedUrls } = makeClient();

    const urls = await cachedSignedUrls(client, "listing-images", []);
    expect(urls.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("leaves failed paths out instead of caching them", async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrls: async () => ({
            data: [{ path: "a.jpg", signedUrl: null, error: "missing" }],
            error: null,
          }),
        }),
      },
    } as unknown as TypedSupabaseClient;

    const urls = await cachedSignedUrls(client, "listing-images", ["a.jpg"]);
    expect(urls.size).toBe(0);
  });
});

describe("cachedSignedUrl", () => {
  it("returns one URL and reuses it", async () => {
    const { client, createSignedUrls } = makeClient();

    const first = await cachedSignedUrl(client, "roommate-avatars", "me.jpg");
    const second = await cachedSignedUrl(client, "roommate-avatars", "me.jpg");

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });
});
