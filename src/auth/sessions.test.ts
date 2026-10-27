import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  describeDevice,
  formatLastActive,
  loadOwnSessions,
  revokeSession,
} from "@/auth/sessions";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67";
const MAC_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0";

describe("describeDevice", () => {
  it("names the browser and phone from a mobile user agent", () => {
    const device = describeDevice(IPHONE_SAFARI);
    expect(device.label).toBe("Safari on iPhone");
    expect(device.kind).toBe("mobile");
    expect(device.browser).toBe("Safari");
  });

  it("reads an Android phone", () => {
    const device = describeDevice(ANDROID_CHROME);
    expect(device.label).toBe("Chrome on Android");
    expect(device.kind).toBe("mobile");
  });

  it("separates an iPad from an iPhone", () => {
    const device = describeDevice(IPAD_SAFARI);
    expect(device.label).toBe("Safari on iPad");
    expect(device.kind).toBe("tablet");
  });

  it("reads a desktop browser", () => {
    expect(describeDevice(WINDOWS_CHROME)).toMatchObject({
      label: "Chrome on Windows",
      kind: "desktop",
    });
  });

  it("does not mistake Edge for Chrome", () => {
    expect(describeDevice(WINDOWS_EDGE).label).toBe("Edge on Windows");
  });

  it("reads Firefox on macOS", () => {
    expect(describeDevice(MAC_FIREFOX)).toMatchObject({
      label: "Firefox on macOS",
      browser: "Firefox",
      platform: "macOS",
    });
  });

  it("says the device is unrecognised instead of guessing", () => {
    expect(describeDevice(null)).toMatchObject({
      label: "Unrecognised device",
      browser: null,
      platform: null,
      kind: "unknown",
    });
    expect(describeDevice("    ").label).toBe("Unrecognised device");
    expect(describeDevice("curl/8.4.0").label).toBe("Unrecognised device");
  });
});

describe("formatLastActive", () => {
  const now = new Date("2026-10-26T12:00:00Z");

  it("reports a missing timestamp instead of inventing one", () => {
    expect(formatLastActive(null, now)).toBe("Not recorded");
    expect(formatLastActive("not a date", now)).toBe("Not recorded");
  });

  it("describes recent activity", () => {
    expect(formatLastActive("2026-10-26T11:59:30Z", now)).toBe("Active just now");
    expect(formatLastActive("2026-10-26T11:45:00Z", now)).toBe("15 minutes ago");
    expect(formatLastActive("2026-10-26T09:00:00Z", now)).toBe("About 3 hours ago");
  });

  it("falls back to a date once activity is a week old", () => {
    expect(formatLastActive("2026-10-25T10:00:00Z", now)).toBe("Yesterday");
    expect(formatLastActive("2026-10-23T10:00:00Z", now)).toBe("3 days ago");
    expect(formatLastActive("2026-09-01T10:00:00Z", now)).toMatch(/2026/);
    expect(formatLastActive("2026-09-01T10:00:00Z", now)).not.toMatch(/ago/);
  });
});

function fakeClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("loadOwnSessions", () => {
  it("maps the RPC rows to sessions", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: "session-1",
          created_at: "2026-10-24T09:00:00+00:00",
          last_active_at: "2026-10-26T09:00:00+00:00",
          user_agent: ANDROID_CHROME,
          ip: "102.89.0.1",
          is_current: true,
        },
      ],
      error: null,
    }));

    const result = await loadOwnSessions(fakeClient(rpc));

    expect(rpc).toHaveBeenCalledWith("list_own_sessions");
    expect(result.error).toBeNull();
    expect(result.sessions).toEqual([
      {
        id: "session-1",
        createdAt: "2026-10-24T09:00:00+00:00",
        lastActiveAt: "2026-10-26T09:00:00+00:00",
        userAgent: ANDROID_CHROME,
        ip: "102.89.0.1",
        isCurrent: true,
      },
    ]);
  });

  it("returns an empty list when the account really has none", async () => {
    const result = await loadOwnSessions(
      fakeClient(vi.fn(async () => ({ data: [], error: null }))),
    );
    expect(result).toEqual({ sessions: [], error: null });
  });

  it("explains a missing migration instead of showing devices", async () => {
    const result = await loadOwnSessions(
      fakeClient(
        vi.fn(async () => ({
          data: null,
          error: { code: "PGRST202", message: "not found" },
        })),
      ),
    );

    expect(result.sessions).toEqual([]);
    expect(result.error).toMatch(/session migration has not been applied/);
  });
});

describe("revokeSession", () => {
  it("sends the session id and reports success", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));

    const result = await revokeSession(fakeClient(rpc), "session-2");

    expect(rpc).toHaveBeenCalledWith("revoke_own_session", {
      p_session_id: "session-2",
    });
    expect(result.error).toBeNull();
  });

  it("shows the database's refusal verbatim", async () => {
    const result = await revokeSession(
      fakeClient(
        vi.fn(async () => ({
          data: null,
          error: { code: "P0001", message: "That session is no longer active." },
        })),
      ),
      "session-2",
    );

    expect(result.error).toBe("That session is no longer active.");
  });
});
