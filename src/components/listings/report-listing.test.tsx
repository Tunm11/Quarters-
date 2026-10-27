import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportListing } from "@/components/listings/report-listing";

const insert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => {
  const rows = { data: [], error: null };
  const query: Record<string, unknown> = {};
  const chain = () => query;
  Object.assign(query, {
    select: chain,
    eq: chain,
    order: chain,
    limit: async () => rows,
  });

  return {
    supabase: {
      from: () => ({ ...query, insert }),
    },
  };
});

function renderReport({
  viewerId = "user-1" as string | null,
  onRequireAuth = vi.fn(),
} = {}) {
  const onRequireAuthSpy = onRequireAuth;

  render(
    <ReportListing
      listingId="listing-1"
      listingTitle="Furnished hostel bed in Akoka"
      viewerId={viewerId}
      onRequireAuth={onRequireAuthSpy}
    />,
  );

  return { onRequireAuth: onRequireAuthSpy };
}

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe("ReportListing", () => {
  it("sends a signed-out visitor to sign in instead of opening the sheet", () => {
    const { onRequireAuth } = renderReport({ viewerId: null });

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));

    expect(onRequireAuth).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists every reason and waits for one before sending", () => {
    renderReport();

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));

    const dialog = screen.getByRole("dialog", { name: "Report this listing" });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Looks like a scam/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Already taken/ })).toBeTruthy();

    const send = screen.getByRole("button", { name: "Send report" });
    expect(send.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Looks like a scam/ }));
    expect(send.hasAttribute("disabled")).toBe(false);
  });

  it("files the report and confirms it was received", async () => {
    renderReport();

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));
    fireEvent.click(screen.getByRole("radio", { name: /Already taken/ }));
    fireEvent.change(screen.getByLabelText(/Anything else/), {
      target: { value: "The room was let two weeks ago and the agent knows it." },
    });

    const form = document.getElementById("report-listing-form");
    if (!form) throw new Error("the report form is missing");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(insert).toHaveBeenCalledWith({
        listing_id: "listing-1",
        reporter_id: "user-1",
        reason: "already_taken",
        details: "The room was let two weeks ago and the agent knows it.",
      });
    });

    expect(
      await screen.findByText("Thanks — an administrator will review this listing."),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("answers a duplicate honestly", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    renderReport();

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));
    fireEvent.click(screen.getByRole("radio", { name: /Looks like a scam/ }));

    const form = document.getElementById("report-listing-form");
    if (!form) throw new Error("the report form is missing");
    fireEvent.submit(form);

    expect(
      await screen.findByText(/You had already reported this listing/),
    ).toBeTruthy();
  });

  it("needs words when 'Something else' is chosen", async () => {
    renderReport();

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));
    fireEvent.click(screen.getByRole("radio", { name: /Something else/ }));

    const form = document.getElementById("report-listing-form");
    if (!form) throw new Error("the report form is missing");
    fireEvent.submit(form);

    expect(await screen.findByText(/at least 10 characters/)).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces a refused write", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    renderReport();

    fireEvent.click(screen.getByRole("button", { name: "Report this listing" }));
    fireEvent.click(screen.getByRole("radio", { name: /Details are wrong/ }));

    const form = document.getElementById("report-listing-form");
    if (!form) throw new Error("the report form is missing");
    fireEvent.submit(form);

    expect(await screen.findByText(/Sign in to report a listing/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
