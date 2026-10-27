import { describe, expect, it } from "vitest";
import { formatNotificationTime, notificationTone } from "@/notifications/notifications";

describe("formatNotificationTime", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");

  it("describes recent activity in minutes and hours", () => {
    expect(formatNotificationTime("2026-10-25T11:59:40.000Z", now)).toBe("Just now");
    expect(formatNotificationTime("2026-10-25T11:48:00.000Z", now)).toBe("12m ago");
    expect(formatNotificationTime("2026-10-25T09:00:00.000Z", now)).toBe("3h ago");
  });

  it("switches to days, then to a date", () => {
    expect(formatNotificationTime("2026-10-23T12:00:00.000Z", now)).toBe("2d ago");
    expect(formatNotificationTime("2026-10-01T12:00:00.000Z", now)).toBe("1 Oct");
  });

  it("renders nothing for an unreadable timestamp", () => {
    expect(formatNotificationTime("not-a-date", now)).toBe("");
  });
});

describe("notificationTone", () => {
  it("marks accepted and held rooms positive, refusals caution, requests accent", () => {
    expect(notificationTone("roommate_accepted")).toBe("positive");
    expect(notificationTone("visit_declined")).toBe("caution");
    expect(notificationTone("visit_requested")).toBe("accent");
  });
});
