import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisitsPage from "@/pages/visits";
import type { MyVisit } from "@/listings/my-visits";
import type { PublicListing } from "@/listings/public-listings";

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    user: { id: "user-1", email: "student@example.com" },
  }),
}));

vi.mock("@/components/listings/listing-chat-sheet", () => ({
  ListingChatSheet: () => null,
}));

const visitsHook = vi.hoisted(() => ({
  state: {
    visits: [] as unknown[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    cancellingId: null as string | null,
    cancel: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("@/listings/use-my-visits", () => ({
  useMyVisits: () => visitsHook.state,
}));

const yabaRoom = {
  id: "listing-1",
  title: "Quiet private room in Yaba",
  city: "Lagos",
  neighbourhood: "Yaba",
  rent_amount: 550000,
  rent_period: "year",
  cover_image_url: null,
  photo_urls: [],
} as unknown as PublicListing;

function visit(
  id: string,
  status: MyVisit["request"]["status"],
  scheduledFor: string,
  listing: PublicListing | null = yabaRoom,
): MyVisit {
  return {
    request: {
      id,
      listing_id: listing?.id ?? "listing-gone",
      scheduled_for: scheduledFor,
      status,
      note: null,
      created_at: "2026-10-01T09:00:00.000Z",
    },
    listing,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/visits"]}>
      <VisitsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  visitsHook.state.visits = [];
  visitsHook.state.status = "ready";
  visitsHook.state.error = null;
  visitsHook.state.cancellingId = null;
  visitsHook.state.cancel.mockReset();
  visitsHook.state.cancel.mockResolvedValue(null);
});

describe("My Visits screen", () => {
  it("shows an empty state before any visit is booked", () => {
    renderPage();

    expect(screen.getByText("No visits yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore rooms/ })).toBeTruthy();
  });

  it("lists a confirmed visit under Coming up and cancels it", async () => {
    visitsHook.state.visits = [
      visit("visit-1", "confirmed", "2099-01-10T10:00:00.000Z"),
    ];
    renderPage();

    expect(screen.getByText("Coming up")).toBeTruthy();
    expect(screen.getByText("Quiet private room in Yaba")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel visit" }));

    await waitFor(() =>
      expect(visitsHook.state.cancel).toHaveBeenCalledWith("visit-1"),
    );
  });

  it("moves answered visits into the history list", () => {
    visitsHook.state.visits = [
      visit("visit-2", "declined", "2099-02-10T10:00:00.000Z"),
    ];
    renderPage();

    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Declined")).toBeTruthy();
    expect(screen.queryByText("Coming up")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel visit" })).toBeNull();
  });

  it("does not claim a passed slot is still confirmed", () => {
    visitsHook.state.visits = [
      visit("visit-5", "confirmed", "2020-05-10T10:00:00.000Z"),
    ];
    renderPage();

    expect(screen.getByText("Visit passed")).toBeTruthy();
    expect(screen.queryByText("Confirmed")).toBeNull();
  });

  it("keeps a visit whose room left the catalogue", () => {
    visitsHook.state.visits = [
      visit("visit-3", "completed", "2020-01-10T10:00:00.000Z", null),
    ];
    renderPage();

    expect(screen.getByText("Room no longer listed")).toBeTruthy();
    expect(screen.getByText("Visited")).toBeTruthy();
  });

  it("surfaces a failed cancellation on the card", async () => {
    visitsHook.state.visits = [
      visit("visit-4", "pending", "2099-03-10T10:00:00.000Z"),
    ];
    visitsHook.state.cancel.mockResolvedValue(
      "It's less than 24 hours to this visit, so it can no longer be cancelled.",
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Cancel visit" }));

    expect(
      await screen.findByText(/less than 24 hours/),
    ).toBeTruthy();
  });
});
