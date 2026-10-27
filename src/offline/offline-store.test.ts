import { beforeEach, describe, expect, it } from "vitest";
import {
  OFFLINE_NAMES,
  SNAPSHOT_MAX_AGE_MS,
  clearSnapshots,
  formatSnapshotAge,
  readSnapshot,
  writeSnapshot,
} from "@/offline/offline-store";
import { decodeSavedRooms, encodeSavedRooms } from "@/offline/snapshots";
import type { PublicListing } from "@/listings/public-listings";

const USER = "user-1";
const OTHER = "user-2";

const listing = {
  id: "listing-1",
  title: "Quiet room in Yaba",
  city: "Lagos",
  neighbourhood: "Yaba",
  rent_amount: 500000,
} as unknown as PublicListing;

beforeEach(() => {
  window.localStorage.clear();
});

describe("offline snapshots", () => {
  it("returns the last copy for the account that wrote it", () => {
    writeSnapshot(OFFLINE_NAMES.savedRooms, USER, { listings: [listing], filing: [] });

    const cached = readSnapshot<{ listings: PublicListing[] }>(
      OFFLINE_NAMES.savedRooms,
      USER,
    );

    expect(cached?.data.listings).toHaveLength(1);
    expect(cached?.savedAt).toBeTruthy();
  });

  it("never hands one account's copy to another", () => {
    writeSnapshot(OFFLINE_NAMES.savedRooms, USER, { listings: [listing], filing: [] });

    expect(readSnapshot(OFFLINE_NAMES.savedRooms, OTHER)).toBeNull();
  });

  it("ignores a copy older than the retention window", () => {
    const old = new Date(Date.now() - SNAPSHOT_MAX_AGE_MS - 60_000);
    writeSnapshot(OFFLINE_NAMES.savedRooms, USER, { listings: [listing], filing: [] }, old);

    expect(readSnapshot(OFFLINE_NAMES.savedRooms, USER)).toBeNull();
  });

  it("ignores unreadable storage instead of throwing", () => {
    window.localStorage.setItem(`quarters.offline.v1:${USER}:${OFFLINE_NAMES.groups}`, "{");

    expect(readSnapshot(OFFLINE_NAMES.groups, USER)).toBeNull();
  });

  it("drops the copies on request, and only for that account", () => {
    writeSnapshot(OFFLINE_NAMES.savedRooms, USER, { listings: [], filing: [] });
    writeSnapshot(OFFLINE_NAMES.savedRooms, OTHER, { listings: [], filing: [] });

    clearSnapshots(USER, [OFFLINE_NAMES.savedRooms]);

    expect(readSnapshot(OFFLINE_NAMES.savedRooms, USER)).toBeNull();
    expect(readSnapshot(OFFLINE_NAMES.savedRooms, OTHER)).not.toBeNull();
  });
});

describe("saved-rooms snapshot codec", () => {
  it("round-trips the filing a Map cannot survive as JSON", () => {
    const filing = new Map<string, string | null>([["listing-1", "folder-1"]]);
    const encoded = encodeSavedRooms([listing], filing);

    // What actually reaches storage is plain JSON.
    const restored = decodeSavedRooms(JSON.parse(JSON.stringify(encoded)));

    expect(restored.listings).toHaveLength(1);
    expect(restored.collectionByListing.get("listing-1")).toBe("folder-1");
  });

  it("survives a damaged copy by falling back to empty data", () => {
    expect(decodeSavedRooms(null)).toEqual({
      listings: [],
      collectionByListing: new Map(),
    });
    expect(
      decodeSavedRooms({ listings: "nope", filing: [["listing-1", null]] } as never)
        .listings,
    ).toEqual([]);
  });
});

describe("snapshot age wording", () => {
  const now = new Date("2026-10-27T12:00:00+00:00");

  it("reads as words for the last day", () => {
    expect(formatSnapshotAge("2026-10-27T11:59:40+00:00", now)).toBe("just now");
    expect(formatSnapshotAge("2026-10-27T11:48:00+00:00", now)).toBe("12 minutes ago");
    expect(formatSnapshotAge("2026-10-27T09:32:00+00:00", now)).toBe("today at 09:32");
    expect(formatSnapshotAge("2026-10-26T18:32:00+00:00", now)).toBe("yesterday at 18:32");
  });

  it("falls back to a date for anything older", () => {
    expect(formatSnapshotAge("2026-10-20T09:00:00+00:00", now)).toContain("20 Oct");
  });

  it("does not invent a date it cannot read", () => {
    expect(formatSnapshotAge("not-a-date", now)).toBe("an unknown time");
  });
});
