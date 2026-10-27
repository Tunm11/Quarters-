import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { ReviewSheet } from "@/components/listings/review-sheet";
import type { ListingReview } from "@/listings/listing-reviews";

function renderSheet({
  existing = null as ListingReview | null,
  onSubmit = vi.fn(async () => ({ error: null })) as Mock,
}: { existing?: ListingReview | null; onSubmit?: Mock } = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  render(
    <ReviewSheet
      open
      onClose={onClose}
      listingTitle="Furnished hostel bed in Akoka"
      basis="visit"
      existing={existing}
      onSubmit={onSubmit}
      onSaved={onSaved}
    />,
  );

  return { onClose, onSaved, onSubmit };
}

function submitForm() {
  const form = document.getElementById("listing-review-form");
  if (!form) throw new Error("the review form is missing");
  fireEvent.submit(form);
}

describe("ReviewSheet", () => {
  it("shows the evidence badge the review will carry", () => {
    renderSheet();

    expect(screen.getByText("Visited")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "5 stars" })).toBeTruthy();
    expect(screen.getByLabelText("Your review")).toBeTruthy();
  });

  it("keeps publishing disabled until the draft is valid", () => {
    renderSheet();

    const publish = screen.getByRole("button", { name: "Publish review" });
    expect(publish.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), {
      target: { value: "Too short" },
    });
    expect(publish.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Your review"), {
      target: { value: "The room matched the listing and the agent answered every question." },
    });
    expect(publish.hasAttribute("disabled")).toBe(false);
  });

  it("submits the rating and the trimmed body", async () => {
    const { onSubmit, onSaved, onClose } = renderSheet();

    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), {
      target: { value: "  The room matched the listing and the agent answered every question.  " },
    });
    submitForm();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rating: 4,
        body: "The room matched the listing and the agent answered every question.",
      });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces a refusal instead of closing", async () => {
    const { onClose } = renderSheet({
      onSubmit: vi.fn(async () => ({
        error: "Reviews are open to students who visited or reserved a room here.",
      })),
    });

    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), {
      target: { value: "A review that the database will refuse for this account." },
    });
    submitForm();

    expect(
      await screen.findByText(
        "Reviews are open to students who visited or reserved a room here.",
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens prefilled for a correction", () => {
    renderSheet({
      existing: {
        id: "review-1",
        rating: 3,
        body: "Original thoughts about the room, written after the visit.",
        basis: "visit",
        created_at: "2026-10-01T00:00:00Z",
      },
    });

    expect(screen.getByRole("heading", { name: "Edit your review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "3 stars" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("Your review") as HTMLTextAreaElement).value).toBe(
      "Original thoughts about the room, written after the visit.",
    );
  });
});
