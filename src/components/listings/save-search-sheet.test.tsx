import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveSearchSheet } from "@/components/listings/save-search-sheet";
import type { SavedSearch, SavedSearchCriteria } from "@/listings/saved-searches";

const criteria: SavedSearchCriteria = {
  query: "akoka",
  category: "private",
  filters: {
    budget: { min: 0, max: 800000 },
    types: ["private_room"],
    bedrooms: [1],
    facilities: ["Wi-Fi"],
  },
};

const saved: SavedSearch = {
  id: "search-1",
  name: "Akoka under ₦800k",
  query: "akoka",
  category: "private",
  budget_min: 0,
  budget_max: 800000,
  types: ["private_room"],
  bedrooms: [1],
  facilities: ["Wi-Fi"],
  notify: true,
  created_at: "2026-10-26T08:00:00Z",
};

function renderSheet({
  matchCount = 2,
  onCreate = vi.fn().mockResolvedValue({ search: saved, error: null }),
}: {
  matchCount?: number | null;
  onCreate?: (input: {
    name: string;
    criteria: SavedSearchCriteria;
    notify: boolean;
  }) => Promise<{ search: SavedSearch | null; error: string | null }>;
} = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  render(
    <SaveSearchSheet
      open
      onClose={onClose}
      criteria={criteria}
      matchCount={matchCount}
      onCreate={onCreate}
      onSaved={onSaved}
    />,
  );

  return { onClose, onSaved, onCreate };
}

describe("SaveSearchSheet", () => {
  it("describes the search and offers a name for it", () => {
    renderSheet();

    expect(screen.getByRole("dialog", { name: "Save this search" })).toBeTruthy();
    expect(
      screen.getByText("“akoka” · Private rooms · Under ₦800k · Private room · 1 bedroom · Wi-Fi"),
    ).toBeTruthy();
    expect(screen.getByText("2 of the rooms loaded so far match this search.")).toBeTruthy();

    const name = screen.getByLabelText("Name this search") as HTMLInputElement;
    expect(name.value).toBe("“akoka” · Private rooms · Under ₦800k");
  });

  it("says so when nothing matches yet, because that is when saving matters most", () => {
    renderSheet({ matchCount: 0 });

    expect(
      screen.getByText(/No published room matches this search yet/),
    ).toBeTruthy();
  });

  it("saves the search with the alert switch on by default", async () => {
    const { onCreate, onSaved, onClose } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Save search" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: "“akoka” · Private rooms · Under ₦800k",
        criteria,
        notify: true,
      });
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onClose).toHaveBeenCalled();
  });

  it("saves quietly when the student turns the alert off", async () => {
    const { onCreate } = renderSheet();

    fireEvent.click(
      screen.getByRole("switch", { name: "Notify me when a room matches" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ notify: false }));
    });
  });

  it("asks for a name rather than saving an unnamed search", async () => {
    const { onCreate } = renderSheet();

    fireEvent.change(screen.getByLabelText("Name this search"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));

    expect(await screen.findByText("Give this search a name first.")).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("surfaces a refused save instead of closing", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      search: null,
      error: "Saved searches are not available yet.",
    });
    const { onClose } = renderSheet({ onCreate });

    fireEvent.click(screen.getByRole("button", { name: "Save search" }));

    expect(
      await screen.findByText("Saved searches are not available yet."),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
