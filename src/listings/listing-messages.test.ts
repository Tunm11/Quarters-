import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  LISTING_MESSAGE_MAX_LENGTH,
  loadListingChatThreads,
  loadListingMessages,
  mapListingMessageError,
  markListingMessagesRead,
  sendListingMessage,
} from "@/listings/listing-messages";
import type { TypedSupabaseClient } from "@/lib/supabase";

function pgError(code: string): PostgrestError {
  return {
    code,
    message: "database error",
    details: "",
    hint: "",
  } as unknown as PostgrestError;
}

describe("listing message errors", () => {
  it("explains a missing migration and a signed-out reader", () => {
    expect(mapListingMessageError(pgError("42P01"))).toContain("not available yet");
    expect(mapListingMessageError(pgError("PGRST202"))).toContain("not available yet");
    expect(mapListingMessageError(pgError("42501"))).toContain("Sign in");
    expect(mapListingMessageError(pgError("XX000"))).toBe(
      "Could not load this conversation. Please try again.",
    );
  });
});

describe("sendListingMessage", () => {
  const client = {} as TypedSupabaseClient;

  it("rejects an empty or whitespace-only message before writing", async () => {
    const result = await sendListingMessage(client, {
      listingId: "listing-1",
      studentId: "student-1",
      senderId: "student-1",
      body: "   ",
    });

    expect(result).toEqual({ message: null, error: "Write a message first." });
  });

  it("rejects a message over the limit", async () => {
    const result = await sendListingMessage(client, {
      listingId: "listing-1",
      studentId: "student-1",
      senderId: "student-1",
      body: "x".repeat(LISTING_MESSAGE_MAX_LENGTH + 1),
    });

    expect(result.error).toContain(`${LISTING_MESSAGE_MAX_LENGTH}`);
  });
});

describe("listing chat reads", () => {
  it("maps an RPC failure to the unavailable copy", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: pgError("42883") }),
    } as unknown as TypedSupabaseClient;

    const result = await loadListingChatThreads(client);
    expect(result.threads).toEqual([]);
    expect(result.error).toContain("not available yet");
  });

  it("names a student who has no display name", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            listing_id: "listing-1",
            listing_title: "Studio in Akoka",
            student_id: "student-1",
            student_name: "   ",
            last_body: "Is the room still free?",
            last_message_at: "2026-10-25T09:00:00.000Z",
            unread_count: 2,
          },
        ],
        error: null,
      }),
    } as unknown as TypedSupabaseClient;

    const result = await loadListingChatThreads(client);
    expect(result.error).toBeNull();
    expect(result.threads[0]).toMatchObject({
      student_name: "Student",
      unread_count: 2,
      last_body: "Is the room still free?",
    });
  });

  it("returns the messages of one thread in order", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m-1",
          listing_id: "listing-1",
          student_id: "student-1",
          sender_id: "student-1",
          body: "Hello",
          created_at: "2026-10-25T09:00:00.000Z",
          read_at: null,
        },
      ],
      error: null,
    });
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ order }) }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await loadListingMessages(client, {
      listingId: "listing-1",
      studentId: "student-1",
    });

    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result.messages).toHaveLength(1);
  });

  it("reports a failed read receipt without throwing", async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              neq: () => ({ is: vi.fn().mockResolvedValue({ error: pgError("42501") }) }),
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await markListingMessagesRead(client, {
      listingId: "listing-1",
      studentId: "student-1",
      readerId: "provider-1",
    });

    expect(result.error).toContain("Sign in");
  });
});
