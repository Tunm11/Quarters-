import { describe, expect, it, vi } from "vitest";
import {
  SHORTLIST_SHARE_MAX,
  sendShortlistToRoommate,
} from "@/roommates/listing-shares";
import type { TypedSupabaseClient } from "@/lib/supabase";

const sentMessage = {
  id: "message-1",
  sender_id: "user-1",
  body: "My shortlist — 2 rooms to compare.",
  created_at: "2026-10-25T09:00:00Z",
  read_at: null,
  shared_listing_id: null,
  shared_listing_ids: ["listing-1", "listing-2"],
  image_path: null,
  edited_at: null,
  deleted_at: null,
};

type InsertPayload = { body: string; shared_listing_ids: string[] };

function clientWith(result: { data?: unknown; error?: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const insert = vi.fn((_values: InsertPayload) => ({
    select: () => ({ single }),
  }));
  return {
    client: { from: () => ({ insert }) } as unknown as TypedSupabaseClient,
    insert,
  };
}

describe("sendShortlistToRoommate", () => {
  it("posts every room as one message, in the order they were saved", async () => {
    const { client, insert } = clientWith({ data: sentMessage, error: null });

    const result = await sendShortlistToRoommate(client, {
      profileId: "profile-1",
      studentId: "user-1",
      senderId: "user-1",
      listingIds: ["listing-1", "listing-2"],
    });

    expect(insert).toHaveBeenCalledWith({
      profile_id: "profile-1",
      student_id: "user-1",
      sender_id: "user-1",
      body: "My shortlist — 2 rooms to compare.",
      shared_listing_ids: ["listing-1", "listing-2"],
    });
    expect(result.message?.shared_listing_ids).toEqual([
      "listing-1",
      "listing-2",
    ]);
    expect(result.error).toBeNull();
  });

  it("names the collection that was open", async () => {
    const { client, insert } = clientWith({ data: sentMessage, error: null });

    await sendShortlistToRoommate(client, {
      profileId: "profile-1",
      studentId: "user-1",
      senderId: "user-1",
      listingIds: ["listing-1", "listing-2"],
      collectionName: "  Near campus ",
    });

    expect(insert.mock.calls[0]![0].body).toBe(
      'My shortlist "Near campus" — 2 rooms to look at.',
    );
  });

  it("sends each room once and stops at the database cap", async () => {
    const { client, insert } = clientWith({ data: sentMessage, error: null });
    const many = [
      "listing-1",
      "listing-1",
      ...Array.from({ length: 20 }, (_, index) => `listing-${index + 2}`),
    ];

    await sendShortlistToRoommate(client, {
      profileId: "profile-1",
      studentId: "user-1",
      senderId: "user-1",
      listingIds: many,
    });

    const sent = insert.mock.calls[0]![0].shared_listing_ids;
    expect(sent).toHaveLength(SHORTLIST_SHARE_MAX);
    expect(new Set(sent).size).toBe(SHORTLIST_SHARE_MAX);
  });

  it("asks for a room before sending an empty shortlist", async () => {
    const { client, insert } = clientWith({ data: sentMessage, error: null });

    const result = await sendShortlistToRoommate(client, {
      profileId: "profile-1",
      studentId: "user-1",
      senderId: "user-1",
      listingIds: [],
    });

    expect(insert).not.toHaveBeenCalled();
    expect(result.message).toBeNull();
    expect(result.error).toMatch(/Save a room/);
  });

  it("explains a database that has not run the migration", async () => {
    const { client } = clientWith({ data: null, error: { code: "42703" } });

    const result = await sendShortlistToRoommate(client, {
      profileId: "profile-1",
      studentId: "user-1",
      senderId: "user-1",
      listingIds: ["listing-1"],
    });

    expect(result.message).toBeNull();
    expect(result.error).toMatch(/not enabled on this database yet/);
  });
});
