import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoommatesPage from "@/pages/roommates";
import type { RoommateConnection } from "@/roommates/connections";
import type { OwnerInterest } from "@/roommates/owner-interests";
import type { RoommateProfile } from "@/roommates/roommate-profiles";

const hook = vi.hoisted(() => ({
  state: {
    profiles: [] as RoommateProfile[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    reload: vi.fn(),
  },
}));

vi.mock("@/roommates/use-roommate-profiles", () => ({
  useRoommateProfiles: () => hook.state,
}));

vi.mock("@/roommates/use-roommate-verification", () => ({
  useRoommateVerification: () => ({
    standing: "verified" as const,
    traits: null,
  }),
}));

const connectionsHook = vi.hoisted(() => ({
  state: {
    connections: [] as RoommateConnection[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    reload: vi.fn(),
  },
}));

vi.mock("@/roommates/use-roommate-connections", () => ({
  useRoommateConnections: () => connectionsHook.state,
}));

const interestsHook = vi.hoisted(() => ({
  state: {
    interests: [] as OwnerInterest[],
    pending: [] as OwnerInterest[],
    status: "ready" as "loading" | "ready" | "error",
    error: null as string | null,
    decisionError: null as string | null,
    decidingId: null as string | null,
    reload: vi.fn(),
    decide: vi.fn(),
  },
}));

vi.mock("@/roommates/use-owner-interests", () => ({
  useOwnerInterests: () => interestsHook.state,
}));

const profiles: RoommateProfile[] = [
  {
    id: "r-1",
    display_name: "Amara O.",
    headline: "300 level Law · quiet, tidy",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Akoka",
    budget_amount: 450000,
    currency: "NGN",
    gender: "female",
    move_in_date: "2026-11-15",
    bio: "Studies most evenings.",
    avatar_url:
      "https://example.supabase.co/storage/v1/object/sign/roommate-avatars/demo/amara.jpg?token=test",
    traits: {
      tidy: 4.5,
      sleep: 2,
      social: 3,
      guests: 2.5,
      routine: 4,
    },
  },
  {
    id: "r-2",
    display_name: "Tunde A.",
    headline: "Computer Science · night owl",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Yaba",
    budget_amount: 600000,
    currency: "NGN",
    gender: "male",
    move_in_date: "2026-11-01",
    bio: "Moving from Ibadan.",
    avatar_url: null,
    traits: null,
  },
  {
    id: "r-3",
    display_name: "Ifeoma N.",
    headline: "Medicine · needs a quiet room",
    institution: "Lagos State University",
    city: "Lagos",
    neighbourhood: "Ikeja",
    budget_amount: 900000,
    currency: "NGN",
    gender: null,
    move_in_date: null,
    bio: null,
    avatar_url: null,
    traits: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/roommates"]}>
      <RoommatesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  hook.state.profiles = profiles;
  hook.state.status = "ready";
  hook.state.error = null;
  hook.state.reload.mockReset();
  connectionsHook.state.connections = [];
  connectionsHook.state.status = "ready";
  connectionsHook.state.error = null;
  interestsHook.state.interests = [];
  interestsHook.state.pending = [];
  interestsHook.state.decisionError = null;
  interestsHook.state.decidingId = null;
  interestsHook.state.decide.mockReset();
});

describe("Roommate discovery screen", () => {
  it("renders the reference-inspired header, search, budget chips and profile cards", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Find your roommate" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Search roommate profiles")).toBeTruthy();
    expect(screen.getByText("3 looking")).toBeTruthy();

    for (const chip of [
      "Any budget",
      "Under ₦500k",
      "₦500k–₦700k",
      "Above ₦700k",
    ]) {
      expect(screen.getByRole("button", { name: chip })).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "Any budget" }).getAttribute("aria-pressed"),
    ).toBe("true");

    // Cards carry the live profile data.
    expect(screen.getByText("Amara O.")).toBeTruthy();
    expect(screen.getByText("Tunde A.")).toBeTruthy();
    expect(screen.getByText("Ifeoma N.")).toBeTruthy();
    expect(screen.getByText("Akoka, Lagos")).toBeTruthy();
    expect(screen.getByText("₦450k")).toBeTruthy();
    expect(screen.getByText("From 15 Nov")).toBeTruthy();
    expect(screen.getAllByText("University of Lagos").length).toBe(2);
    expect(screen.getByRole("img", { name: "3 profiles" })).toBeTruthy();

    // The whole card is the link to the detail screen, not just the name.
    const cardLink = screen.getByRole("link", {
      name: "Open Amara O.'s profile",
    });
    expect(cardLink.getAttribute("href")).toBe("/roommate/r-1");

    // Photos come from signed Supabase Storage URLs; profiles without a photo
    // fall back to initials artwork rather than a broken image.
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toContain("/roommate-avatars/demo/amara.jpg");
    expect(images[0].className).toContain("object-cover");
    expect(screen.getByText("TA")).toBeTruthy();
  });

  it("filters by search query", () => {
    renderPage();

    const search = screen.getByLabelText("Search roommate profiles") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Yaba" } });

    expect(screen.getByText("Tunde A.")).toBeTruthy();
    expect(screen.queryByText("Amara O.")).toBeNull();
    expect(screen.getByRole("img", { name: "1 profile" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("img", { name: "3 profiles" })).toBeTruthy();
  });

  it("filters by budget band", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Under ₦500k" }));
    expect(screen.getByText("Amara O.")).toBeTruthy();
    expect(screen.queryByText("Tunde A.")).toBeNull();
    expect(screen.getByRole("img", { name: "1 profile" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Above ₦700k" }));
    expect(screen.getByText("Ifeoma N.")).toBeTruthy();
    expect(screen.queryByText("Amara O.")).toBeNull();
  });

  it("filters by gender and combines it with the budget band", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Female" }));
    expect(screen.getByText("Amara O.")).toBeTruthy();
    expect(screen.queryByText("Tunde A.")).toBeNull();
    expect(screen.getByRole("img", { name: "1 profile" })).toBeTruthy();

    // A gender with no matching budget band leaves an honest empty state.
    fireEvent.click(screen.getByRole("button", { name: "Above ₦700k" }));
    expect(screen.getByText("No roommates match these filters yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Any gender" }));
    expect(screen.getByText("Ifeoma N.")).toBeTruthy();
  });

  it("shows an empty state that can reset the filters", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Search roommate profiles"), {
      target: { value: "Lekki" },
    });

    expect(screen.getByText("No one matches “Lekki” yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(screen.getByRole("img", { name: "3 profiles" })).toBeTruthy();
  });

  it("opens the connections list from Home's message icon link", () => {
    const amara = profiles[0];
    if (!amara) throw new Error("fixture profile missing");
    connectionsHook.state.connections = [
      { ...amara, connected_at: "2026-10-24T20:00:00.000Z", user_id: null },
    ];

    render(
      <MemoryRouter initialEntries={["/roommates?view=connections"]}>
        <RoommatesPage />
      </MemoryRouter>,
    );

    const sheet = screen.getByRole("dialog", { name: "Your connections" });
    expect(within(sheet).getByText("Amara O.")).toBeTruthy();
  });

  it("opens the interest inbox from Home's notification icon link", () => {
    render(
      <MemoryRouter initialEntries={["/roommates?view=interests"]}>
        <RoommatesPage />
      </MemoryRouter>,
    );

    const sheet = screen.getByRole("dialog", { name: "Interested students" });
    expect(
      within(sheet).getByText(/No one has asked to connect yet/),
    ).toBeTruthy();
  });

  it("hides the connections button until a roommate is connected", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: /Connections/ })).toBeNull();
  });

  it("opens the connected roommates from the button beside the back arrow", () => {
    const amara = profiles[0];
    if (!amara) throw new Error("fixture profile missing");
    connectionsHook.state.connections = [
      { ...amara, connected_at: "2026-10-24T20:00:00.000Z", user_id: null },
    ];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Connections (1)" }));

    const sheet = screen.getByRole("dialog", { name: "Your connections" });
    expect(sheet).toBeTruthy();
    // Tapping the connected roommate opens their chat...
    const chat = within(sheet).getByRole("link", { name: "Chat with Amara O." });
    expect(chat.getAttribute("href")).toBe("/roommate/r-1?chat=1");

    // ...while the icon button opens the profile itself.
    const profile = within(sheet).getByRole("link", {
      name: "View Amara O.'s profile",
    });
    expect(profile.getAttribute("href")).toBe("/roommate/r-1");
  });

  it("accepts an interested student from the inbox beside the back arrow", () => {
    const interest: OwnerInterest = {
      id: "i-1",
      profile_id: "my-profile",
      status: "pending",
      created_at: "2026-10-24T21:00:00.000Z",
      sender_id: "s-1",
      sender_name: "Ada M.",
      sender_detail: "Computer Science · Yaba",
    };
    interestsHook.state.interests = [interest];
    interestsHook.state.pending = [interest];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Interested students (1)" }));

    const sheet = screen.getByRole("dialog", { name: "Interested students" });
    expect(within(sheet).getByText("Ada M.")).toBeTruthy();

    fireEvent.click(within(sheet).getByRole("button", { name: "Accept" }));
    expect(interestsHook.state.decide).toHaveBeenCalledWith("i-1", "accepted");

    fireEvent.click(within(sheet).getByRole("button", { name: "Decline" }));
    expect(interestsHook.state.decide).toHaveBeenCalledWith("i-1", "declined");
  });

  it("shows a loading state while profiles are fetched", () => {
    hook.state.profiles = [];
    hook.state.status = "loading";
    renderPage();

    expect(screen.getByText("Loading roommate profiles…")).toBeTruthy();
  });

  it("shows a retryable error", async () => {
    hook.state.profiles = [];
    hook.state.status = "error";
    hook.state.error = "Could not load roommate profiles. Please try again.";
    renderPage();

    expect(
      screen.getByText("Could not load roommate profiles. Please try again."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(hook.state.reload).toHaveBeenCalledTimes(1);
    });
  });
});
