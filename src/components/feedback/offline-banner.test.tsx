import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OfflineBanner,
  OfflineCopyNotice,
} from "@/components/feedback/offline-banner";

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe("offline indicator", () => {
  it("stays out of the way while the browser is online", () => {
    setOnline(true);
    render(<OfflineBanner />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("appears when the connection drops and leaves when it returns", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain("You are offline");
    expect(screen.getByRole("status").textContent).toContain("saved rooms");

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("starts visible when the app opens already offline", () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(screen.getByRole("status").textContent).toContain("You are offline");
  });

  it("marks a list read from the cache as an offline copy", () => {
    render(<OfflineCopyNotice savedAt={new Date().toISOString()} />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Offline copy");
    expect(notice.textContent).toContain("last read just now");
  });
});
