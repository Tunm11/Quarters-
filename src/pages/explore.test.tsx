import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicListing } from "@/listings/public-listings";

const listingsHook = vi.hoisted(() => ({
  state: {
    listings: [] as unknown[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    // Paging state of the catalogue, so a test can hold a partial catalogue.
    moreError: null as string | null,
    total: 0,
    hasMore: false,
    loadingMore: false,
    reload: vi.fn(),
    loadMore: vi.fn(),
  },
}));

vi.mock("@/listings/use-public-listings", () => ({
  usePublicListings: () => listingsHook.state,
}));

const listings: PublicListing[] = [
  {
    id: "seed-1",
    title: "Sunlit self-contained in Akoka",
    description: "A bright self-contained studio five minutes from the campus gate.",
    accommodation_type: "self_contained",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Akoka",
    rent_amount: 85000,
    rent_period: "month",
    availability_status: "available",
    bedrooms: 1,
    bathrooms: 1,
    furnishing_status: "furnished",
    facilities: ["Wi-Fi", "Water", "24/7 power", "Security"],
    first_published_at: "2026-10-24T09:00:00+00:00",
    created_at: "2026-10-24T09:00:00+00:00",
    cover_image_url:
      "https://example.supabase.co/storage/v1/object/sign/listing-images/seed-1/cover.jpg?token=test",
    photo_urls: [
      "https://example.supabase.co/storage/v1/object/sign/listing-images/seed-1/cover.jpg?token=test",
      "https://example.supabase.co/storage/v1/object/sign/listing-images/seed-1/gallery-1.jpg?token=test",
      "https://example.supabase.co/storage/v1/object/sign/listing-images/seed-1/gallery-2.jpg?token=test",
    ],
    verified_at: "2026-10-20T09:00:00+00:00",
    inspected_at: "2026-10-22T09:00:00+00:00",
  },
  {
    id: "seed-2",
    title: "Quiet private room in Yaba",
    description: "A calm private room in a small shared flat near the tech cluster.",
    accommodation_type: "private_room",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Yaba",
    rent_amount: 55000,
    rent_period: "month",
    availability_status: "available",
    bedrooms: 1,
    bathrooms: 1,
    furnishing_status: "semi_furnished",
    facilities: ["Wi-Fi", "Water"],
    first_published_at: "2026-10-24T08:00:00+00:00",
    created_at: "2026-10-24T08:00:00+00:00",
    cover_image_url: null,
    photo_urls: [],
    verified_at: null,
    inspected_at: null,
  },
  {
    id: "seed-3",
    title: "Shared room in Gbagada",
    description: "A budget-friendly shared room in a quiet compound with water storage.",
    accommodation_type: "shared_room",
    institution: null,
    city: "Lagos",
    neighbourhood: "Gbagada",
    rent_amount: 30000,
    rent_period: "month",
    availability_status: "limited",
    bedrooms: 2,
    bathrooms: 1,
    furnishing_status: "unfurnished",
    facilities: ["Water", "Security"],
    first_published_at: "2026-10-24T07:00:00+00:00",
    created_at: "2026-10-24T07:00:00+00:00",
    cover_image_url: null,
    photo_urls: [],
    verified_at: null,
    inspected_at: null,
  },
  {
    id: "seed-4",
    title: "Student hostel bed in Ikeja",
    description: "A furnished hostel bed with a study room and overnight security.",
    accommodation_type: "hostel",
    institution: "Lagos State University",
    city: "Lagos",
    neighbourhood: "Ikeja",
    rent_amount: 28000,
    rent_period: "month",
    availability_status: "available",
    bedrooms: null,
    bathrooms: 2,
    furnishing_status: "furnished",
    facilities: ["Wi-Fi", "Study room"],
    first_published_at: "2026-10-24T06:00:00+00:00",
    created_at: "2026-10-24T06:00:00+00:00",
    cover_image_url: null,
    photo_urls: [],
    verified_at: null,
    inspected_at: null,
  },
];

async function renderExploreAt(path: string) {
  window.history.pushState({}, "", path);
  vi.resetModules();
  const { App } = await import("@/App");
  return render(<App />);
}

async function renderExplore() {
  return renderExploreAt("/explore");
}

async function waitForExplore() {
  await waitFor(() => {
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Find your perfect place",
      }),
    ).toBeTruthy();
  });
}

async function waitForListings() {
  await waitFor(() => {
    expect(screen.getByText("Shared room in Gbagada")).toBeTruthy();
  });
}

beforeEach(() => {
  listingsHook.state.listings = listings;
  listingsHook.state.status = "ready";
  listingsHook.state.error = null;
  listingsHook.state.moreError = null;
  listingsHook.state.total = listings.length;
  listingsHook.state.hasMore = false;
  listingsHook.state.loadingMore = false;
  listingsHook.state.reload.mockReset();
  listingsHook.state.loadMore.mockReset();
});

describe("Explore screen", () => {
  it("renders the discover screen, dock navigation, search, room types and live cards", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    expect(
      screen.getByRole("heading", { level: 1, name: "Find your perfect place" }),
    ).toBeTruthy();

    // The app shell no longer renders a top header; navigation is the dock.
    expect(screen.queryByRole("link", { name: "QUARTERS home" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();

    // Search accepts text and exposes an accessible label.
    const search = screen.getByLabelText("Search accommodation") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Uni" } });
    expect(search.value).toBe("Uni");

    // Roommate matching is an icon-only entry next to Saved.
    const roommateLink = screen.getByRole("link", { name: "Find a roommate" });
    expect(roommateLink.getAttribute("href")).toBe("/roommates");
    expect(roommateLink.textContent).toBe("");
    expect(roommateLink.querySelector("svg")).not.toBeNull();

    // Clear button appears with text and empties the field.
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search.value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    // Four room-type controls, with All selected initially.
    for (const label of ["All rooms", "Private rooms", "Shared rooms", "Hostel rooms"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "All rooms" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("4 rooms")).toBeTruthy();
  });

  it("dresses each popular area with a photo of that neighbourhood", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    const areas = screen.getByRole("group", { name: "Popular areas" });
    for (const [name, photo] of [
      ["Akoka", "/areas/akoka.jpg"],
      ["Yaba", "/areas/yaba.jpg"],
      ["Surulere", "/areas/surulere.jpg"],
      ["Ikeja", "/areas/ikeja.jpg"],
    ]) {
      const tile = within(areas).getByRole("button", {
        name: `Search rooms in ${name}`,
      });
      expect(tile.querySelector("img")?.getAttribute("src")).toBe(photo);
    }
  });

  it("narrows the catalogue from the filter sheet and clears it again", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));
    fireEvent.click(screen.getByRole("button", { name: /^Budget/ }));

    const budget = screen.getByRole("group", { name: "Budget" });
    fireEvent.click(within(budget).getByRole("button", { name: /^Under ₦/ }));

    // The two cheapest rooms survive, and the filter is reported as active.
    expect(screen.getByText("2 rooms")).toBeTruthy();
    expect(screen.queryByText("Sunlit self-contained in Akoka")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /Open filters \(1 active\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByText("4 rooms")).toBeTruthy();
    // The Akoka room is back in the featured panel and in the list.
    expect(screen.getAllByText("Sunlit self-contained in Akoka").length).toBeGreaterThan(0);
  });

  it("rotates the featured room and can be paused or picked by hand", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    const featured = screen.getByRole("region", { name: "Rooms near campus" });
    const dots = within(featured).getByRole("group", { name: "Featured rooms" });
    expect(within(dots).getAllByRole("button")).toHaveLength(4);

    // The newest match leads the panel.
    expect(
      within(featured).getByRole("heading", { name: "Sunlit self-contained in Akoka" }),
    ).toBeTruthy();

    // Picking a room moves the spotlight, without leaving Explore.
    fireEvent.click(
      within(dots).getByRole("button", { name: "Show Quiet private room in Yaba" }),
    );
    expect(
      within(featured).getByRole("heading", { name: "Quiet private room in Yaba" }),
    ).toBeTruthy();
    expect(
      within(dots)
        .getByRole("button", { name: "Show Quiet private room in Yaba" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // Rotation can be stopped for good (hover and focus do it temporarily).
    expect(within(featured).getByRole("button", { name: "Pause rotation" })).toBeTruthy();
    fireEvent.click(within(featured).getByRole("button", { name: "Pause rotation" }));
    expect(within(featured).getByRole("button", { name: "Play rotation" })).toBeTruthy();
  });

  it("renders each listing with rent, location, facilities and approval", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    // The newest listing leads the featured panel and its own card.
    expect(
      screen.getAllByRole("heading", { name: "Sunlit self-contained in Akoka" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Akoka, Lagos")).toHaveLength(2);
    expect(screen.getAllByText(/85,000/)).toHaveLength(2);
    expect(screen.getByText("Self-contained")).toBeTruthy();
    // Amenities are icons: four are shown and the text labels are gone.
    expect(screen.getAllByRole("img", { name: "Wi-Fi" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "Security" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Wi-Fi")).toBeNull();
    expect(screen.getAllByText("Approved provider")).toHaveLength(4);
    expect(screen.getAllByText("Available now").length).toBeGreaterThan(0);
    expect(screen.getByText("Limited spots")).toBeTruthy();

    // The cover photo comes from the loader's signed URL, not a hardcoded URL.
    const cover = document.querySelector<HTMLImageElement>(
      'img[src*="/storage/v1/object/sign/listing-images/seed-1/cover.jpg"]',
    );
    expect(cover).toBeTruthy();
    expect(cover?.className).toContain("object-cover");
  });

  it("sends signed-out visitors to sign in before roommate discovery", async () => {
    renderExplore();
    await waitForExplore();

    fireEvent.click(screen.getByRole("link", { name: "Find a roommate" }));

    // Discovery is gated: a visitor with no session lands on /auth with the
    // roommate screen preserved as the post-sign-in destination.
    await waitFor(
      () => {
        expect(
          screen.getByRole("heading", {
            level: 1,
            name: "One account for rooms and roommates.",
          }),
        ).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(window.location.pathname).toBe("/auth");
    expect(window.location.search).toContain("returnTo=%2Froommates");
  });

  it("filters live cards by search and room type", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    const search = screen.getByLabelText("Search accommodation") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Yaba" } });
    expect(screen.getAllByText("Quiet private room in Yaba").length).toBeGreaterThan(0);
    expect(screen.queryByText("Shared room in Gbagada")).toBeNull();
    expect(screen.getByText("1 room")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.click(screen.getByRole("button", { name: "Hostel rooms" }));
    expect(screen.getAllByText("Student hostel bed in Ikeja").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quiet private room in Yaba")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All rooms" }));
    expect(screen.getByText("4 rooms")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Lekki" } });
    expect(screen.getByText("No rooms match “Lekki” yet.")).toBeTruthy();
  });

  it("shows the honest empty state when the catalogue is empty", async () => {
    listingsHook.state.listings = [];
    renderExplore();
    await waitForExplore();

    expect(await screen.findByText("No rooms are published yet.")).toBeTruthy();
    expect(screen.getByText("0 rooms")).toBeTruthy();
  });

  it("shows the Supabase error and offers a retry", async () => {
    listingsHook.state.listings = [];
    listingsHook.state.status = "error";
    listingsHook.state.error = "Could not load rooms from Supabase. Please try again.";
    renderExplore();
    await waitForExplore();

    expect(
      await screen.findByText("Could not load rooms from Supabase. Please try again."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(listingsHook.state.reload).toHaveBeenCalledTimes(1);
  });

  it("reads the catalogue page by page instead of stopping at the first 24 rooms", async () => {
    listingsHook.state.total = 137;
    listingsHook.state.hasMore = true;
    renderExplore();
    await waitForExplore();
    await waitForListings();

    // How much of the catalogue is on screen, and that search only sees it.
    expect(screen.getByText("Showing 4 of 137 published rooms")).toBeTruthy();
    expect(
      screen.getByText("Search, filters and sorting cover the rooms loaded so far."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more rooms" }));
    expect(listingsHook.state.loadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded rooms and offers a retry when the next page fails", async () => {
    listingsHook.state.total = 137;
    listingsHook.state.hasMore = true;
    listingsHook.state.moreError =
      "Could not load rooms from Supabase. Please try again.";
    renderExplore();
    await waitForExplore();
    await waitForListings();

    expect(
      screen.getByText("Could not load rooms from Supabase. Please try again."),
    ).toBeTruthy();
    // The rooms already read stay on screen, and the retry is the same control.
    expect(screen.getAllByText("Shared room in Gbagada").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(listingsHook.state.loadMore).toHaveBeenCalledTimes(1);
  });

  it("says an empty result only searched the rooms loaded so far", async () => {
    listingsHook.state.total = 137;
    listingsHook.state.hasMore = true;
    renderExplore();
    await waitForExplore();
    await waitForListings();

    fireEvent.change(screen.getByLabelText("Search accommodation"), {
      target: { value: "Lekki" },
    });

    expect(screen.getByText("No rooms match “Lekki” yet.")).toBeTruthy();
    expect(
      screen.getByText(/Only the 4 rooms loaded so far could be searched/),
    ).toBeTruthy();
    // The catalogue is not exhausted, so the next page is still offered.
    expect(screen.getByRole("button", { name: "Load more rooms" })).toBeTruthy();
  });

  it("shows a loading status while listings are fetched", async () => {
    listingsHook.state.listings = [];
    listingsHook.state.status = "loading";
    renderExplore();
    await waitForExplore();

    expect(screen.getByText("Loading published rooms…")).toBeTruthy();
    expect(screen.getByText("0 rooms")).toBeTruthy();
  });

  it("opens the filter index, drills into a real filter, and closes via Done", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));

    const filters = screen.getByRole("dialog", { name: "Filters" });
    // Options are derived from the published rooms, not hard-coded.
    expect(within(filters).getByText(/Options come from the rooms published/)).toBeTruthy();

    fireEvent.click(within(filters).getByRole("button", { name: /^Budget/ }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();

    const budget = screen.getByRole("dialog", { name: "Budget" });
    const options = within(budget).getByRole("group", { name: "Budget" });
    expect(within(options).getAllByRole("button").length).toBeGreaterThan(0);

    fireEvent.click(within(budget).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Budget" })).toBeNull();
  });

  it("closes the filter index via the close button and Escape", async () => {
    renderExplore();
    await waitForExplore();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
  });

  it("marks Explore as the active destination in the floating dock", async () => {
    renderExplore();
    await waitForExplore();

    const dock = screen.getAllByRole("navigation").find((nav) =>
      nav.className.includes("fixed"),
    );
    expect(dock).toBeTruthy();
    if (!dock) throw new Error("dock not rendered");

    const exploreLink = within(dock).getByRole("link", { name: "Explore" });
    expect(exploreLink.getAttribute("aria-current")).toBe("page");

    // The dock still exposes all four destinations.
    for (const name of ["Home", "Explore", "Saved", "Profile"]) {
      expect(within(dock).getByRole("link", { name })).toBeTruthy();
    }
  });

  it("navigates to Home and back to Explore through the dock", async () => {
    renderExplore();
    await waitForExplore();

    const dock = screen.getAllByRole("navigation").find((nav) =>
      nav.className.includes("fixed"),
    );
    expect(dock).toBeTruthy();
    if (!dock) throw new Error("dock not rendered");

    fireEvent.click(within(dock).getByRole("link", { name: "Home" }));
    await waitFor(() => {
      expect(screen.getByText("Student living, made simple")).toBeTruthy();
    });
    expect(
      screen.queryByRole("heading", {
        level: 1,
        name: "Find your perfect place",
      }),
    ).toBeNull();

    fireEvent.click(within(dock).getByRole("link", { name: "Explore" }));
    await waitForExplore();
  });

  it("sorts the results by price and by the campus a room names", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    const results = () => screen.getByRole("region", { name: "Rooms near you" });
    const cardHrefs = () =>
      within(results())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));

    // Newest first is the default order.
    expect(cardHrefs()).toEqual([
      "/property/seed-1",
      "/property/seed-2",
      "/property/seed-3",
      "/property/seed-4",
    ]);

    // Price: low to high puts the cheapest known rent at the top.
    fireEvent.click(screen.getByRole("button", { name: "Newest first" }));
    const sortSheet = screen.getByRole("dialog", { name: "Sort rooms" });
    fireEvent.click(
      within(sortSheet).getByRole("radio", { name: /Price: low to high/ }),
    );
    fireEvent.click(within(sortSheet).getByRole("button", { name: "Close" }));

    expect(cardHrefs()).toEqual([
      "/property/seed-4",
      "/property/seed-3",
      "/property/seed-2",
      "/property/seed-1",
    ]);

    // Closest needs a campus, and says so rather than implying a distance.
    fireEvent.click(screen.getByRole("button", { name: "Price: low to high" }));
    const reopened = screen.getByRole("dialog", { name: "Sort rooms" });
    fireEvent.click(
      within(reopened).getByRole("radio", { name: /Closest to my campus/ }),
    );
    fireEvent.click(within(reopened).getByRole("button", { name: "Close" }));
    expect(screen.getByText(/Pick your campus to order by closeness/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Closest to my campus" }));
    const campusSheet = screen.getByRole("dialog", { name: "Sort rooms" });
    const campuses = within(campusSheet).getByRole("group", { name: "Your campus" });
    // Only campuses published rooms actually name are offered.
    expect(
      within(campuses)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["University of Lagos (2)", "Lagos State University (1)"]);

    fireEvent.click(
      within(campuses).getByRole("button", { name: "Lagos State University (1)" }),
    );
    fireEvent.click(within(campusSheet).getByRole("button", { name: "Close" }));

    // The Ikeja hostel names that campus, so it leads; the rest stay newest-first.
    expect(cardHrefs()).toEqual([
      "/property/seed-4",
      "/property/seed-1",
      "/property/seed-2",
      "/property/seed-3",
    ]);
  });

  it("groups the results by campus in the near-campus view", async () => {
    renderExplore();
    await waitForExplore();
    await waitForListings();

    fireEvent.click(screen.getByRole("button", { name: "Near campus" }));
    expect(
      screen.getByRole("button", { name: "Near campus" }).getAttribute("aria-pressed"),
    ).toBe("true");

    const nearView = () => screen.getByRole("region", { name: "Near campus view" });
    const groupLabels = () =>
      within(nearView())
        .getAllByRole("region")
        .map((group) => group.getAttribute("aria-label"));

    // The fuller campus leads and the rooms that name no campus close the list.
    expect(groupLabels()).toEqual([
      "Rooms near University of Lagos",
      "Rooms near Lagos State University",
      "Rooms near Campus not stated",
    ]);

    const unilag = within(nearView()).getByRole("region", {
      name: "Rooms near University of Lagos",
    });
    expect(within(unilag).getAllByRole("link")).toHaveLength(2);
    // The cheapest stated rent in the group, and the areas it covers.
    expect(within(unilag).getByText("₦55k")).toBeTruthy();
    expect(within(unilag).getByText("Akoka")).toBeTruthy();
    expect(within(unilag).getByText("Yaba")).toBeTruthy();

    // Narrowing to one campus leaves only that group on screen.
    fireEvent.click(
      within(unilag).getByRole("button", {
        name: "Show only rooms near University of Lagos",
      }),
    );
    expect((screen.getByLabelText("Search accommodation") as HTMLInputElement).value).toBe(
      "University of Lagos",
    );
    expect(groupLabels()).toEqual(["Rooms near University of Lagos"]);
  });
});

describe("Saved searches on Explore", () => {
  it("applies a search that arrives in the URL", async () => {
    renderExploreAt("/explore?q=Yaba");
    await waitForExplore();

    // The query box shows the search, and the results are the ones it matches.
    const search = screen.getByLabelText("Search accommodation") as HTMLInputElement;
    expect(search.value).toBe("Yaba");

    await waitFor(() => {
      expect(screen.getAllByText("Quiet private room in Yaba").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Shared room in Gbagada")).toBeNull();
  });

  it("offers to save the search once it narrows something", async () => {
    renderExploreAt("/explore");
    await waitForExplore();
    await waitForListings();

    // A plain Explore screen has nothing to save yet.
    expect(screen.queryByRole("button", { name: "Save this search" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Search accommodation"), {
      target: { value: "Yaba" },
    });

    expect(screen.getByRole("button", { name: "Save this search" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saved searches" }).getAttribute("href")).toBe(
      "/saved?tab=searches",
    );
  });

  it("keeps the search for a signed-out visitor who wants to save it", async () => {
    renderExploreAt("/explore?q=Yaba");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save this search" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));

    // Saving needs an account, so the visitor signs in first and comes back to
    // this exact search.
    await waitFor(() => {
      expect(window.location.pathname).toBe("/auth");
    });
    const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
    expect(returnTo).toContain("/explore?");
    expect(decodeURIComponent(returnTo)).toContain("q=Yaba");
  });
});
