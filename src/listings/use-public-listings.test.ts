import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePublicListings } from "@/listings/use-public-listings";

/**
 * A PostgREST stand-in for the catalogue read: it records each page asked for
 * and can be told to fail page reads from a given offset onwards.
 */
const catalogue = vi.hoisted(() => ({
  ids: [] as string[],
  reads: [] as { range?: [number, number] }[],
  failFrom: null as number | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const read: { table: string; range?: [number, number] } = { table };
      if (table === "listings") catalogue.reads.push(read);

      const result = () => {
        if (table !== "listings") return { data: [], error: null, count: 0 };

        const [from = 0, to = 23] = read.range ?? [0, 23];
        if (catalogue.failFrom != null && from >= catalogue.failFrom) {
          return {
            data: null,
            error: { code: "PGRST000", message: "network" },
            count: null,
          };
        }

        return {
          data: catalogue.ids
            .slice(from, to + 1)
            .map((id) => ({ id, title: `Room ${id}` })),
          error: null,
          count: catalogue.ids.length,
        };
      };

      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          read.range = [from, to];
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };

      return builder;
    },
  },
}));

beforeEach(() => {
  catalogue.ids = Array.from({ length: 30 }, (_, index) => `room-${index + 1}`);
  catalogue.reads.length = 0;
  catalogue.failFrom = null;
});

describe("usePublicListings", () => {
  it("loads the first page, then appends the next page from the offset reached", async () => {
    const { result } = renderHook(() => usePublicListings());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.listings).toHaveLength(24);
    expect(result.current.total).toBe(30);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(catalogue.reads.map((read) => read.range)).toEqual([
      [0, 23],
      [24, 47],
    ]);
    expect(result.current.listings).toHaveLength(30);
    expect(result.current.listings.at(-1)?.id).toBe("room-30");
    // The catalogue is exhausted, so no further page is offered.
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it("keeps the loaded rooms and reports the failure when a later page fails", async () => {
    const { result } = renderHook(() => usePublicListings());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    catalogue.failFrom = 24;
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.listings).toHaveLength(24);
    expect(result.current.status).toBe("ready");
    expect(result.current.moreError).toMatch(/Could not load rooms/);
    expect(result.current.loadingMore).toBe(false);
    // The failure does not write off rooms that were never read.
    expect(result.current.hasMore).toBe(true);
  });

  it("stops at the end of the catalogue instead of reading the same page again", async () => {
    catalogue.ids = catalogue.ids.slice(0, 24);
    const { result } = renderHook(() => usePublicListings());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(catalogue.reads).toHaveLength(1);
    expect(result.current.listings).toHaveLength(24);
  });

  it("reload starts the catalogue again from the newest rooms", async () => {
    const { result } = renderHook(() => usePublicListings());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.listings).toHaveLength(30);

    await act(async () => {
      await result.current.reload();
    });

    expect(catalogue.reads.map((read) => read.range)).toEqual([
      [0, 23],
      [24, 47],
      [0, 23],
    ]);
    expect(result.current.listings).toHaveLength(24);
    expect(result.current.hasMore).toBe(true);
  });
});
