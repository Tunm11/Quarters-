import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/settings";
import { DEVICE_PREFERENCES_KEY } from "@/settings/preferences";

const state = vi.hoisted(() => {
  const updatePassword = vi.fn(async () => ({ error: null as string | null }));
  const signOut = vi.fn(async () => ({ error: null as string | null }));
  const signOutOthers = vi.fn(async () => ({ error: null as string | null }));
  const signOutEverywhere = vi.fn(async () => ({ error: null as string | null }));
  const changeEmail = vi.fn(async (_email: string) => ({
    error: null as string | null,
    changedImmediately: false,
    pendingEmail: "new@example.com" as string | null,
  }));
  const uploadAvatar = vi.fn(async (_file: File) => ({ error: null as string | null }));
  const removeAvatar = vi.fn(async () => ({ error: null as string | null }));
  const deleteAccount = vi.fn(async () => ({ error: null as string | null }));

  return {
    updatePassword,
    signOut,
    signOutOthers,
    signOutEverywhere,
    changeEmail,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
    auth: {
      user: {
        id: "user-1",
        email: "student@example.com",
        new_email: undefined as string | undefined,
      },
      profile: {
        display_name: "Tunmise",
        avatar_url: null as string | null,
        created_at: "2026-10-01T10:00:00+00:00",
      },
      avatarUrl: null as string | null,
      signOut,
      signOutOthers,
      signOutEverywhere,
      updatePassword,
      changeEmail,
      uploadAvatar,
      removeAvatar,
      deleteAccount,
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
      submitting: false,
      reload: vi.fn(),
      submit: vi.fn(),
    },
  };
});

const sessionsState = vi.hoisted(() => ({
  sessions: [] as {
    id: string;
    createdAt: string;
    lastActiveAt: string | null;
    userAgent: string | null;
    ip: string | null;
    isCurrent: boolean;
  }[],
  status: "ready" as "loading" | "ready" | "error",
  error: null as string | null,
  revokingId: null as string | null,
  notice: null as string | null,
  reload: vi.fn(async () => {}),
  revoke: vi.fn(async (_id: string) => null as string | null),
}));

const reportsState = vi.hoisted(() => ({
  reports: [] as {
    id: string;
    kind: "person" | "listing";
    subject: string;
    reasonLabel: string;
    statusLabel: string;
    tone: "neutral" | "accent" | "positive" | "caution";
    awaiting: boolean;
    createdAt: string;
  }[],
  status: "ready" as "loading" | "ready" | "error",
  error: null as string | null,
  reload: vi.fn(async () => {}),
}));

vi.mock("@/settings/use-my-reports", () => ({
  useMyReports: () => ({
    reports: reportsState.reports,
    status: reportsState.status,
    error: reportsState.error,
    reload: reportsState.reload,
  }),
}));

vi.mock("@/auth/use-auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/auth/use-auth-sessions", () => ({
  useAuthSessions: () => ({
    sessions: sessionsState.sessions,
    status: sessionsState.status,
    error: sessionsState.error,
    revokingId: sessionsState.revokingId,
    notice: sessionsState.notice,
    clearNotice: () => {},
    reload: sessionsState.reload,
    revoke: sessionsState.revoke,
  }),
}));
vi.mock("@/provider/use-provider-application", () => ({
  useProviderApplication: () => state.provider,
}));

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<p>Home screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Two sessions: this browser, and a laptop that can be signed out. */
function seedDevices() {
  sessionsState.sessions = [
    {
      id: "session-current",
      createdAt: "2026-10-24T09:00:00+00:00",
      lastActiveAt: "2026-10-26T09:00:00+00:00",
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36",
      ip: "102.89.0.1",
      isCurrent: true,
    },
    {
      id: "session-other",
      createdAt: "2026-10-20T09:00:00+00:00",
      lastActiveAt: "2026-10-25T09:00:00+00:00",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      ip: null,
      isCurrent: false,
    },
  ];
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.reduceMotion;
  state.updatePassword.mockReset();
  state.updatePassword.mockResolvedValue({ error: null });
  state.signOut.mockReset();
  state.signOut.mockResolvedValue({ error: null });
  state.signOutOthers.mockReset();
  state.signOutOthers.mockResolvedValue({ error: null });
  sessionsState.sessions = [];
  sessionsState.status = "ready";
  sessionsState.error = null;
  sessionsState.revokingId = null;
  sessionsState.notice = null;
  sessionsState.reload.mockReset();
  sessionsState.reload.mockResolvedValue(undefined);
  sessionsState.revoke.mockReset();
  sessionsState.revoke.mockResolvedValue(null);
  state.signOutEverywhere.mockReset();
  state.signOutEverywhere.mockResolvedValue({ error: null });
  state.changeEmail.mockReset();
  state.changeEmail.mockResolvedValue({
    error: null,
    changedImmediately: false,
    pendingEmail: "new@example.com",
  });
  state.uploadAvatar.mockReset();
  state.uploadAvatar.mockResolvedValue({ error: null });
  state.removeAvatar.mockReset();
  state.removeAvatar.mockResolvedValue({ error: null });
  state.deleteAccount.mockReset();
  state.deleteAccount.mockResolvedValue({ error: null });
  state.auth.user.new_email = undefined;
  state.auth.avatarUrl = null;
  state.provider.application = null;
  state.provider.loadStatus = "ready";
  state.provider.loadError = null;
  reportsState.reports = [];
  reportsState.status = "ready";
  reportsState.error = null;
  reportsState.reload.mockReset();
  reportsState.reload.mockResolvedValue(undefined);
});

describe("Settings page", () => {
  it("renders every settings section and the account details", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    for (const section of [
      "Account",
      "Provider account",
      "Notifications",
      "Appearance & motion",
      "Security",
      "Devices & sessions",
      "Blocked roommates",
      "Reports you filed",
      "Privacy & data",
      "About",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeTruthy();
    }

    expect(screen.getByText("student@example.com")).toBeTruthy();
    expect(screen.getByText("Tunmise")).toBeTruthy();
    expect(screen.getByText("No application yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeTruthy();
    // The old "not available yet" copy must not come back.
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  it("persists notification switches on the device", () => {
    renderSettings();

    const newRooms = screen.getByRole("switch", {
      name: "New rooms near my campus",
    });
    expect(newRooms.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(newRooms);
    expect(newRooms.getAttribute("aria-checked")).toBe("false");

    const stored = window.localStorage.getItem(DEVICE_PREFERENCES_KEY);
    expect(stored).toContain('"notifyNewListings":false');
  });

  it("applies and clears the reduce-motion preference", () => {
    renderSettings();

    const motion = screen.getByRole("switch", { name: "Reduce motion" });
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();

    fireEvent.click(motion);
    expect(motion.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.reduceMotion).toBe("true");

    fireEvent.click(motion);
    expect(motion.getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
  });

  it("changes the password after matching, valid input", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const form = screen.getByRole("form", { name: "Change password" });

    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "strong-password-1" },
    });
    fireEvent.change(within(form).getByLabelText("Confirm new password"), {
      target: { value: "strong-password-1" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save password" }));

    await waitFor(() => {
      expect(state.updatePassword).toHaveBeenCalledWith("strong-password-1");
    });
    expect(
      await screen.findByText(/Password updated. Use the new password/),
    ).toBeTruthy();
  });

  it("rejects a short password without calling Supabase", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const form = screen.getByRole("form", { name: "Change password" });
    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(within(form).getByLabelText("Confirm new password"), {
      target: { value: "short" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save password" }));

    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();
    expect(state.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation passwords", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const form = screen.getByRole("form", { name: "Change password" });
    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "strong-password-1" },
    });
    fireEvent.change(within(form).getByLabelText("Confirm new password"), {
      target: { value: "strong-password-2" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save password" }));

    expect(await screen.findByText("The new passwords do not match.")).toBeTruthy();
    expect(state.updatePassword).not.toHaveBeenCalled();
  });

  it("shows the update error without claiming success", async () => {
    state.updatePassword.mockResolvedValueOnce({
      error: "That password is too weak.",
    });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const form = screen.getByRole("form", { name: "Change password" });
    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "strong-password-1" },
    });
    fireEvent.change(within(form).getByLabelText("Confirm new password"), {
      target: { value: "strong-password-1" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save password" }));

    expect(await screen.findByText("That password is too weak.")).toBeTruthy();
    expect(screen.queryByText(/Password updated/)).toBeNull();
  });

  it("shows an approved provider badge", () => {
    state.provider.application = {
      id: "provider-1",
      kind: "agent",
      display_name: "Akoka Homes",
      status: "approved",
      created_at: "2026-10-02T10:00:00+00:00",
      updated_at: "2026-10-03T10:00:00+00:00",
    };
    renderSettings();

    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Akoka Homes")).toBeTruthy();
    expect(screen.getByText("Only approved providers can publish listings.")).toBeTruthy();
  });

  it("requires confirmation before signing out of every device", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    expect(state.signOutEverywhere).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, sign out everywhere" }));

    await waitFor(() => {
      expect(state.signOutEverywhere).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Home screen")).toBeTruthy();
  });

  it("lists signed-in devices and marks the current one", () => {
    seedDevices();
    renderSettings();

    expect(screen.getByText("Chrome on Android")).toBeTruthy();
    expect(screen.getByText("Chrome on Windows")).toBeTruthy();
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.getByText(/IP 102\.89\.0\.1/)).toBeTruthy();
    // The current session cannot end itself from this list; the other device can.
    expect(
      screen.getByRole("button", { name: "Sign out of Chrome on Windows" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Sign out of Chrome on Android" }),
    ).toBeNull();
  });

  it("revokes a named device session without signing this browser out", async () => {
    seedDevices();
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Sign out of Chrome on Windows" }));

    await waitFor(() => {
      expect(sessionsState.revoke).toHaveBeenCalledWith("session-other");
    });
    expect(state.signOut).not.toHaveBeenCalled();
    expect(state.signOutEverywhere).not.toHaveBeenCalled();
  });

  it("signs out other devices only after confirmation", async () => {
    seedDevices();
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Sign out of other devices" }));
    expect(state.signOutOthers).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Yes, sign out other devices" }),
    );

    await waitFor(() => {
      expect(state.signOutOthers).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(sessionsState.reload).toHaveBeenCalled();
    });
  });

  it("explains a missing session migration instead of inventing devices", () => {
    sessionsState.status = "error";
    sessionsState.error =
      "Session management is not enabled on this database yet. The session migration has not been applied.";
    renderSettings();

    expect(screen.getByText(/session migration has not been applied/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("This device")).toBeNull();
  });

  it("says so plainly when Supabase returns no sessions", () => {
    renderSettings();

    expect(screen.getByText("No active sessions found")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Sign out of other devices" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("resets device preferences", async () => {
    renderSettings();

    const newRooms = screen.getByRole("switch", {
      name: "New rooms near my campus",
    });
    fireEvent.click(newRooms);
    expect(newRooms.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(newRooms.getAttribute("aria-checked")).toBe("true");
    expect(
      await screen.findByText("Device preferences reset to their defaults."),
    ).toBeTruthy();
  });

  it("sends a new email address to Supabase and says confirmation is pending", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    const form = screen.getByRole("form", { name: "Change email" });
    fireEvent.change(within(form).getByLabelText("New email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save email" }));

    await waitFor(() => {
      expect(state.changeEmail).toHaveBeenCalledWith("new@example.com");
    });
    expect(await screen.findByText(/Confirmation sent/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Change email" })).toBeNull();
  });

  it("rejects an invalid email without calling Supabase", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    const form = screen.getByRole("form", { name: "Change email" });
    fireEvent.change(within(form).getByLabelText("New email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save email" }));

    expect(
      await screen.findByText("Enter an email address in the format name@example.com."),
    ).toBeTruthy();
    expect(state.changeEmail).not.toHaveBeenCalled();
  });

  it("shows the address waiting for email confirmation", () => {
    state.auth.user.new_email = "new@example.com";
    renderSettings();

    expect(screen.getByText(/Waiting for confirmation of new@example.com/)).toBeTruthy();
  });

  it("uploads a profile photo and reports the result", async () => {
    renderSettings();

    const input = screen.getByLabelText("Profile photo") as HTMLInputElement;
    const file = new File(["photo"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(state.uploadAvatar).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText("Profile photo updated.")).toBeTruthy();
  });

  it("offers remove once a photo is set", () => {
    state.auth.avatarUrl = "https://example.test/me.jpg";
    renderSettings();

    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("requires a typed confirmation before deleting the account", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    const confirm = screen.getByLabelText("Type DELETE to confirm");
    const permanent = screen.getByRole("button", {
      name: "Delete account permanently",
    }) as HTMLButtonElement;

    expect(permanent.disabled).toBe(true);
    expect(state.deleteAccount).not.toHaveBeenCalled();

    fireEvent.change(confirm, { target: { value: "DELETE" } });
    fireEvent.click(permanent);

    await waitFor(() => {
      expect(state.deleteAccount).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Home screen")).toBeTruthy();
  });

  it("shows why deletion was refused without leaving the page", async () => {
    state.deleteAccount.mockResolvedValueOnce({
      error:
        "Your room booking is still on record. Cancel or leave the booking first, then delete your account.",
    });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByText(/Cancel or leave the booking first/)).toBeTruthy();
    expect(screen.queryByText("Home screen")).toBeNull();
  });

  it("lists the reports you filed with where they stand", () => {
    reportsState.reports = [
      {
        id: "report-1",
        kind: "listing",
        subject: "Quiet room in Yaba",
        reasonLabel: "Looks like a scam",
        statusLabel: "Open",
        tone: "caution",
        awaiting: true,
        createdAt: "2026-10-26T09:00:00+00:00",
      },
      {
        id: "report-2",
        kind: "person",
        subject: "Ada M.",
        reasonLabel: "Harassment or abuse",
        statusLabel: "Reviewed",
        tone: "positive",
        awaiting: false,
        createdAt: "2026-10-20T09:00:00+00:00",
      },
    ];
    renderSettings();

    expect(screen.getByText("Quiet room in Yaba")).toBeTruthy();
    expect(screen.getByText(/Room · Looks like a scam/)).toBeTruthy();
    expect(screen.getByText("Ada M.")).toBeTruthy();
    expect(screen.getByText(/Student · Harassment or abuse/)).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    // Only the one still with a moderator is counted, not the closed report.
    expect(screen.getByText(/1 still with moderators/)).toBeTruthy();
  });

  it("explains an empty reports list instead of leaving a dead section", () => {
    renderSettings();

    expect(screen.getByText("No reports yet")).toBeTruthy();
    expect(
      screen.getByText(/Report a room from the room's own page/),
    ).toBeTruthy();
    // The empty state leads somewhere you can actually file a report from.
    const browse = screen.getByRole("link", { name: "Browse rooms" });
    expect(browse.getAttribute("href")).toBe("/explore");
  });

  it("explains a missing reports migration instead of inventing rows", () => {
    reportsState.status = "error";
    reportsState.error =
      "Your reports are not available yet. Apply the reporting migration.";
    renderSettings();

    expect(screen.getByText(/Apply the reporting migration/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
