import { describe, expect, it } from "vitest";
import { filterMessagesByQuery } from "@/components/chat/message-search";

const messages = [
  { id: "1", body: "Is the room still free?", deleted_at: null },
  { id: "2", body: "Yes, and the rent includes water.", deleted_at: null },
  { id: "3", body: "This message was deleted", deleted_at: "2026-10-25T10:00:00.000Z" },
];

describe("filterMessagesByQuery", () => {
  it("returns the whole thread for an empty query", () => {
    expect(filterMessagesByQuery(messages, "   ")).toHaveLength(3);
  });

  it("matches the body case-insensitively", () => {
    expect(
      filterMessagesByQuery(messages, "RENT").map((message) => message.id),
    ).toEqual(["2"]);
  });

  it("skips withdrawn messages even when the words match", () => {
    expect(
      filterMessagesByQuery(messages, "deleted").map((message) => message.id),
    ).toEqual([]);
  });

  it("returns nothing when no message matches", () => {
    expect(filterMessagesByQuery(messages, "generator")).toEqual([]);
  });
});
