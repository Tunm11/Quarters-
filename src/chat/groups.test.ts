import { describe, expect, it, vi } from "vitest";
import {
  createChatGroup,
  defaultGroupName,
  loadChatGroupMembers,
  readReceiptLabel,
  readersForMessage,
  type ChatGroupReader,
} from "@/chat/groups";
import type { TypedSupabaseClient } from "@/lib/supabase";

describe("defaultGroupName", () => {
  it("joins one or two names as they are", () => {
    expect(defaultGroupName(["Amara O."])).toBe("Amara O.");
    expect(defaultGroupName(["Amara O.", "Bode Estates"])).toBe(
      "Amara O. & Bode Estates",
    );
  });

  it("counts the extras instead of naming everyone", () => {
    expect(defaultGroupName(["Amara", "Bode", "Chidi", "Dayo"])).toBe(
      "Amara, Bode & 2 more",
    );
  });

  it("falls back to a neutral title", () => {
    expect(defaultGroupName([])).toBe("New group");
    expect(defaultGroupName(["  ", ""])).toBe("New group");
  });
});

describe("group read receipts", () => {
  const readers: ChatGroupReader[] = [
    {
      user_id: "user-2",
      display_name: "Amara",
      last_read_at: "2026-10-25T12:00:00.000Z",
    },
    {
      user_id: "user-3",
      display_name: "Bode",
      last_read_at: "2026-10-25T11:00:00.000Z",
    },
  ];

  it("counts a reader only once they passed the message", () => {
    const older = readersForMessage(readers, {
      created_at: "2026-10-25T11:30:00.000Z",
    });
    expect(older.map((reader) => reader.display_name)).toEqual(["Amara"]);

    const newer = readersForMessage(readers, {
      created_at: "2026-10-25T12:30:00.000Z",
    });
    expect(newer).toEqual([]);
  });

  it("names the readers, then counts the extras", () => {
    expect(readReceiptLabel([])).toBe("Sent");
    expect(readReceiptLabel(["Amara"])).toBe("Seen by Amara");
    expect(readReceiptLabel(["Amara", "Bode"])).toBe(
      "Seen by Amara and Bode",
    );
    expect(readReceiptLabel(["Amara", "Bode", "Chidi"])).toBe(
      "Seen by Amara, Bode +1",
    );
  });
});

describe("loadChatGroupMembers", () => {
  it("carries the roommate profile a member can be reported through", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: "user-2",
          display_name: "  Ada M.  ",
          joined_at: "2026-10-25T10:00:00.000Z",
          is_creator: false,
          roommate_profile_id: "profile-2",
        },
        {
          user_id: "user-3",
          display_name: "Bode Estates",
          joined_at: "2026-10-25T10:05:00.000Z",
          is_creator: false,
          roommate_profile_id: null,
        },
      ],
      error: null,
    });

    const result = await loadChatGroupMembers(
      { rpc } as unknown as TypedSupabaseClient,
      "group-1",
    );

    expect(rpc).toHaveBeenCalledWith("chat_group_members_for_me", {
      p_group_id: "group-1",
    });
    expect(result.members[0]).toMatchObject({
      display_name: "Ada M.",
      roommate_profile_id: "profile-2",
    });
    // A lister in the group has no roommate profile: nothing to report there.
    expect(result.members[1].roommate_profile_id).toBeNull();
  });

  it("reads a member the server could not resolve as having no profile", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: "user-2",
          display_name: "",
          joined_at: "2026-10-25T10:00:00.000Z",
          is_creator: true,
        },
      ],
      error: null,
    });

    const result = await loadChatGroupMembers(
      { rpc } as unknown as TypedSupabaseClient,
      "group-1",
    );

    expect(result.members[0].display_name).toBe("Member");
    expect(result.members[0].roommate_profile_id).toBeNull();
  });
});

describe("createChatGroup", () => {
  it("refuses a group with fewer than two other people without calling the API", async () => {
    const rpc = vi.fn();
    const result = await createChatGroup(
      { rpc } as unknown as TypedSupabaseClient,
      { name: "Two of us", memberIds: ["user-2", "user-2"] },
    );

    expect(result.groupId).toBeNull();
    expect(result.error).toMatch(/at least 2 people/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("de-duplicates members and falls back to a default name", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "group-1", error: null });

    const result = await createChatGroup(
      { rpc } as unknown as TypedSupabaseClient,
      { name: "   ", memberIds: ["user-2", "user-3", "user-2"] },
    );

    expect(rpc).toHaveBeenCalledWith("create_chat_group", {
      p_name: "New group",
      p_member_ids: ["user-2", "user-3"],
    });
    expect(result).toEqual({ groupId: "group-1", error: null });
  });

  it("surfaces the server's validation message", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "You can only add people you have talked to.",
      },
    });

    const result = await createChatGroup(
      { rpc } as unknown as TypedSupabaseClient,
      { name: "Strangers", memberIds: ["user-2", "user-9"] },
    );

    expect(result.groupId).toBeNull();
    expect(result.error).toBe("You can only add people you have talked to.");
  });
});
