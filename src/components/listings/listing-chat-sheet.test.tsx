import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingChatSheet } from "@/components/listings/listing-chat-sheet";

const chatState = vi.hoisted(() => ({
  state: {
    messages: [] as unknown[],
    loading: false,
    error: null as string | null,
    sending: false,
    send: vi.fn(),
    reload: vi.fn(async () => {}),
  },
}));

vi.mock("@/listings/use-listing-chat", () => ({
  useListingChat: () => chatState.state,
}));

vi.mock("@/chat/use-chat-attachments", () => ({
  useChatAttachments: () => ({ listings: new Map(), imageUrls: new Map() }),
}));

vi.mock("@/chat/typing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/chat/typing")>();
  return {
    ...actual,
    useTypingIndicator: () => ({
      typingIds: [],
      notifyTyping: vi.fn(),
      stopTyping: vi.fn(),
    }),
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const reportApi = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("@/listings/listing-reports", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/listing-reports")>();
  return { ...actual, submitListingReport: reportApi.submit };
});

function renderChat({ viewerId = "user-1", studentId = "user-1" } = {}) {
  return render(
    <ListingChatSheet
      open
      onClose={() => {}}
      listingId="listing-1"
      listingTitle="Quiet room in Yaba"
      studentId={studentId}
      viewerId={viewerId}
      peerLabel="Bode Estates"
    />,
  );
}

beforeEach(() => {
  reportApi.submit.mockReset();
  reportApi.submit.mockResolvedValue({ error: null, duplicate: false });
});

describe("reporting a room from the conversation", () => {
  it("files the report from the lister chat and says what happens next", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report this room" }));

    const dialog = await screen.findByRole("dialog", { name: "Report this listing" });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Looks like a scam/ }),
    );
    fireEvent.change(within(dialog).getByLabelText(/Anything else/), {
      target: { value: "Asked for a deposit before any viewing." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));

    await waitFor(() => {
      expect(reportApi.submit).toHaveBeenCalledTimes(1);
    });
    expect(reportApi.submit.mock.calls[0][1]).toMatchObject({
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "scam",
      details: "Asked for a deposit before any viewing.",
    });
    expect(
      await screen.findByText(/Thanks — an administrator will review this room/),
    ).toBeTruthy();
  });

  it("answers a repeat report honestly instead of silently dropping it", async () => {
    reportApi.submit.mockResolvedValue({ error: null, duplicate: true });
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report this room" }));

    const dialog = await screen.findByRole("dialog", { name: "Report this listing" });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Already taken/ }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByText(/You had already reported this room/),
    ).toBeTruthy();
  });

  it("keeps a failure on the form", async () => {
    reportApi.submit.mockResolvedValue({
      error: "Could not send your report. Please try again.",
      duplicate: false,
    });
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report this room" }));

    const dialog = await screen.findByRole("dialog", { name: "Report this listing" });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Looks like a scam/ }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));

    expect(
      await within(dialog).findByText(/Could not send your report/),
    ).toBeTruthy();
  });

  it("offers no report option to the lister answering a student", () => {
    renderChat({ viewerId: "user-9", studentId: "user-1" });

    expect(screen.queryByRole("button", { name: "Conversation options" })).toBeNull();
  });
});
