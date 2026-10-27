import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "@/pages/account";

const state = vi.hoisted(() => {
  const saveDisplayName = vi.fn(async () => ({ error: null as string | null }));
  const signOut = vi.fn(async () => ({ error: null as string | null }));
  const uploadAvatar = vi.fn(async (_file: File) => ({ error: null as string | null }));
  const removeAvatar = vi.fn(async () => ({ error: null as string | null }));

  return {
    saveDisplayName,
    signOut,
    uploadAvatar,
    removeAvatar,
    auth: {
      avatarUrl: null as string | null,
      uploadAvatar,
      removeAvatar,
      user: { id: "user-1", email: "student@example.com" },
      profile: {
        id: "user-1",
        display_name: "Tunmise",
        avatar_url: null,
        created_at: "2026-10-01T10:00:00+00:00",
        updated_at: "2026-10-01T10:00:00+00:00",
      },
      profileStatus: "ready" as const,
      profileError: null,
      saveDisplayName,
      signOut,
      retryProfile: vi.fn(),
    },
    provider: {
      application: null as null | {
        id: string;
        kind: "landlord" | "agent";
        display_name: string;
        status: "pending" | "approved" | "rejected" | "suspended";
        created_at: string;
        updated_at: string;
      },
      loadStatus: "ready" as "loading" | "ready" | "error",
      loadError: null as string | null,
    },
  };
});

vi.mock("@/auth/use-auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/provider/use-provider-application", () => ({
  useProviderApplication: () => state.provider,
}));

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/" element={<p>Home screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.saveDisplayName.mockReset();
  state.saveDisplayName.mockResolvedValue({ error: null });
  state.signOut.mockReset();
  state.signOut.mockResolvedValue({ error: null });
  state.uploadAvatar.mockReset();
  state.uploadAvatar.mockResolvedValue({ error: null });
  state.removeAvatar.mockReset();
  state.removeAvatar.mockResolvedValue({ error: null });
  state.auth.avatarUrl = null;
  state.provider.application = null;
  state.provider.loadStatus = "ready";
});

describe("Profile page", () => {
  it("shows identity, shortcuts and the two provider route cards", () => {
    renderAccount();

    expect(screen.getByRole("heading", { level: 1, name: "Your profile" })).toBeTruthy();
    expect(screen.getAllByText("Tunmise").length).toBeGreaterThan(0);
    expect(screen.getAllByText("student@example.com").length).toBeGreaterThan(0);
    // Exactly one entry point to settings, not a duplicate per panel.
    expect(screen.getAllByRole("link", { name: /Settings/ })).toHaveLength(1);
    // Exactly two provider entry points, one per route, as small icon cards.
    const providerLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/provider"));
    expect(providerLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/provider?kind=landlord",
      "/provider?kind=agent",
    ]);
    for (const link of providerLinks) {
      expect(link.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByText("Apply to let rooms as a landlord or agency. Approval is required before you can publish.")).toBeTruthy();
  });

  it("shows approved provider status and application details", () => {
    state.provider.application = {
      id: "provider-1",
      kind: "agent",
      display_name: "Akoka Homes",
      status: "approved",
      created_at: "2026-10-02T10:00:00+00:00",
      updated_at: "2026-10-03T10:00:00+00:00",
    };
    renderAccount();

    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getByText(/Akoka Homes/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /View application/ })).toBeTruthy();
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === "/provider"),
    ).toHaveLength(1);
  });

  it("saves a new display name", async () => {
    renderAccount();

    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Tunmise A." } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(state.saveDisplayName).toHaveBeenCalledWith("Tunmise A.");
    });
    expect(await screen.findByText("Profile saved.")).toBeTruthy();
  });

  it("validates the display name before saving", async () => {
    renderAccount();

    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(state.saveDisplayName).not.toHaveBeenCalled();
    expect(await screen.findByText(/between 2 and 60 characters/i)).toBeTruthy();
  });

  it("uploads a profile photo from the profile page", async () => {
    renderAccount();

    const input = screen.getByLabelText("Profile photo") as HTMLInputElement;
    const file = new File(["photo"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(state.uploadAvatar).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText("Profile photo updated.")).toBeTruthy();
  });

  it("offers to remove an existing photo", () => {
    state.auth.avatarUrl = "https://example.test/me.jpg";
    renderAccount();

    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
  });

  it("signs out and returns home", async () => {
    renderAccount();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(state.signOut).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Home screen")).toBeTruthy();
  });
});
