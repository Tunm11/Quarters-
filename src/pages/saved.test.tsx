import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedPage from "@/pages/saved";
import type { PublicListing } from "@/listings/public-listings";

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    user: { id: "user-1", email: "student@example.com" },
  }),
}));

const roomsHook = vi.hoisted(() => ({
  state: {
    listings: [] as unknown[],
    collectionByListing: new Map() as Map<string, string | null>,
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    remove: vi.fn(),
    move: vi.fn(),
    reload: vi.fn(),
  },
}));

const collectionsHook = vi.hoisted(() => ({
  state: {
    collections: [] as { id: string; name: string; created_at: string }[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("@/listings/use-saved-listings", () => ({
  useSavedRooms: () => roomsHook.state,
  useSavedCollections: () => collectionsHook.state,
}));

const searchesHook = vi.hoisted(() => ({
  state: {
    searches: [] as {
      id: string;
      name: string;
      query: string;
      category: "all" | "private" | "shared" | "hostel";
      budget_min: number | null;
      budget_max: number | null;
      types: string[];
      bedrooms: number[];
      facilities: string[];
      notify: boolean;
      created_at: string;
    }[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    busyId: null as string | null,
    reload: vi.fn(),
    rename: vi.fn(),
    setNotify: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/listings/use-saved-searches", () => ({
  useSavedSearches: () => searchesHook.state,
}));

const savedRoom = {
  id: "listing-1",
  title: "Quiet private room in Yaba",
  city: "Lagos",
  neighbourhood: "Yaba",
  rent_amount: 550000,
  rent_period: "year",
  accommodation_type: "private_room",
  availability_status: "available",
  facilities: ["Wi-Fi"],
  cover_image_url: null,
  photo_urls: [],
} as unknown as PublicListing;

const secondRoom = {
  ...savedRoom,
  id: "listing-2",
  title: "Bright self-contained in Akoka",
  neighbourhood: "Akoka",
  rent_amount: 900000,
} as unknown as PublicListing;

const nearbyCollection = {
  id: "collection-1",
  name: "Near campus",
  created_at: "2026-10-25T09:00:00Z",
};

const akokaSearch = {
  id: "search-1",
  name: "Akoka under ₦800k",
  query: "akoka",
  category: "private" as const,
  budget_min: 0,
  budget_max: 800000,
  types: ["private_room"],
  bedrooms: [1],
  facilities: ["Wi-Fi"],
  notify: true,
  created_at: "2026-10-26T08:00:00Z",
};

function renderPage(entry = "/saved") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SavedPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  roomsHook.state.listings = [];
  roomsHook.state.collectionByListing = new Map();
  roomsHook.state.status = "ready";
  roomsHook.state.error = null;
  roomsHook.state.remove.mockReset();
  roomsHook.state.move.mockReset();
  collectionsHook.state.collections = [];
  collectionsHook.state.status = "ready";
  collectionsHook.state.error = null;
  collectionsHook.state.create.mockReset();
  searchesHook.state.searches = [];
  searchesHook.state.status = "ready";
  searchesHook.state.error = null;
  searchesHook.state.busyId = null;
  searchesHook.state.setNotify.mockReset();
  searchesHook.state.rename.mockReset();
  searchesHook.state.remove.mockReset();
});

describe("Saved rooms tab", () => {
  it("explains the shortlist when nothing is saved", () => {
    renderPage();

    expect(screen.getByText("Nothing saved yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore rooms/ })).toBeTruthy();
  });

  it("lists saved rooms and removes one on bookmark tap", () => {
    roomsHook.state.listings = [savedRoom];
    renderPage();

    expect(screen.getByText("Quiet private room in Yaba")).toBeTruthy();
    expect(screen.getByText("1 room kept for quick comparison.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Quiet private room in Yaba from saved",
      }),
    );

    expect(roomsHook.state.remove).toHaveBeenCalledWith("listing-1");
  });

  it("surfaces a failed load with a retry", () => {
    roomsHook.state.status = "error";
    roomsHook.state.error = "Could not load your saved rooms.";
    renderPage();

    expect(screen.getByText("Could not load your saved rooms.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("filters the shortlist by collection and files a room into one", () => {
    roomsHook.state.listings = [savedRoom, secondRoom];
    roomsHook.state.collectionByListing = new Map([["listing-2", "collection-1"]]);
    collectionsHook.state.collections = [nearbyCollection];
    renderPage();

    // Both rooms are shown under "All rooms"; the chips count what is where.
    expect(screen.getByRole("button", { name: "Near campus (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unsorted (1)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Near campus (1)" }));
    expect(screen.getByText("Bright self-contained in Akoka")).toBeTruthy();
    expect(screen.queryByText("Quiet private room in Yaba")).toBeNull();

    // Filing a room uses the control under its card.
    roomsHook.state.collectionByListing = new Map();
    fireEvent.click(screen.getByRole("button", { name: "All rooms (2)" }));
    fireEvent.change(screen.getByLabelText("Collection for Quiet private room in Yaba"), {
      target: { value: "collection-1" },
    });

    expect(roomsHook.state.move).toHaveBeenCalledWith("listing-1", "collection-1");
  });

  it("compares the rooms picked from the shortlist side by side", () => {
    roomsHook.state.listings = [savedRoom, secondRoom];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Compare/ }));

    const compareButton = screen.getByRole("button", { name: /Compare.*rooms/ });
    expect((compareButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Quiet private room in Yaba/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Bright self-contained in Akoka/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Compare 2 rooms/ }));

    const sheet = screen.getByRole("dialog", { name: "Compare 2 rooms" });
    expect(within(sheet).getByText("Quiet private room in Yaba")).toBeTruthy();
    expect(within(sheet).getByText("Bright self-contained in Akoka")).toBeTruthy();
    expect(within(sheet).getByText("Lowest")).toBeTruthy();
  });

  it("offers to share the visible shortlist with a roommate", () => {
    roomsHook.state.listings = [savedRoom];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Share shortlist/ }));

    const sheet = screen.getByRole("dialog", { name: "Share your shortlist" });
    expect(within(sheet).getByText(/Send 1 room/)).toBeTruthy();
  });
});

describe("Saved searches tab", () => {
  it("opens on the searches view when the link asks for it", () => {
    searchesHook.state.searches = [akokaSearch];
    renderPage("/saved?tab=searches");

    expect(screen.getByRole("heading", { name: "Saved searches", level: 1 })).toBeTruthy();
    expect(screen.getByText("Akoka under ₦800k")).toBeTruthy();
    expect(
      screen.getByText("“akoka” · Private rooms · Under ₦800k · Private room · 1 bedroom · Wi-Fi"),
    ).toBeTruthy();
  });

  it("switches between rooms and searches from the view control", () => {
    roomsHook.state.listings = [savedRoom];
    searchesHook.state.searches = [akokaSearch];
    renderPage();

    expect(screen.getByText("Quiet private room in Yaba")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Saved searches/ }));

    expect(screen.getByText("Akoka under ₦800k")).toBeTruthy();
    expect(screen.queryByText("Quiet private room in Yaba")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Saved rooms/ }));

    expect(screen.getByText("Quiet private room in Yaba")).toBeTruthy();
  });

  it("reopens a saved search on Explore through the URL", () => {
    searchesHook.state.searches = [akokaSearch];
    renderPage("/saved?tab=searches");

    const link = screen.getByRole("link", { name: /View results/ });
    expect(link.getAttribute("href")).toContain("q=akoka");
    expect(link.getAttribute("href")).toContain("type");
  });

  it("toggles the alert for one search", () => {
    searchesHook.state.searches = [akokaSearch];
    renderPage("/saved?tab=searches");

    fireEvent.click(
      screen.getByRole("switch", {
        name: /Notify me when a new room matches Akoka under ₦800k/,
      }),
    );

    expect(searchesHook.state.setNotify).toHaveBeenCalledWith("search-1", false);
  });

  it("explains the empty state and points at Explore", () => {
    renderPage("/saved?tab=searches");

    expect(screen.getByText("No saved searches yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Build a search/ })).toBeTruthy();
  });

  it("surfaces a failed search load with a retry", () => {
    searchesHook.state.status = "error";
    searchesHook.state.error = "Saved searches are not available yet.";
    renderPage("/saved?tab=searches");

    expect(screen.getByText("Saved searches are not available yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });
});
