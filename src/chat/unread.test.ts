import { describe, expect, it } from "vitest";
import { countUnreadMessages } from "@/chat/unread";
import type { TypedSupabaseClient } from "@/lib/supabase";

function clientReturning(
  count: number | null,
  error: unknown = null,
  groupUnread: number[] = [],
) {
  return {
    from: () => ({
      select: () => ({
        neq: () => ({
          is: () => Promise.resolve({ count, error }),
        }),
      }),
    }),
    rpc: () =>
      Promise.resolve({
        data: groupUnread.map((unread) => ({ unread_count: unread })),
        error: null,
      }),
  } as unknown as TypedSupabaseClient;
}

describe("countUnreadMessages", () => {
  it("adds unread room and roommate replies together", async () => {
    const result = await countUnreadMessages(clientReturning(2), "user-1");
    expect(result).toEqual({ count: 4, error: false });
  });

  it("reports zero when both tables are empty", async () => {
    const result = await countUnreadMessages(clientReturning(null), "user-1");
    expect(result).toEqual({ count: 0, error: false });
  });

  it("includes unread group messages from the group summary", async () => {
    const result = await countUnreadMessages(
      clientReturning(1, null, [3, 2]),
      "user-1",
    );
    expect(result).toEqual({ count: 7, error: false });
  });

  it("swallows a failure instead of breaking the header badge", async () => {
    const result = await countUnreadMessages(
      clientReturning(null, { code: "42P01" }),
      "user-1",
    );
    expect(result).toEqual({ count: 0, error: true });
  });
});
