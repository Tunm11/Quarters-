import { describe, expect, it, vi } from "vitest";
import {
  COLLECTION_NAME_MAX_LENGTH,
  createSavedCollection,
  deleteSavedCollection,
  fileListingInCollection,
  normalizeCollectionName,
  renameSavedCollection,
} from "@/listings/saved-collections";
import type { TypedSupabaseClient } from "@/lib/supabase";

describe("normalizeCollectionName", () => {
  it("trims, collapses whitespace and caps the length", () => {
    expect(normalizeCollectionName("  Near   campus ")).toBe("Near campus");
    expect(normalizeCollectionName("x".repeat(80))).toHaveLength(
      COLLECTION_NAME_MAX_LENGTH,
    );
  });
});

describe("createSavedCollection", () => {
  it("writes a normalized name for the signed-in account", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "collection-1", name: "Near campus", created_at: "2026-10-25" },
      error: null,
    });
    const insert = vi.fn(() => ({
      select: () => ({ single }),
    }));
    const client = { from: () => ({ insert }) } as unknown as TypedSupabaseClient;

    const result = await createSavedCollection(client, {
      userId: "user-1",
      name: "  Near   campus  ",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Near campus",
    });
    expect(result.collection?.id).toBe("collection-1");
    expect(result.error).toBeNull();
  });

  it("refuses an empty name before writing", async () => {
    const insert = vi.fn();
    const client = { from: () => ({ insert }) } as unknown as TypedSupabaseClient;

    const result = await createSavedCollection(client, {
      userId: "user-1",
      name: "   ",
    });

    expect(insert).not.toHaveBeenCalled();
    expect(result.error).toMatch(/Name this collection/);
  });

  it("explains a duplicate name", async () => {
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await createSavedCollection(client, {
      userId: "user-1",
      name: "Near campus",
    });

    expect(result.collection).toBeNull();
    expect(result.error).toMatch(/already have a collection/);
  });
});

describe("renameSavedCollection", () => {
  it("reports a collection that no longer resolves", async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await renameSavedCollection(client, {
      collectionId: "collection-1",
      name: "Near campus",
    });

    expect(result.error).toMatch(/no longer exists/);
  });
});

describe("deleteSavedCollection", () => {
  it("explains a missing migration instead of throwing", async () => {
    const client = {
      from: () => ({
        delete: () => ({
          eq: vi.fn().mockResolvedValue({ error: { code: "42P01" } }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await deleteSavedCollection(client, "collection-1");

    expect(result.error).toMatch(/not available yet/);
  });
});

describe("fileListingInCollection", () => {
  it("updates only the caller's row for that room", async () => {
    const filters: { column: string; value: string | null }[] = [];
    const client = {
      from: () => ({
        update: (values: Record<string, unknown>) => {
          filters.push({ column: "values", value: Object.values(values)[0] as string });
          return {
            eq: (column: string, value: string) => {
              filters.push({ column, value });
              return {
                eq: (nextColumn: string, nextValue: string) => {
                  filters.push({ column: nextColumn, value: nextValue });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      }),
    } as unknown as TypedSupabaseClient;

    const result = await fileListingInCollection(client, {
      userId: "user-1",
      listingId: "listing-1",
      collectionId: "collection-1",
    });

    expect(filters).toEqual([
      { column: "values", value: "collection-1" },
      { column: "user_id", value: "user-1" },
      { column: "listing_id", value: "listing-1" },
    ]);
    expect(result.error).toBeNull();
  });

  it("unfiles a room with null", async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }));
    const client = { from: () => ({ update }) } as unknown as TypedSupabaseClient;

    await fileListingInCollection(client, {
      userId: "user-1",
      listingId: "listing-1",
      collectionId: null,
    });

    expect(update).toHaveBeenCalledWith({ collection_id: null });
  });
});
