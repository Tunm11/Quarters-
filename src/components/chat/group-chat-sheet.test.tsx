import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupChatSheet } from "@/components/chat/group-chat-sheet";
import type { ChatGroupMessage } from "@/chat/groups";
import type { PublicListing } from "@/listings/public-listings";

const chatState = vi.hoisted(() => ({
  state: {
    messages: [] as unknown[],
    readers: [] as unknown[],
    loading: false,
    error: null as string | null,
    sending: false,
    send: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("@/chat/use-group-chat", () => ({
  useGroupChat: () => chatState.state,
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const visitsApi = vi.hoisted(() => ({
  load: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@/chat/group-visits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/chat/group-visits")>();
  return {
    ...actual,
    loadGroupVisitRequest: visitsApi.load,
    requestGroupVisit: visitsApi.request,
  };
});

const listing = {
  id: "listing-1",
  title: "Quiet private room in Yaba",
  city: "Lagos",
  neighbourhood: "Yaba",
  rent_amount: 550000,
  rent_period: "year",
  cover_image_url: null,
  photo_urls: [],
} as unknown as PublicListing;

vi.mock("@/listings/public-listings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/public-listings")>();
  return {
    ...actual,
    loadListingsByIds: async () => new Map([[listing.id, listing]]),
  };
});

const fromRoommate: ChatGroupMessage = {
  id: "message-1",
  sender_id: "user-2",
  sender_name: "Ada M.",
  body: "Saturday works for me. I will bring a tape measure and check the water pressure.",
  created_at: "2026-10-25T11:20:00.000Z",
  shared_listing_id: "listing-1",
  image_path: null,
  edited_at: null,
  deleted_at: null,
};

const fromMe: ChatGroupMessage = {
  id: "message-2",
  sender_id: "user-1",
  sender_name: "You",
  body: "I am in for Saturday.",
  created_at: "2026-10-25T11:25:00.000Z",
  shared_listing_id: null,
  image_path: null,
  edited_at: null,
  deleted_at: null,
};

function renderSheet() {
  return render(
    <MemoryRouter>
      <GroupChatSheet
        open
        onClose={() => {}}
        group={{
          groupId: "group-1",
          name: "The room",
          memberNames: "Ada M., QUARTERS Demo Listings",
          createdBy: "user-1",
          avatarPath: null,
        }}
        viewerId="user-1"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  chatState.state.messages = [fromRoommate, fromMe];
  chatState.state.readers = [];
  chatState.state.error = null;
  visitsApi.load.mockReset();
  visitsApi.load.mockResolvedValue({ requested: false, error: null });
  visitsApi.request.mockReset();
  visitsApi.request.mockResolvedValue({ requested: true, error: null });
});

describe("GroupChatSheet", () => {
  it("labels each message with who sent it", async () => {
    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    expect(within(sheet).getByText("Ada M.")).toBeTruthy();
    expect(within(sheet).getByText("You")).toBeTruthy();
    expect(
      within(sheet).getByText(/I will bring a tape measure/),
    ).toBeTruthy();
    expect(within(sheet).getByText("I am in for Saturday.")).toBeTruthy();
  });

  it("asks for a group visit on a shared property", async () => {
    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    fireEvent.click(
      await within(sheet).findByRole("button", { name: "Group visit" }),
    );

    expect(visitsApi.request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        groupId: "group-1",
        listingId: "listing-1",
        userId: "user-1",
      }),
    );
    expect(
      await within(sheet).findByText(
        "Group visit requested · the lister can see the whole group.",
      ),
    ).toBeTruthy();
  });

  it("shows the group request as already made", async () => {
    visitsApi.load.mockResolvedValue({ requested: true, error: null });

    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    expect(
      await within(sheet).findByText(
        "Group visit requested · the lister can see the whole group.",
      ),
    ).toBeTruthy();
    expect(
      within(sheet).queryByRole("button", { name: "Group visit" }),
    ).toBeNull();
  });

  it("names who has read your message", async () => {
    chatState.state.readers = [
      {
        user_id: "user-2",
        display_name: "Ada M.",
        last_read_at: "2026-10-25T12:00:00.000Z",
      },
      {
        user_id: "user-3",
        display_name: "Bode",
        last_read_at: "2026-10-25T09:00:00.000Z",
      },
    ];

    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    // Ada read past 11:25, Bode did not.
    expect(within(sheet).getByText("Seen by Ada M.")).toBeTruthy();
    expect(within(sheet).queryByText(/Seen by Ada M\. and Bode/)).toBeNull();
  });

  it("narrows the thread from the search strip", async () => {
    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Search this group" }),
    );
    fireEvent.change(within(sheet).getByLabelText("Search group messages"), {
      target: { value: "tape measure" },
    });

    expect(within(sheet).getByText(/I will bring a tape measure/)).toBeTruthy();
    expect(within(sheet).queryByText("I am in for Saturday.")).toBeNull();
    expect(within(sheet).getByRole("status").textContent).toBe("1 of 2");
  });

  it("renders a shared room as a property card", async () => {
    renderSheet();

    const sheet = await screen.findByRole("dialog", { name: "The room" });
    const card = await within(sheet).findByRole("link", {
      name: /Quiet private room in Yaba/,
    });
    expect(card.getAttribute("href")).toBe("/property/listing-1");
    expect(within(card).getByText("Quiet private room in Yaba")).toBeTruthy();
  });
});
