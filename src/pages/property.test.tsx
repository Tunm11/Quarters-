import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PropertyPage from "@/pages/property";
import type { PublicListingDetail } from "@/listings/listing-detail";

const detailState = vi.hoisted(() => ({ current: {} as unknown }));

vi.mock("@/listings/use-listing-detail", () => ({
  useListingDetail: () => detailState.current,
}));

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

const savedHook = vi.hoisted(() => ({
  state: {
    ids: [] as string[],
    idSet: new Set<string>(),
    status: "ready" as const,
    error: null,
    toggle: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("@/listings/use-saved-listings", () => ({
  useSavedListingIds: () => savedHook.state,
}));

const viewingMocks = vi.hoisted(() => ({
  load: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
}));

const connectionsHook = vi.hoisted(() => ({
  state: { connections: [] as unknown[], status: "ready", error: null },
}));

vi.mock("@/roommates/use-roommate-connections", () => ({
  useRoommateConnections: () => connectionsHook.state,
}));

const shareMocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/roommates/listing-shares", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/roommates/listing-shares")>();
  return { ...actual, sendListingToRoommate: shareMocks.send };
});

const roomMocks = vi.hoisted(() => ({
  loadBooked: vi.fn(),
  loadReservation: vi.fn(),
}));

vi.mock("@/listings/room-bookings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/room-bookings")>();
  return {
    ...actual,
    loadBookedRooms: roomMocks.loadBooked,
    loadMyRoomReservation: roomMocks.loadReservation,
  };
});

vi.mock("@/listings/viewing-requests", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/viewing-requests")>();
  return {
    ...actual,
    loadOpenViewingRequest: viewingMocks.load,
    requestViewing: viewingMocks.request,
    cancelViewingRequest: viewingMocks.cancel,
  };
});

// The page now loads reviews, availability holds and the caller's report
// alongside the listing; an empty, chainable client keeps those reads quiet.
const supabaseStub = vi.hoisted(() => {
  const rows = { data: [], error: null };
  const scalar = { data: null, error: null };
  const query: Record<string, unknown> = {};
  const chain = () => query;
  Object.assign(query, {
    select: chain,
    eq: chain,
    order: chain,
    limit: chain,
    maybeSingle: async () => scalar,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  });

  return { from: () => query, rpc: async () => scalar };
});

vi.mock("@/lib/supabase", () => ({ supabase: supabaseStub }));

// The listing chat talks to the database only when a thread is open; this page
// test covers the entry point, so the thread itself is stubbed.
vi.mock("@/listings/listing-messages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/listing-messages")>();
  return {
    ...actual,
    loadListingMessages: async () => ({ messages: [], error: null }),
    markListingMessagesRead: async () => ({ error: null }),
  };
});

function AuthProbe() {
  const location = useLocation();
  return <p data-testid="auth-location">{`${location.pathname}${location.search}`}</p>;
}

const listing: PublicListingDetail = {
  id: "listing-1",
  title: "Furnished hostel bed in Akoka",
  description:
    "A furnished hostel bed a short walk from the campus gate, with steady water, backup power and a quiet study room on the same floor. The block has twelve bed spaces, a shared kitchen and overnight security, and rent is charged per session rather than per month.",
  accommodation_type: "hostel",
  institution: "University of Lagos",
  city: "Lagos",
  neighbourhood: "Akoka",
  rent_amount: 250000,
  rent_period: "term",
  availability_status: "limited",
  bedrooms: 1,
  bathrooms: 2,
  furnishing_status: "furnished",
  facilities: ["Wi-Fi", "Water", "Backup power", "Study room"],
  first_published_at: "2026-10-24T09:00:00+00:00",
  created_at: "2026-10-24T09:00:00+00:00",
  cover_image_url: "https://example.supabase.co/storage/v1/object/sign/cover.jpg",
  photo_urls: [
    "https://example.supabase.co/storage/v1/object/sign/cover.jpg",
    "https://example.supabase.co/storage/v1/object/sign/room.jpg",
  ],
  property_rules: ["Quiet hours after 10pm", "No smoking"],
  total_rooms: 12,
  rent_session_months: 9,
  agency_fee_amount: 25000,
  caution_deposit_amount: 50000,
  utilities_amount: 15000,
  utilities_period: "month",
  utilities_note: "Metered; estimate for one student",
  available_from: "2026-11-01",
  verified_at: "2026-10-20T09:00:00+00:00",
  inspected_at: "2026-10-22T09:00:00+00:00",
  photos: [
    {
      path: "provider/listing/cover.jpg",
      url: "https://example.supabase.co/storage/v1/object/sign/cover.jpg",
      alt: "Front of the hostel",
    },
    {
      path: "provider/listing/room.jpg",
      url: "https://example.supabase.co/storage/v1/object/sign/room.jpg",
      alt: null,
    },
  ],
  provider: {
    id: "provider-1",
    display_name: "Ada Rooms",
    kind: "agent",
    created_at: "2026-03-02T10:00:00+00:00",
  },
};

function setDetailState(overrides: Record<string, unknown> = {}) {
  detailState.current = {
    listing,
    status: "ready",
    error: null,
    reload: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/property/listing-1"]}>
      <Routes>
        <Route path="/property/:id" element={<PropertyPage />} />
        <Route path="/auth" element={<AuthProbe />} />
        <Route path="/roommate/:id" element={<AuthProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.status = "signedIn";
  authState.user = { id: "user-1", email: "student@example.com" };
  viewingMocks.load.mockReset();
  viewingMocks.load.mockResolvedValue({ request: null, error: null });
  viewingMocks.request.mockReset();
  viewingMocks.cancel.mockReset();
  roomMocks.loadBooked.mockReset();
  roomMocks.loadBooked.mockResolvedValue({ booked: [], error: null });
  roomMocks.loadReservation.mockReset();
  roomMocks.loadReservation.mockResolvedValue({
    reservation: null,
    error: null,
  });
  shareMocks.send.mockReset();
  connectionsHook.state.connections = [];
  setDetailState();
});

describe("Property details screen", () => {
  it("renders the reference layout: gallery, stats, price, terms, amenities, provider", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Furnished hostel bed in Akoka",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Akoka, Lagos")).toBeTruthy();
    expect(screen.getByText(/Near University of Lagos/)).toBeTruthy();

    // Photo counter and gallery controls come from the real signed URLs.
    expect(screen.getByText("1/2")).toBeTruthy();
    const firstImage = document.querySelector<HTMLImageElement>("img");
    expect(firstImage?.getAttribute("src")).toContain("cover.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(
      document.querySelector<HTMLImageElement>("img")?.getAttribute("src"),
    ).toContain("room.jpg");

    // Rent is priced per 9-month session, and the room count is shown. The
    // amount also appears in the move-in cost breakdown, so it is matched
    // against the price headline rather than assumed unique.
    expect(screen.getAllByText(/250,000/).length).toBeGreaterThan(0);
    expect(screen.getByText("/ 9-month session")).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getByText("Rooms")).toBeTruthy();
    expect(screen.getByText("9 mo")).toBeTruthy();

    // Availability and room type are backed by real fields.
    expect(screen.getAllByText("Limited spots").length).toBeGreaterThan(0);
    expect(screen.getByText("Hostel")).toBeTruthy();

    // Amenities keep their stored names on the details screen.
    expect(screen.getByText("Wi-Fi")).toBeTruthy();
    expect(screen.getByText("Study room")).toBeTruthy();

    // House rules and the managing provider.
    expect(screen.getByText("Quiet hours after 10pm")).toBeTruthy();
    expect(screen.getByText("Ada Rooms")).toBeTruthy();
    expect(screen.getByText(/approved provider/)).toBeTruthy();
    expect(
      screen.getByText(/Phone numbers and\s+emails are not published/),
    ).toBeTruthy();
  });

  it("lists what QUARTERS checked, with the date of each check", () => {
    renderPage();

    const panel = screen.getByRole("region", { name: "What QUARTERS checked" });
    expect(within(panel).getByText("Provider approved")).toBeTruthy();
    expect(within(panel).getByText("Listing verified")).toBeTruthy();
    expect(within(panel).getByText("Property inspected")).toBeTruthy();
    expect(within(panel).getByText("Checked 20 Oct 2026")).toBeTruthy();
    expect(within(panel).getByText("Checked 22 Oct 2026")).toBeTruthy();
    // The marks are never sold as a guarantee.
    expect(within(panel).getByText(/not a tenancy guarantee/)).toBeTruthy();
  });

  it("says a listing is unchecked rather than implying a badge it lacks", () => {
    setDetailState({
      listing: { ...listing, verified_at: null, inspected_at: null },
    });
    renderPage();

    const panel = screen.getByRole("region", { name: "What QUARTERS checked" });
    expect(within(panel).getAllByText("Not checked yet")).toHaveLength(2);
    expect(within(panel).queryByText(/Checked \d/)).toBeNull();
  });

  it("expands the description with Read more", () => {
    renderPage();

    const readMore = screen.getByRole("button", { name: /Read more/ });
    expect(readMore.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(readMore);
    expect(
      screen.getByRole("button", { name: /Read less/ }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("offers visit days and slots that can be selected", () => {
    renderPage();

    const dayGroup = screen.getByRole("group", { name: "Visit day" });
    const dayButtons = within(dayGroup).getAllByRole("button");
    expect(dayButtons).toHaveLength(5);
    expect(dayButtons[0].getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(dayButtons[1]);
    expect(dayButtons[1].getAttribute("aria-pressed")).toBe("true");
    expect(dayButtons[0].getAttribute("aria-pressed")).toBe("false");

    const timeGroup = screen.getByRole("group", { name: "Visit time" });
    const midday = within(timeGroup).getByRole("button", { name: "12:00" });
    fireEvent.click(midday);
    expect(midday.getAttribute("aria-pressed")).toBe("true");

    // The fee line is gone, but the card still says the viewing is free.
    expect(screen.getByText(/Free viewing/)).toBeTruthy();
  });

  it("validates the selection before sending a request", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(
      await screen.findByText("Choose a time for your visit."),
    ).toBeTruthy();
    expect(viewingMocks.request).not.toHaveBeenCalled();
  });

  it("sends a pending request for the chosen slot and confirms it", async () => {
    viewingMocks.request.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2026-10-27T12:00:00.000Z",
        status: "pending",
      },
      error: null,
    });

    renderPage();

    const timeGroup = screen.getByRole("group", { name: "Visit time" });
    fireEvent.click(within(timeGroup).getByRole("button", { name: "12:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => {
      expect(viewingMocks.request).toHaveBeenCalledTimes(1);
    });

    const [, input] = viewingMocks.request.mock.calls[0] as [
      unknown,
      { listingId: string; requesterId: string; scheduledFor: string },
    ];
    expect(input.listingId).toBe("listing-1");
    expect(input.requesterId).toBe("user-1");
    // Local 12:00 on the selected day, as an absolute timestamp.
    expect(new Date(input.scheduledFor).getHours()).toBe(12);

    expect(await screen.findByText(/Visit requested for/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Visit day" })).toBeNull();
  });

  it("sends the room to a connected roommate and opens the chat", async () => {
    connectionsHook.state.connections = [
      {
        id: "profile-1",
        display_name: "Amara O.",
        headline: null,
        institution: null,
        city: "Lagos",
        neighbourhood: "Akoka",
        budget_amount: null,
        currency: "NGN",
        move_in_date: null,
        bio: null,
        avatar_url: null,
        traits: null,
        connected_at: "2026-10-24T10:00:00Z",
      },
    ];
    shareMocks.send.mockResolvedValue({
      message: {
        id: "message-1",
        sender_id: "user-1",
        body: "Have a look at Furnished hostel bed in Akoka.",
        created_at: "2026-10-24T10:00:00Z",
        read_at: null,
        shared_listing_id: "listing-1",
      },
      error: null,
    });

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Send this room to a roommate" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Send to a roommate" });
    expect(within(sheet).getByText("Amara O.")).toBeTruthy();

    fireEvent.click(within(sheet).getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(shareMocks.send).toHaveBeenCalledWith(supabaseStub, {
        profileId: "profile-1",
        studentId: "user-1",
        senderId: "user-1",
        listingId: "listing-1",
        listingTitle: "Furnished hostel bed in Akoka",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("auth-location").textContent).toBe(
        "/roommate/profile-1?chat=1",
      );
    });
  });

  it("opens a chat with the lister from the Listed by card", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Message agent" }));

    const sheet = screen.getByRole("dialog", { name: "Chat with Ada Rooms" });
    expect(within(sheet).getByLabelText("Message")).toBeTruthy();
    expect(
      await within(sheet).findByText(/No messages yet/),
    ).toBeTruthy();
  });

  it("sends a signed-out visitor to sign in before messaging the lister", () => {
    authState.status = "signedOut";
    authState.user = null;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Message agent" }));

    expect(screen.getByTestId("auth-location").textContent).toBe(
      "/auth?returnTo=%2Fproperty%2Flisting-1",
    );
    expect(screen.queryByRole("dialog", { name: /Chat with/ })).toBeNull();
  });

  it("offers the shared booking card instead of a separate room picker once the visit is confirmed", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2030-10-27T12:00:00.000Z",
        status: "confirmed",
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Book together" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose your room" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Choose your room" })).toBeNull();
  });

  it("offers no separate room picker before the visit is confirmed", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2030-10-27T12:00:00.000Z",
        status: "pending",
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Visit requested for/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose your room" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Book together" })).toBeNull();
  });

  it("turns the visit card into a booking tab once the viewing has passed", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2020-01-10T10:00:00.000Z",
        status: "confirmed",
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Book this room" }),
    ).toBeTruthy();
    const callToAction = screen.getByRole("button", { name: "Book this room" });
    expect(callToAction.className).toContain("bg-accent");
    expect(screen.queryByText(/Visit requested for/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel visit" })).toBeNull();
    // The separate split card belongs to the scheduling view, not this tab.
    expect(screen.queryByRole("heading", { name: "Book together" })).toBeNull();
  });

  it("explains a room request the lister declined", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2020-01-10T10:00:00.000Z",
        status: "confirmed",
      },
      error: null,
    });
    roomMocks.loadReservation.mockResolvedValue({
      reservation: {
        roomNumber: 7,
        status: "declined",
        bookingGroupId: "group-1",
        requestedAt: "2026-10-20T10:00:00.000Z",
        resolvedAt: "2026-10-21T10:00:00.000Z",
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText(/declined your request for Room 7/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book this room" })).toBeTruthy();
  });

  it("offers the room to book when the provider marked the visit completed", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2026-10-20T10:00:00.000Z",
        status: "completed",
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Book this room" }),
    ).toBeTruthy();
    expect(screen.getByText(/Your visit is done/)).toBeTruthy();
  });

  it("warns before cancelling a visit and then offers the schedule again", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2030-10-27T12:00:00.000Z",
        status: "pending",
      },
      error: null,
    });
    viewingMocks.cancel.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2030-10-27T12:00:00.000Z",
        status: "cancelled",
      },
      error: null,
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel visit" }));

    // The warning comes first: nothing is cancelled until it is confirmed.
    expect(screen.getByText(/Cancel this visit\?/)).toBeTruthy();
    expect(viewingMocks.cancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep visit" }));
    expect(screen.queryByText(/Cancel this visit\?/)).toBeNull();
    expect(viewingMocks.cancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel visit" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel visit" }));

    await waitFor(() => {
      expect(viewingMocks.cancel).toHaveBeenCalledTimes(1);
    });
    expect(viewingMocks.cancel.mock.calls[0][1]).toBe("request-1");
    expect(await screen.findByText(/Visit cancelled/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Visit day" })).toBeTruthy();
  });

  it("blocks cancelling a visit inside the 24-hour cutoff", async () => {
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    viewingMocks.load.mockResolvedValue({
      request: { id: "request-1", scheduled_for: soon, status: "pending" },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText(/less than 24 hours to this visit/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel visit" })).toBeNull();
    expect(viewingMocks.cancel).not.toHaveBeenCalled();
  });

  it("shows an open request instead of the picker, preventing duplicates", async () => {
    viewingMocks.load.mockResolvedValue({
      request: {
        id: "request-1",
        scheduled_for: "2026-10-27T12:00:00.000Z",
        status: "pending",
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Visit requested for/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Visit day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm booking" })).toBeNull();
  });

  it("sends signed-out visitors to auth with a return path", () => {
    authState.status = "signedOut";
    authState.user = null;

    renderPage();

    expect(screen.getByText(/You will be asked to sign in/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to book" }));

    expect(screen.getByTestId("auth-location").textContent).toBe(
      "/auth?returnTo=%2Fproperty%2Flisting-1",
    );
    expect(viewingMocks.request).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate request error from the database", async () => {
    viewingMocks.request.mockResolvedValue({
      request: null,
      error: "You already have an open visit request for this room.",
    });

    renderPage();

    const timeGroup = screen.getByRole("group", { name: "Visit time" });
    fireEvent.click(within(timeGroup).getByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(
      await screen.findByText(
        "You already have an open visit request for this room.",
      ),
    ).toBeTruthy();
  });

  it("degrades honestly when rooms and session length are not stated", () => {
    setDetailState({
      listing: { ...listing, total_rooms: null, rent_session_months: null },
    });

    renderPage();

    expect(screen.getAllByText("Not stated").length).toBeGreaterThan(0);
    expect(screen.getByText("/ session")).toBeTruthy();
  });

  it("shows a not-found state for a room that is no longer public", () => {
    setDetailState({ listing: null });

    renderPage();

    expect(screen.getByText("This room is not available")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Browse published rooms/ }),
    ).toBeTruthy();
  });

  it("shows a retryable error when the query fails", () => {
    const reload = vi.fn();
    setDetailState({
      listing: null,
      status: "error",
      error: "Could not load rooms from Supabase. Please try again.",
      reload,
    });

    renderPage();

    expect(
      screen.getByText("Could not load rooms from Supabase. Please try again."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
