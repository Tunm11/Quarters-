import { describe, expect, it } from "vitest";
import { pushStateDescription, pushSupported, readPushState } from "@/notifications/push";

describe("web push browser support", () => {
  it("reports unsupported when the Push API is absent", async () => {
    expect(pushSupported()).toBe(false);
    await expect(readPushState()).resolves.toBe("unsupported");
  });
});

describe("pushStateDescription", () => {
  it("describes the subscribed state and the iOS limitation", () => {
    expect(pushStateDescription("subscribed")).toContain("even when the app is closed");
    expect(pushStateDescription("unsupported")).toContain("Home Screen");
    expect(pushStateDescription("denied")).toContain("Blocked");
  });
});
