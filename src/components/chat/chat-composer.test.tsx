import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat/chat-composer";
import type { PublicListing } from "@/listings/public-listings";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

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
    loadPublicListings: async () => ({ listings: [listing], error: null }),
  };
});

function renderComposer(onSend = vi.fn().mockResolvedValue(null)) {
  render(
    <MemoryRouter>
      <ChatComposer
        inputId="message"
        placeholder="Message the group…"
        maxLength={1000}
        sending={false}
        mediaKind="group"
        conversationId="group-1"
        onSend={onSend}
      />
    </MemoryRouter>,
  );
  return onSend;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatComposer", () => {
  it("attaches a property card and sends it with the typed message", async () => {
    const onSend = renderComposer();

    fireEvent.click(
      screen.getByRole("button", { name: "Add a photo or property card" }),
    );
    const menu = await screen.findByRole("dialog", {
      name: "Add to your message",
    });
    fireEvent.click(within(menu).getByRole("button", { name: /Property card/ }));

    const picker = await screen.findByRole("dialog", {
      name: "Attach a property card",
    });
    fireEvent.click(
      await within(picker).findByRole("button", {
        name: /Quiet private room in Yaba/,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Remove property card" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "What do you think of this one?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        body: "What do you think of this one?",
        sharedListingId: "listing-1",
        imagePath: null,
      }),
    );
  });

  it("can send a card on its own with a readable caption", async () => {
    const onSend = renderComposer();

    fireEvent.click(
      screen.getByRole("button", { name: "Add a photo or property card" }),
    );
    const menu = await screen.findByRole("dialog", {
      name: "Add to your message",
    });
    fireEvent.click(within(menu).getByRole("button", { name: /Property card/ }));
    const picker = await screen.findByRole("dialog", {
      name: "Attach a property card",
    });
    fireEvent.click(
      await within(picker).findByRole("button", {
        name: /Quiet private room in Yaba/,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        body: "Have a look at Quiet private room in Yaba.",
        sharedListingId: "listing-1",
        imagePath: null,
      }),
    );
  });

  it("rejects a file the bucket would refuse", async () => {
    renderComposer();

    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Choose a JPEG, PNG or WebP photo."),
    ).toBeTruthy();
  });
});
