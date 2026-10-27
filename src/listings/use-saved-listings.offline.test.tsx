import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSavedRooms } from "@/listings/use-saved-listings";
import type { PublicListing } from "@/listings/public-listings";
import { OFFLINE_NAMES, readSnapshot } from "@/offline/offline-store";

const loader = vi.hoisted(() => ({ loadSavedListings: vi.fn() }));

vi.mock("@/listings/saved-listings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/listings/saved-listings")>();
  return { ...actual, loadSavedListings: loader.loadSavedListings };
});

vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({}) } }));

const USER = "user-1";

const room = {
  id: "listing-1",
  title: "Quiet room in Yaba",
  city: "Lagos",
  neighbourhood: "Yaba",
  facilities: [],
  photo_urls: [],
} as unknown as PublicListing;

const secondRoom = { ...room, id: "listing-2", title: "Room in Akoka" };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  loader.loadSavedListings.mockReset();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe("saved rooms offline", () => {
  it("writes the last good read so it can be opened offline", async () => {
    loader.loadSavedListings.mockResolvedValue({
      listings: [room],
      collectionByListing: new Map([[room.id, null]]),
      error: null,
    });

    const { result } = renderHook(() => useSavedRooms({ userId: USER }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.listings).toHaveLength(1);
    expect(result.current.offlineSavedAt).toBeNull();
    expect(readSnapshot(OFFLINE_NAMES.savedRooms, USER)?.data).toBeTruthy();
  });

  it("opens the cached shortlist offline instead of failing", async () => {
    loader.loadSavedListings.mockResolvedValue({
      listings: [room],
      collectionByListing: new Map([[room.id, "folder-1"]]),
      error: null,
    });

    const online = renderHook(() => useSavedRooms({ userId: USER }));
    await waitFor(() => expect(online.result.current.status).toBe("ready"));
    loader.loadSavedListings.mockReset();

    // The connection drops: the same hook re-reads from the cache.
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(online.result.current.offlineSavedAt).not.toBeNull());
    expect(online.result.current.status).toBe("ready");
    expect(online.result.current.listings.map((listing) => listing.id)).toEqual([
      "listing-1",
    ]);
    // The filing survives the round-trip through JSON.
    expect(online.result.current.collectionByListing.get("listing-1")).toBe("folder-1");
    expect(loader.loadSavedListings).not.toHaveBeenCalled();
  });

  it("says so honestly when there is no copy on this device", async () => {
    setOnline(false);

    const { result } = renderHook(() => useSavedRooms({ userId: USER }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.listings).toEqual([]);
    expect(result.current.error).toContain("no saved copy");
  });

  it("refuses a removal while offline instead of pretending it worked", async () => {
    loader.loadSavedListings.mockResolvedValue({
      listings: [room, secondRoom],
      collectionByListing: new Map(),
      error: null,
    });

    const { result } = renderHook(() => useSavedRooms({ userId: USER }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(result.current.offlineSavedAt).not.toBeNull());

    let message: string | null = null;
    await act(async () => {
      message = await result.current.remove(room.id);
    });

    expect(message).toContain("offline");
    // Both rooms stay on screen, because nothing was deleted.
    expect(result.current.listings).toHaveLength(2);
  });
});
