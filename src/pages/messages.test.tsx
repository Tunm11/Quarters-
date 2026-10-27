import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MessagesPage from "@/pages/messages";
import type { ChatGroupSummary } from "@/chat/groups";
import type { StudentListingChatThread } from "@/listings/listing-messages";
import type { RoommateConnection } from "@/roommates/connections";

const authState = vi.hoisted(() => ({
  status: "signedIn" as "signedIn" | "signedOut",
  user: { id: "user-1", email: "student@example.com" } as {
    id: string;
    email: string;
  } | null,
}));

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({ status: authState.status, user: authState.user }),
}));

const connectionsHook = vi.hoisted(() => ({
  state: {
    connections: [] as unknown[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    reload: vi.fn(),
  },
}));

vi.mock("@/roommates/use-roommate-connections", () => ({
  useRoommateConnections: () => connectionsHook.state,
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const groupsHook = vi.hoisted(() => ({
  state: {
    groups: [] as unknown[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    reload: vi.fn(),
  },
}));

vi.mock("@/chat/use-chat-groups", () => ({
  useChatGroups: () => groupsHook.state,
}));

const groupChatHook = vi.hoisted(() => ({
  state: {
    messages: [],
    loading: false,
    error: null as string | null,
    sending: false,
    send: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("@/chat/use-group-chat", () => ({
  useGroupChat: () => groupChatHook.state,
}));

const groupApi = vi.hoisted(() => ({
  loadContacts: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/chat/groups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/chat/groups")>();
  return {
    ...actual,
    loadChatContacts: groupApi.loadContacts,
    createChatGroup: groupApi.create,
  };
});

const listingThreads = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@/listings/listing-messages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/listing-messages")>();
  return {
    ...actual,
    loadStudentListingChatThreads: listingThreads.load,
    loadListingMessages: async () => ({ messages: [], error: null }),
    markListingMessagesRead: async () => ({ error: null }),
  };
});

const lectureThread: StudentListingChatThread = {
  listing_id: "listing-1",
  listing_title: "Furnished hostel bed in Akoka",
  provider_name: "Ada Rooms",
  provider_kind: "landlord",
  last_body: "Yes, the room is still free.",
  last_message_at: "2026-10-25T09:30:00.000Z",
  unread_count: 2,
};

const agentThread: StudentListingChatThread = {
  listing_id: "listing-2",
  listing_title: "2-bedroom flat in Yaba",
  provider_name: "Bode Estates",
  provider_kind: "agent",
  last_body: "Viewing is free on Saturday.",
  last_message_at: "2026-10-25T10:15:00.000Z",
  unread_count: 0,
};

const groupSummary: ChatGroupSummary = {
  group_id: "group-1",
  name: "Akoka Flatmates",
  created_by: "user-1",
  last_body: "Let us split the rent three ways.",
  last_message_at: "2026-10-25T11:00:00.000Z",
  unread_count: 3,
  member_names: "Amara O., Bode Estates, You",
  member_count: 3,
  avatar_path: null,
};

const connection: RoommateConnection = {
  id: "profile-1",
  display_name: "Amara O.",
  headline: "300 level Law",
  institution: "University of Lagos",
  city: "Lagos",
  neighbourhood: "Akoka",
  budget_amount: 540000,
  currency: "NGN",
  gender: "female",
  move_in_date: "2026-11-15",
  bio: null,
  avatar_url: null,
  traits: null,
  connected_at: "2026-10-24T20:00:00.000Z",
  user_id: "user-amara",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/messages"]}>
      <MessagesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.status = "signedIn";
  authState.user = { id: "user-1", email: "student@example.com" };
  connectionsHook.state.connections = [];
  connectionsHook.state.status = "ready";
  connectionsHook.state.error = null;
  listingThreads.load.mockReset();
  listingThreads.load.mockResolvedValue({ threads: [lectureThread], error: null });
  groupsHook.state.groups = [];
  groupsHook.state.status = "ready";
  groupsHook.state.error = null;
  groupsHook.state.reload.mockReset();
  groupChatHook.state.messages = [];
  groupApi.loadContacts.mockReset();
  groupApi.loadContacts.mockResolvedValue({
    contacts: [
      { user_id: "user-2", display_name: "Amara O.", kind: "roommate" },
      { user_id: "user-3", display_name: "Bode Estates", kind: "agent" },
    ],
    error: null,
  });
  groupApi.create.mockReset();
});

describe("Messages inbox", () => {
  it("lists room conversations with the unread count and opens the thread", async () => {
    renderPage();

    expect(await screen.findByText("Ada Rooms")).toBeTruthy();
    expect(screen.getByText(/Furnished hostel bed in Akoka/)).toBeTruthy();
    expect(screen.getByText(/^Property owner ·/)).toBeTruthy();
    expect(screen.getByText("2 new")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Ada Rooms/ }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Chat with Ada Rooms",
    });
    expect(within(sheet).getByLabelText("Message")).toBeTruthy();
  });

  it("links connected roommates straight into their chat", async () => {
    connectionsHook.state.connections = [connection];
    renderPage();

    const link = await screen.findByRole("link", { name: "Chat with Amara O." });
    expect(link.getAttribute("href")).toBe("/roommate/profile-1?chat=1");
  });

  it("shows an honest empty state when there is nothing to read", async () => {
    listingThreads.load.mockResolvedValue({ threads: [], error: null });
    renderPage();

    expect(await screen.findByText("No conversations yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse rooms" })).toBeTruthy();
  });

  it("surfaces a failed inbox load with a retry", async () => {
    listingThreads.load.mockResolvedValue({
      threads: [],
      error: "Could not load this conversation. Please try again.",
    });
    renderPage();

    expect(
      await screen.findByText(/Could not load this conversation/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("filters the inbox by agents, property owners and roommates", async () => {
    connectionsHook.state.connections = [connection];
    listingThreads.load.mockResolvedValue({
      threads: [lectureThread, agentThread],
      error: null,
    });
    renderPage();

    expect(await screen.findByText("Ada Rooms")).toBeTruthy();
    expect(screen.getByText("Bode Estates")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chat with Amara O." })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByText("Bode Estates")).toBeTruthy();
    expect(screen.queryByText("Ada Rooms")).toBeNull();
    expect(screen.queryByRole("link", { name: "Chat with Amara O." })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Property owners" }));
    expect(screen.getByText("Ada Rooms")).toBeTruthy();
    expect(screen.queryByText("Bode Estates")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Roommates" }));
    expect(screen.getByRole("link", { name: "Chat with Amara O." })).toBeTruthy();
    expect(screen.queryByText("Ada Rooms")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Ada Rooms")).toBeTruthy();
    expect(screen.getByText("Bode Estates")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chat with Amara O." })).toBeTruthy();
  });

  it("lists groups and opens the group thread", async () => {
    groupsHook.state.groups = [groupSummary];
    renderPage();

    expect(await screen.findByText("Akoka Flatmates")).toBeTruthy();
    expect(screen.getByText("3 new")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Akoka Flatmates/ }));

    const sheet = await screen.findByRole("dialog", {
      name: "Akoka Flatmates",
    });
    expect(within(sheet).getByLabelText("Message")).toBeTruthy();
  });

  it("creates a group from people you have talked to", async () => {
    groupApi.create.mockResolvedValue({ groupId: "group-2", error: null });
    renderPage();

    await screen.findByText("Ada Rooms");
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    const sheet = await screen.findByRole("dialog", {
      name: "Create a group",
    });
    const createButton = within(sheet).getByRole("button", {
      name: "Create group",
    }) as HTMLButtonElement;

    // One pick is not a group.
    expect(createButton.disabled).toBe(true);
    fireEvent.click(
      await within(sheet).findByRole("button", { name: /Amara O\./ }),
    );
    expect(createButton.disabled).toBe(true);

    fireEvent.click(within(sheet).getByRole("button", { name: /Bode Estates/ }));
    expect(createButton.disabled).toBe(false);

    fireEvent.click(createButton);
    await waitFor(() => expect(groupApi.create).toHaveBeenCalledTimes(1));
    expect(groupApi.create.mock.calls[0]?.[1]).toMatchObject({
      memberIds: ["user-2", "user-3"],
    });
  });
});
