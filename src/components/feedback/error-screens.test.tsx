import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "@/components/feedback/error-boundary";
import { CrashScreen, NoNetworkScreen } from "@/components/feedback/error-screens";

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function Boom(): null {
  throw new Error("render exploded");
}

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe("crash screen", () => {
  it("takes the blame, says the developers are on it, and offers a reload", () => {
    const onReload = vi.fn();
    render(<CrashScreen onReload={onReload} />);

    expect(screen.getByRole("alert").textContent).toContain("Something broke at our end");
    expect(screen.getByRole("alert").textContent).toContain(
      "Our developers are already working on the fix",
    );

    fireEvent.click(screen.getByRole("button", { name: /reload the app/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("keeps the technical detail out of production builds", () => {
    const { rerender } = render(<CrashScreen />);
    expect(screen.queryByText(/render exploded/)).toBeNull();

    rerender(<CrashScreen details="Error: render exploded" />);
    expect(screen.getByText("Error: render exploded")).toBeTruthy();
  });
});

describe("no-network screen", () => {
  it("explains the connection is the problem and what still works", () => {
    render(<NoNetworkScreen />);

    expect(screen.getByRole("alert").textContent).toContain("You're offline");
    expect(screen.getByRole("alert").textContent).toContain("Check your data or Wi-Fi");
    expect(screen.getByText(/Saved rooms and your conversations still open/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /open saved rooms/i }).getAttribute("href")).toBe(
      "/saved",
    );
  });

  it("retries on request instead of deciding for the user", () => {
    const onRetry = vi.fn();
    render(<NoNetworkScreen onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the heading so the message is announced", () => {
    render(<NoNetworkScreen />);

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /you're offline/i }),
    );
  });
});

describe("root error boundary", () => {
  it("renders the crash screen instead of unmounting a blank page", () => {
    // React logs the caught error itself; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Something broke at our end");
  });

  it("sends a transport failure that happened offline to the connection screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setOnline(false);

    // What a lazy route throws when the chunk cannot be downloaded.
    function FailedImport(): null {
      throw new TypeError("Failed to fetch dynamically imported module");
    }

    render(
      <AppErrorBoundary>
        <FailedImport />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("You're offline");
  });

  it("still calls a bug a bug when the connection is fine", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setOnline(true);

    function FailedImport(): null {
      throw new TypeError("Failed to fetch dynamically imported module");
    }

    render(
      <AppErrorBoundary>
        <FailedImport />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Something broke at our end");
  });

  it("leaves a healthy tree alone", () => {
    render(
      <AppErrorBoundary>
        <p>All good</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
