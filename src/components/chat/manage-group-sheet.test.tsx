import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManageGroupSheet } from "@/components/chat/manage-group-sheet";
import type { ChatGroupMember } from "@/chat/groups";

const chatApi = vi.hoisted(() => ({
  members: [] as ChatGroupMember[],
  error: null as string | null,
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

vi.mock("@/chat/groups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/chat/groups")>();
  return {
    ...actual,
    loadChatGroupMembers: vi.fn(async () => ({
      members: chatApi.members,
      error: chatApi.error,
    })),
    loadChatContacts: vi.fn(async () => ({ contacts: [], error: null })),
  };
});

const safetyApi = vi.hoisted(() => ({
  blocks: [] as { id: string; profileId: string; displayName: string; createdAt: string }[],
  report: null as unknown,
}));

vi.mock("@/roommates/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/roommates/safety")>();
  return {
    ...actual,
    loadMyBlocks: vi.fn(async () => ({ blocks: safetyApi.blocks, error: null })),
    loadMyOpenReport: vi.fn(async () => ({ report: safetyApi.report, error: null })),
  };
});

function member(overrides: Partial<ChatGroupMember> = {}): ChatGroupMember {
  return {
    user_id: "user-2",
    display_name: "Ada M.",
    joined_at: "2026-10-25T10:00:00.000Z",
    is_creator: false,
    roommate_profile_id: "profile-2",
    ...overrides,
  };
}

function renderSheet() {
  return render(
    <ManageGroupSheet
      open
      onClose={() => {}}
      group={{
        groupId: "group-1",
        name: "Saturday viewing",
        createdBy: "user-1",
        avatarPath: null,
      }}
      avatarUrl={null}
      viewerId="user-1"
      onChanged={() => {}}
      onLeft={() => {}}
    />,
  );
}

beforeEach(() => {
  chatApi.members = [
    member({
      user_id: "user-1",
      display_name: "You",
      is_creator: true,
      roommate_profile_id: "profile-1",
    }),
    member(),
  ];
  chatApi.error = null;
  safetyApi.blocks = [];
  safetyApi.report = null;
});

describe("group member safety", () => {
  it("offers report and block for a member with a roommate profile", async () => {
    renderSheet();

    const options = await screen.findByRole("button", {
      name: "Options for Ada M.",
    });
    fireEvent.click(options);

    const menu = screen.getByRole("menu", { name: "Options for Ada M." });
    expect(within(menu).getByRole("menuitem", { name: "Report Ada M." })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Block Ada M." })).toBeTruthy();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Report Ada M." }));

    const dialog = await screen.findByRole("dialog", { name: "Report Ada" });
    expect(within(dialog).getByText(/Reports go only to QUARTERS moderators/)).toBeTruthy();
  });

  it("will not offer a block the database would refuse", async () => {
    safetyApi.blocks = [
      {
        id: "block-1",
        profileId: "profile-2",
        displayName: "Ada M.",
        createdAt: "2026-10-24T10:00:00.000Z",
      },
    ];
    renderSheet();

    const options = await screen.findByRole("button", {
      name: "Options for Ada M.",
    });
    fireEvent.click(options);

    const menu = screen.getByRole("menu", { name: "Options for Ada M." });
    expect(within(menu).queryByRole("menuitem", { name: "Block Ada M." })).toBeNull();
    expect(within(menu).getByText(/You have blocked Ada M./)).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("says there is nothing to report for a member without a roommate profile", async () => {
    chatApi.members = [member({ display_name: "Bode Estates", roommate_profile_id: null })];
    renderSheet();

    fireEvent.click(
      await screen.findByRole("button", { name: "Options for Bode Estates" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/has no roommate profile, so there is nothing to report/),
      ).toBeTruthy();
    });
  });

  it("never offers safety options on your own row", async () => {
    renderSheet();

    await screen.findByRole("button", { name: "Options for Ada M." });
    expect(screen.queryByRole("button", { name: "Options for You" })).toBeNull();
  });
});
