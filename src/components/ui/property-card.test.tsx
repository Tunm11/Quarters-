import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PropertyCard } from "@/components/ui/property-card";

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

function renderCard(props: Partial<ComponentProps<typeof PropertyCard>> = {}) {
  return render(
    <MemoryRouter initialEntries={["/explore"]}>
      <LocationProbe />
      <PropertyCard id="prop-1" title="Sunlit self-contained" {...props} />
    </MemoryRouter>,
  );
}

describe("PropertyCard", () => {
  it("renders real fields: location, rent with period, type, facilities, availability, provider approval", () => {
    renderCard({
      imageUrl: "https://images.example/room.jpg",
      location: "Akoka, Lagos",
      rentAmount: 750000,
      rentPeriod: "year",
      propertyType: "Self-contained",
      facilities: ["Wi-Fi", "Water", "Backup power"],
      availability: "available",
      providerApproved: true,
    });

    expect(screen.getByRole("heading", { name: "Sunlit self-contained" })).toBeTruthy();
    expect(screen.getByText("Akoka, Lagos")).toBeTruthy();
    expect(screen.getByText(/750,000/)).toBeTruthy();
    expect(screen.getByText(/\/year/)).toBeTruthy();
    expect(screen.getByText("Self-contained")).toBeTruthy();
    // Amenities are icons, not text chips; the stored name stays accessible.
    expect(screen.getByRole("img", { name: "Wi-Fi" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Water" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Backup power" })).toBeTruthy();
    expect(screen.queryByText("Wi-Fi")).toBeNull();
    expect(screen.getByText("Available now")).toBeTruthy();
    expect(screen.getByText("Approved provider")).toBeTruthy();

    const image = document.querySelector("img");
    expect(image).toBeTruthy();
    expect(image?.getAttribute("src")).toBe("https://images.example/room.jpg");
    expect(image?.className).toContain("object-cover");
  });

  it("shows the listing's own verified and inspected marks", () => {
    renderCard({
      providerApproved: true,
      verifiedAt: "2026-10-20T09:00:00+00:00",
      inspectedAt: "2026-10-22T09:00:00+00:00",
    });

    const checks = screen.getByRole("list", { name: "Listing checks" });
    expect(within(checks).getByText("Verified listing")).toBeTruthy();
    expect(within(checks).getByText("Inspected")).toBeTruthy();
    // Provider approval is a different claim and keeps its own line.
    expect(screen.getByText("Approved provider")).toBeTruthy();
  });

  it("claims no listing check the database does not hold", () => {
    renderCard({ providerApproved: true });

    expect(screen.queryByRole("list", { name: "Listing checks" })).toBeNull();
    expect(screen.queryByText("Verified listing")).toBeNull();
    expect(screen.queryByText("Inspected")).toBeNull();
  });

  it("shows up to four amenity icons and counts the rest", () => {
    renderCard({
      facilities: ["Wi-Fi", "Water", "Backup power", "Security", "Study room", "Laundry"],
    });

    const amenities = screen.getByRole("list", { name: "Amenities" });
    expect(within(amenities).getAllByRole("img")).toHaveLength(4);
    expect(within(amenities).getByText("+2")).toBeTruthy();
  });

  it("degrades honestly when optional fields are missing", () => {
    renderCard();

    // No image → placeholder, never a fabricated photo.
    expect(document.querySelector("img")).toBeNull();

    // Missing optional data renders nothing rather than misleading values.
    expect(document.body.textContent).not.toContain("₦");
    expect(screen.queryByText("Approved provider")).toBeNull();
    expect(
      screen.queryByText(/Available now|Limited spots|Currently unavailable/),
    ).toBeNull();
    expect(screen.queryByText(/\/month/)).toBeNull();

    // Title still renders as a plain heading (no details route exists).
    expect(screen.getByRole("heading", { name: "Sunlit self-contained" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("browses a photo catalogue in place when a listing has several photos", () => {
    renderCard({
      href: "/property/prop-1",
      photoUrls: [
        "https://images.example/cover.jpg",
        "https://images.example/gallery-1.jpg",
        "https://images.example/gallery-2.jpg",
      ],
    });

    const image = () => document.querySelector("img");
    expect(image()?.getAttribute("src")).toBe("https://images.example/cover.jpg");
    expect(screen.getByText("1/3")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Next photo of Sunlit self-contained" }),
    );
    expect(image()?.getAttribute("src")).toBe("https://images.example/gallery-1.jpg");
    expect(screen.getByText("2/3")).toBeTruthy();

    // Browsing stays on the list: the card link is not followed.
    expect(screen.getByTestId("path").textContent).toBe("/explore");

    const previous = () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Previous photo of Sunlit self-contained",
        }),
      );

    previous();
    expect(image()?.getAttribute("src")).toBe("https://images.example/cover.jpg");
    expect(screen.getByText("1/3")).toBeTruthy();

    // Wrapping backwards from the cover lands on the last photo.
    previous();
    expect(image()?.getAttribute("src")).toBe("https://images.example/gallery-2.jpg");
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("shows no catalogue controls for a single photo", () => {
    renderCard({
      photoUrls: ["https://images.example/cover.jpg"],
    });

    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "https://images.example/cover.jpg",
    );
    expect(screen.queryByRole("button", { name: /photo of/ })).toBeNull();
  });

  it("disables the bookmark when no persistence exists", () => {
    renderCard();

    const bookmark = screen.getByRole("button", {
      name: "Saving Sunlit self-contained is not available yet",
    }) as HTMLButtonElement;
    expect(bookmark.disabled).toBe(true);
  });

  it("keeps the bookmark from triggering card navigation", () => {
    const onBookmark = vi.fn();
    renderCard({ href: "/property/prop-1", onBookmark });

    const bookmark = screen.getByRole("button", { name: "Save Sunlit self-contained" });
    fireEvent.click(bookmark);
    expect(onBookmark).toHaveBeenCalledWith("prop-1");
    expect(screen.getByTestId("path").textContent).toBe("/explore");

    // The card itself is navigable via its title link.
    fireEvent.click(screen.getByRole("link", { name: "Sunlit self-contained" }));
    expect(screen.getByTestId("path").textContent).toBe("/property/prop-1");
  });
});
