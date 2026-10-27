import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Photo } from "@/components/ui/photo";

const source = "https://storage.test/room.jpg?sig=1";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Photo", () => {
  it("decodes asynchronously and stays lazy by default", () => {
    const { container } = render(<Photo src={source} alt="Room" />);

    const img = container.querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("alt")).toBe("Room");
  });

  it("loads straight away when eager", () => {
    const { container } = render(<Photo src={source} eager alt="" />);

    const img = container.querySelector("img");
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(img?.getAttribute("src")).toBe(source);
  });

  it("waits for the viewport before fetching, then loads the photo", async () => {
    const observers: { callback: (entries: { isIntersecting: boolean }[]) => void }[] =
      [];
    const observe = vi.fn();
    const disconnect = vi.fn();

    class FakeObserver {
      callback: (entries: { isIntersecting: boolean }[]) => void;
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback;
        observers.push({ callback });
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "";
      thresholds = [];
    }

    vi.stubGlobal("IntersectionObserver", FakeObserver);

    const { container } = render(<Photo src={source} alt="" />);
    const img = container.querySelector("img");

    // Nothing requested until the observer says it is nearly visible.
    expect(img?.getAttribute("src")).not.toBe(source);
    expect(observe).toHaveBeenCalled();

    await act(async () => {
      observers[0].callback([{ isIntersecting: true }]);
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(source);
  });

  it("renders with the blank placeholder when there is no photo", () => {
    const { container } = render(<Photo src={null} alt="" />);

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^data:image\/gif/);
  });
});
