import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoommatePage from "@/pages/roommate";
import type { RoommateProfile } from "@/roommates/roommate-profiles";

const detailState = vi.hoisted(() => ({ current: {} as unknown }));
const authState = vi.hoisted(() => ({
  status: "signedIn" as "signedIn" | "signedOut",
  user: { id: "user-1", email: "student@example.com" } as {
    id: string;
    email: string;
  } | null,
  avatarUrl: null as string | null,
  uploadAvatar: vi.fn(async (_file: File) => ({ error: null as string | null })),
  removeAvatar: vi.fn(async () => ({ error: null as string | null })),
}));

const myProfileState = vi.hoisted(() => ({
  id: null as string | null,
  isDiscoverable: true,
}));

const detailMocks = vi.hoisted(() => ({
  loadInterest: vi.fn(),
  sendInterest: vi.fn(),
  withdrawInterest: vi.fn(),
  loadMessages: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
}));

const safetyMocks = vi.hoisted(() => ({
  loadBlock: vi.fn(),
  block: vi.fn(),
  unblock: vi.fn(),
  loadReport: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/roommates/use-roommate-profile", () => ({
  useRoommateProfile: () => detailState.current,
}));

vi.mock("@/roommates/use-roommate-verification", () => ({
  useRoommateVerification: () => ({
    standing: "verified" as const,
    traits: { tidy: 4, sleep: 3, social: 3, guests: 2, routine: 4 },
  }),
}));

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    status: authState.status,
    user: authState.user,
    avatarUrl: authState.avatarUrl,
    uploadAvatar: authState.uploadAvatar,
    removeAvatar: authState.removeAvatar,
  }),
}));

vi.mock("@/roommates/use-my-roommate-profile", () => ({
  useMyRoommateProfile: () => ({
    profile: myProfileState.id
      ? {
          id: myProfileState.id,
          display_name: "Amara O.",
          is_discoverable: myProfileState.isDiscoverable,
        }
      : null,
    status: "ready",
    error: null,
    saving: false,
    reload: vi.fn(),
    save: vi.fn(),
  }),
}));

const listingMocks = vi.hoisted(() => ({ loadByIds: vi.fn() }));

vi.mock("@/listings/public-listings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/public-listings")>();
  return { ...actual, loadListingsByIds: listingMocks.loadByIds };
});

const shareMocks = vi.hoisted(() => ({
  loadMine: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("@/roommates/listing-shares", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/roommates/listing-shares")>();
  return {
    ...actual,
    loadMyGroupVisit: shareMocks.loadMine,
    planGroupVisit: shareMocks.plan,
  };
});

const connectionsState = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("@/roommates/connections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/roommates/connections")>();
  return {
    ...actual,
    loadRoommateConnections: vi.fn(async () => ({
      connections: connectionsState.list,
      error: null,
    })),
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

vi.mock("@/roommates/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/roommates/safety")>();
  return {
    ...actual,
    loadMyBlockForProfile: safetyMocks.loadBlock,
    blockRoommate: safetyMocks.block,
    unblockRoommate: safetyMocks.unblock,
    loadMyOpenReport: safetyMocks.loadReport,
    reportRoommate: safetyMocks.report,
  };
});

vi.mock("@/roommates/roommate-detail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/roommates/roommate-detail")>();
  return {
    ...actual,
    loadMyInterest: detailMocks.loadInterest,
    sendRoommateInterest: detailMocks.sendInterest,
    withdrawRoommateInterest: detailMocks.withdrawInterest,
    loadRoommateMessages: detailMocks.loadMessages,
    sendRoommateMessage: detailMocks.sendMessage,
    markRoommateMessagesRead: detailMocks.markRead,
  };
});

function AuthProbe() {
  const location = useLocation();
  return <p data-testid="auth-location">{`${location.pathname}${location.search}`}</p>;
}

const profile: RoommateProfile = {
  id: "profile-1",
  display_name: "Amara O.",
  headline: "300 level Law · quiet, tidy, early riser",
  institution: "University of Lagos",
  city: "Lagos",
  neighbourhood: "Akoka",
  budget_amount: 540000,
  currency: "NGN",
  gender: "female",
  move_in_date: "2026-11-15",
  bio: "Looking for one other person to share a two-bedroom in Akoka.",
  avatar_url:
    "https://example.supabase.co/storage/v1/object/sign/roommate-avatars/demo/amara.jpg?token=test",
  traits: {
    tidy: 4.5,
    sleep: 2,
    social: 3,
    guests: 2.5,
    routine: 4,
  },
};

function setDetail(overrides: Record<string, unknown> = {}) {
  detailState.current = {
    profile,
    status: "ready",
    error: null,
    reload: vi.fn(),
    ...overrides,
  };
}

function renderPage(entry = "/roommate/profile-1") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/roommate/:id" element={<RoommatePage />} />
        <Route path="/auth" element={<AuthProbe />} />
        <Route path="/roommates" element={<p>Roommate list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.status = "signedIn";
  authState.user = { id: "user-1", email: "student@example.com" };
  authState.avatarUrl = null;
  authState.uploadAvatar.mockClear();
  authState.removeAvatar.mockClear();
  myProfileState.id = null;
  myProfileState.isDiscoverable = true;
  detailMocks.loadInterest.mockReset();
  detailMocks.loadInterest.mockResolvedValue({ interest: null, error: null });
  detailMocks.sendInterest.mockReset();
  detailMocks.loadMessages.mockReset();
  detailMocks.loadMessages.mockResolvedValue({ messages: [], error: null });
  detailMocks.sendMessage.mockReset();
  detailMocks.markRead.mockReset();
  detailMocks.markRead.mockResolvedValue({ error: null });
  safetyMocks.loadBlock.mockReset();
  safetyMocks.loadBlock.mockResolvedValue({ blocked: false, error: null });
  safetyMocks.block.mockReset();
  safetyMocks.unblock.mockReset();
  safetyMocks.loadReport.mockReset();
  safetyMocks.loadReport.mockResolvedValue({ report: null, error: null });
  safetyMocks.report.mockReset();
  listingMocks.loadByIds.mockReset();
  listingMocks.loadByIds.mockResolvedValue(new Map());
  shareMocks.loadMine.mockReset();
  shareMocks.loadMine.mockResolvedValue({ partySize: null, error: null });
  shareMocks.plan.mockReset();
  shareMocks.plan.mockResolvedValue({ partySize: 2, error: null });
  connectionsState.list = [
    {
      ...profile,
      connected_at: "2026-10-20T10:00:00Z",
      user_id: "user-2",
    },
  ];
  setDetail();
});

describe("Roommate detail page", () => {
  it("renders the profile photo, facts and both actions", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Amara O." }),
    ).toBeTruthy();
    expect(screen.getAllByText("Akoka, Lagos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("University of Lagos").length).toBeGreaterThan(0);
    expect(screen.getByText("300 level Law · quiet, tidy, early riser")).toBeTruthy();
    expect(screen.getByText(/two-bedroom in Akoka/)).toBeTruthy();
    expect(screen.getByText("Looking now")).toBeTruthy();

    // Budget appears in full in the facts list and compact on the photo.
    expect(screen.getByText("₦540,000/year")).toBeTruthy();
    expect(screen.getByText("₦540k")).toBeTruthy();
    expect(screen.getByText("15 Nov")).toBeTruthy();

    expect(screen.getByRole("button", { name: "Send interest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chat" })).toBeTruthy();

    const image = document.querySelector<HTMLImageElement>("img");
    expect(image?.getAttribute("src")).toContain("/roommate-avatars/demo/amara.jpg");
  });

  it("offers photo and edit controls on your own profile instead of interest", () => {
    myProfileState.id = "profile-1";
    renderPage();

    expect(screen.getByText("This is your profile")).toBeTruthy();
    expect(screen.getByText("Your profile")).toBeTruthy();
    // The photo this screen loaded already stands in until the signed URL from
    // the account resolves, so the control reads "Change photo".
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy();

    // You cannot ask yourself to connect, chat with yourself, or block yourself.
    expect(screen.queryByRole("button", { name: "Send interest" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
  });

  it("uploads a photo from your own profile and reports a failure", async () => {
    myProfileState.id = "profile-1";
    renderPage();

    const input = screen.getByLabelText("Profile photo") as HTMLInputElement;
    const file = new File(["photo"], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(authState.uploadAvatar).toHaveBeenCalledTimes(1);
    });
    expect(authState.uploadAvatar.mock.calls[0][0]).toBe(file);

    authState.uploadAvatar.mockResolvedValueOnce({
      error: "Could not upload that photo. Please try again.",
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Could not upload that photo. Please try again."),
    ).toBeTruthy();
  });

  it("does not open a chat with yourself from ?chat=1", () => {
    myProfileState.id = "profile-1";
    detailMocks.loadMessages.mockResolvedValue({ messages: [], error: null });

    renderPage("/roommate/profile-1?chat=1");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("This is your profile")).toBeTruthy();
  });

  it("saves interest in Supabase and confirms it", async () => {
    detailMocks.sendInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "pending", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send interest" }));

    await waitFor(() => {
      expect(detailMocks.sendInterest).toHaveBeenCalledTimes(1);
    });
    expect(detailMocks.sendInterest.mock.calls[0][1]).toBe("profile-1");
    expect(detailMocks.sendInterest.mock.calls[0][2]).toBe("user-1");

    expect(
      await screen.findByText(
        "Interest sent. This roommate can see that you would like to share.",
      ),
    ).toBeTruthy();
    const sentButton = screen.getByRole("button", {
      name: "Interest sent",
    }) as HTMLButtonElement;
    expect(sentButton.disabled).toBe(true);
  });

  it("shows an existing interest instead of the action", async () => {
    detailMocks.loadInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "pending", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Interest sent\./)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Interest sent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("cancels a pending interest only after the confirmation warning", async () => {
    detailMocks.loadInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "pending", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });
    detailMocks.withdrawInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "withdrawn", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel interest" }));

    // Nothing is cancelled until the student confirms.
    expect(screen.getByText(/Cancel your interest in Amara\?/)).toBeTruthy();
    expect(detailMocks.withdrawInterest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel interest" }));

    await waitFor(() => {
      expect(detailMocks.withdrawInterest).toHaveBeenCalledTimes(1);
    });
    expect(detailMocks.withdrawInterest.mock.calls[0][1]).toBe("interest-1");

    const sendAgain = (await screen.findByRole("button", {
      name: "Send interest",
    })) as HTMLButtonElement;
    expect(sendAgain.disabled).toBe(false);
    expect(screen.queryByText(/Interest sent\./)).toBeNull();
  });

  it("keeps an accepted connection without a cancel action", async () => {
    detailMocks.loadInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "accepted", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });

    renderPage();
    expect(await screen.findByText(/You and Amara are connected/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel interest" })).toBeNull();
  });

  it("reports a duplicate interest from the database", async () => {
    detailMocks.sendInterest.mockResolvedValue({
      interest: null,
      error: "You have already sent interest to this roommate.",
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send interest" }));

    expect(
      await screen.findByText("You have already sent interest to this roommate."),
    ).toBeTruthy();
  });

  it("opens the chat sheet, loads the thread and sends a message", async () => {
    detailMocks.loadMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "Hi, is the room still available?",
          created_at: "2026-10-24T09:00:00Z",
        },
      ],
      error: null,
    });
    detailMocks.sendMessage.mockResolvedValue({
      message: {
        id: "message-2",
        sender_id: "user-1",
        body: "I can move in from November.",
        created_at: "2026-10-24T10:00:00Z",
      },
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Chat with Amara O.",
    });
    expect(await within(dialog).findByText("Hi, is the room still available?")).toBeTruthy();
    // The shared composer offers a photo or a property card from the "+".
    expect(
      within(dialog).getByRole("button", { name: "Add a photo or property card" }),
    ).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Message"), {
      target: { value: "I can move in from November." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(detailMocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    const [, input] = detailMocks.sendMessage.mock.calls[0] as [
      unknown,
      { profileId: string; studentId: string; senderId: string; body: string },
    ];
    expect(input.profileId).toBe("profile-1");
    expect(input.studentId).toBe("user-1");
    expect(input.senderId).toBe("user-1");
    expect(input.body).toBe("I can move in from November.");

    expect(
      await within(dialog).findByText("I can move in from November."),
    ).toBeTruthy();
  });

  it("marks incoming messages read and tags the sender's read ones as Seen", async () => {
    detailMocks.loadMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          sender_id: "user-2",
          body: "Hi, still looking?",
          created_at: "2026-10-24T09:00:00Z",
          read_at: null,
        },
        {
          id: "message-2",
          sender_id: "user-1",
          body: "Yes, I am interested.",
          created_at: "2026-10-24T09:05:00Z",
          read_at: "2026-10-24T09:06:00Z",
        },
      ],
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    const dialog = await screen.findByRole("dialog", { name: "Chat with Amara O." });
    expect(await within(dialog).findByText("Yes, I am interested.")).toBeTruthy();

    // The thread opening is what stamps the other side's messages as read...
    await waitFor(() => {
      expect(detailMocks.markRead).toHaveBeenCalledWith({}, "profile-1", "user-1");
    });
    // ...and an already-read message of ours carries the tag.
    expect(within(dialog).getByText("Seen")).toBeTruthy();
  });

  it("shows a shared room card and can ask for a group visit", async () => {
    detailMocks.loadMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "Have a look at Sunlit self-contained in Akoka.",
          created_at: "2026-10-24T09:00:00Z",
          read_at: null,
          shared_listing_id: "listing-1",
        },
      ],
      error: null,
    });
    listingMocks.loadByIds.mockResolvedValue(
      new Map([
        [
          "listing-1",
          {
            id: "listing-1",
            title: "Sunlit self-contained in Akoka",
            description: "A bright studio near the campus gate.",
            accommodation_type: "self_contained",
            institution: "University of Lagos",
            city: "Lagos",
            neighbourhood: "Akoka",
            rent_amount: 850000,
            rent_period: "year",
            availability_status: "available",
            bedrooms: 1,
            bathrooms: 1,
            furnishing_status: "furnished",
            facilities: ["Wi-Fi"],
            first_published_at: "2026-10-24T09:00:00Z",
            created_at: "2026-10-24T09:00:00Z",
            cover_image_url: "https://example.supabase.co/storage/v1/object/sign/cover.jpg",
            photo_urls: [
              "https://example.supabase.co/storage/v1/object/sign/cover.jpg",
            ],
          },
        ],
      ]),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    const dialog = await screen.findByRole("dialog", { name: "Chat with Amara O." });
    const card = await within(dialog).findByRole("link", {
      name: /Sunlit self-contained in Akoka/,
    });
    expect(card.getAttribute("href")).toBe("/property/listing-1");

    fireEvent.click(within(dialog).getByRole("button", { name: "Group visit" }));

    const planSheet = await screen.findByRole("dialog", {
      name: "Plan a group visit",
    });
    // The roommate from this thread is ticked once connections load.
    await within(planSheet).findByRole("button", { name: "Amara O., coming" });
    fireEvent.click(
      within(planSheet).getByRole("button", { name: "Request group visit" }),
    );

    await waitFor(() => {
      expect(shareMocks.plan).toHaveBeenCalledWith({}, {
        listingId: "listing-1",
        viewerId: "user-1",
        memberIds: ["user-2"],
      });
    });
    expect(await within(dialog).findByText(/Group visit requested/)).toBeTruthy();
  });

  it("plans one visit for a household of three", async () => {
    connectionsState.list = [
      {
        ...profile,
        connected_at: "2026-10-20T10:00:00Z",
        user_id: "user-2",
      },
      {
        ...profile,
        id: "profile-2",
        display_name: "Bode A.",
        connected_at: "2026-10-21T10:00:00Z",
        user_id: "user-3",
      },
    ];
    shareMocks.plan.mockResolvedValue({ partySize: 3, error: null });
    detailMocks.loadMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "Have a look at Sunlit self-contained in Akoka.",
          created_at: "2026-10-24T09:00:00Z",
          read_at: null,
          shared_listing_id: "listing-1",
        },
      ],
      error: null,
    });
    listingMocks.loadByIds.mockResolvedValue(
      new Map([
        [
          "listing-1",
          {
            id: "listing-1",
            title: "Sunlit self-contained in Akoka",
            description: "A bright studio near the campus gate.",
            accommodation_type: "self_contained",
            institution: "University of Lagos",
            city: "Lagos",
            neighbourhood: "Akoka",
            rent_amount: 850000,
            rent_period: "year",
            availability_status: "available",
            bedrooms: 1,
            bathrooms: 1,
            furnishing_status: "furnished",
            facilities: ["Wi-Fi"],
            first_published_at: "2026-10-24T09:00:00Z",
            created_at: "2026-10-24T09:00:00Z",
            cover_image_url: null,
            photo_urls: [],
          },
        ],
      ]),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    const dialog = await screen.findByRole("dialog", { name: "Chat with Amara O." });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Group visit" }),
    );

    const planSheet = await screen.findByRole("dialog", {
      name: "Plan a group visit",
    });
    // Amara is already ticked from the thread; add the second roommate.
    await within(planSheet).findByRole("button", { name: "Amara O., coming" });
    fireEvent.click(
      within(planSheet).getByRole("button", {
        name: "Bode A., not coming yet",
      }),
    );
    expect(within(planSheet).getByText(/3 people/)).toBeTruthy();
    fireEvent.click(
      within(planSheet).getByRole("button", { name: "Request group visit" }),
    );

    await waitFor(() => {
      expect(shareMocks.plan).toHaveBeenCalledWith({}, {
        listingId: "listing-1",
        viewerId: "user-1",
        memberIds: ["user-2", "user-3"],
      });
    });
    expect(
      await within(dialog).findByText("Group visit requested · 3 people going."),
    ).toBeTruthy();
  });

  it("opens the chat options menu with cancel interest and message settings", async () => {
    detailMocks.loadInterest.mockResolvedValue({
      interest: { id: "interest-1", status: "pending", created_at: "2026-10-24T10:00:00Z" },
      error: null,
    });
    detailMocks.loadMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          sender_id: "user-2",
          body: "Hi, still looking?",
          created_at: "2026-10-24T09:00:00Z",
        },
      ],
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    const dialog = await screen.findByRole("dialog", { name: "Chat with Amara O." });
    expect(await within(dialog).findByText("Hi, still looking?")).toBeTruthy();
    // Times are hidden until the setting is turned on.
    expect(dialog.querySelector("time")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Chat options" }));
    const menu = within(dialog).getByRole("menu", { name: "Chat options" });
    expect(
      within(menu).getByRole("menuitem", { name: /Cancel your interest/ }),
    ).toBeTruthy();
    expect(
      within(menu).getByRole("menuitem", { name: /Report Amara/ }),
    ).toBeTruthy();
    expect(
      within(menu).getByRole("menuitem", { name: /Block Amara/ }),
    ).toBeTruthy();

    const times = within(menu).getByRole("menuitemcheckbox", {
      name: /Show message times/,
    });
    expect(times.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(times);
    expect(times.getAttribute("aria-checked")).toBe("true");
    expect(dialog.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-10-24T09:00:00Z",
    );

    // Cancelling from the menu closes the chat and asks for confirmation.
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: /Cancel your interest/ }),
    );
    expect(screen.queryByRole("dialog", { name: "Chat with Amara O." })).toBeNull();
    expect(screen.getByText(/Cancel your interest in Amara\?/)).toBeTruthy();
    expect(detailMocks.withdrawInterest).not.toHaveBeenCalled();
  });

  it("blocks a roommate from the safety section after confirmation", async () => {
    safetyMocks.block.mockResolvedValue({ error: null });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    const dialog = await screen.findByRole("dialog", { name: "Block Amara" });
    expect(within(dialog).getByText(/hides your profiles from each other/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Block Amara" }));

    await waitFor(() => {
      expect(safetyMocks.block).toHaveBeenCalledTimes(1);
    });
    expect(safetyMocks.block.mock.calls[0][1]).toEqual({
      blockerId: "user-1",
      profileId: "profile-1",
      displayName: "Amara O.",
    });
    // The blocked profile is gone, so the page returns to discovery.
    expect(await screen.findByText("Roommate list")).toBeTruthy();
  });

  it("reports a roommate with a reason and details", async () => {
    safetyMocks.report.mockResolvedValue({
      report: {
        id: "report-1",
        reason: "harassment",
        status: "open",
        createdAt: "2026-10-25T10:00:00Z",
      },
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    const dialog = await screen.findByRole("dialog", { name: "Report Amara" });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /Harassment or abuse/ }),
    );
    fireEvent.change(within(dialog).getByLabelText(/Details/), {
      target: { value: "They kept messaging after I asked them to stop." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));

    await waitFor(() => {
      expect(safetyMocks.report).toHaveBeenCalledTimes(1);
    });
    expect(safetyMocks.report.mock.calls[0][1]).toMatchObject({
      reporterId: "user-1",
      profileId: "profile-1",
      reason: "harassment",
    });
    expect(await within(dialog).findByText("Report already sent")).toBeTruthy();
  });

  it("sends signed-out visitors to auth before interest or chat", () => {
    authState.status = "signedOut";
    authState.user = null;

    renderPage();
    expect(screen.getByText(/You will be asked to sign in/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send interest" }));
    expect(screen.getByTestId("auth-location").textContent).toBe(
      "/auth?returnTo=%2Froommate%2Fprofile-1",
    );
    expect(detailMocks.sendInterest).not.toHaveBeenCalled();
  });

  it("shows a not-found state for a hidden profile", () => {
    setDetail({ profile: null });
    renderPage();

    expect(screen.getByText("This profile is not available")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Browse roommate profiles/ }),
    ).toBeTruthy();
  });

  it("shows a retryable error when the profile fails to load", () => {
    const reload = vi.fn();
    setDetail({
      profile: null,
      status: "error",
      error: "Could not load roommate profiles. Please try again.",
      reload,
    });

    renderPage();
    expect(
      screen.getByText("Could not load roommate profiles. Please try again."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
