import { describe, expect, it, vi } from "vitest";
import {
  loadSavedListingIds,
  saveListing,
  unsaveListing,
} from "@/listings/saved-listings";
import type { TypedSupabaseClient } from "@/lib/supabase";

describe("saveListing", () => {
  it("writes the pairing for the signed-in user", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: () => ({ insert }),
    } as unknown as TypedSupabaseClient;

    const result = await saveListing(client, {
      userId: "user-1",
      listingId: "listing-1",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      listing_id: "listing-1",
    });
    expect(result.error).toBeNull();
  });

  it("treats an already-saved room as success", async () => {
    const client = {
      from: () => ({
        insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await saveListing(client, {
      userId: "user-1",
      listingId: "listing-1",
    });

    expect(result.error).toBeNull();
  });

  it("reports a signed-out write honestly", async () => {
    const client = {
      from: () => ({
        insert: vi.fn().mockResolvedValue({ error: { code: "42501" } }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await saveListing(client, {
      userId: "user-1",
      listingId: "listing-1",
    });

    expect(result.error).toMatch(/Sign in/);
  });
});

describe("unsaveListing", () => {
  it("deletes only the caller's row for that room", async () => {
    const deleted: string[] = [];
    const deleteMock = {
      eq: (column: string, value: string) => {
        deleted.push(`${column}=${value}`);
        return {
          eq: (nextColumn: string, nextValue: string) => {
            deleted.push(`${nextColumn}=${nextValue}`);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const client = {
      from: () => ({ delete: () => deleteMock }),
    } as unknown as TypedSupabaseClient;

    const result = await unsaveListing(client, {
      userId: "user-1",
      listingId: "listing-1",
    });

    expect(deleted).toEqual(["user_id=user-1", "listing_id=listing-1"]);
    expect(result.error).toBeNull();
  });
});

describe("loadSavedListingIds", () => {
  it("returns the saved ids in the order the query gives them", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ listing_id: "listing-2" }, { listing_id: "listing-1" }],
      error: null,
    });
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ order }) }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await loadSavedListingIds(client, "user-1");

    expect(result.ids).toEqual(["listing-2", "listing-1"]);
    expect(result.error).toBeNull();
  });

  it("explains a missing migration instead of throwing", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: vi.fn().mockResolvedValue({ data: null, error: { code: "42P01" } }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await loadSavedListingIds(client, "user-1");

    expect(result.ids).toEqual([]);
    expect(result.error).toMatch(/not available yet/);
  });
});
