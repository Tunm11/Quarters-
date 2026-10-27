import { describe, expect, it, vi } from "vitest";
import {
  listingReportReasonLabel,
  loadMyListingReport,
  submitListingReport,
  validateReport,
} from "@/listings/listing-reports";
import type { TypedSupabaseClient } from "@/lib/supabase";

function client({
  insertError = null as { code: string; message: string } | null,
  rows = [] as unknown[],
} = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
  };

  return {
    from: () => ({ ...query, insert }),
    insert,
  } as unknown as TypedSupabaseClient & { insert: typeof insert };
}

describe("validateReport", () => {
  it("needs a reason", () => {
    expect(validateReport({ reason: null, details: "" })).toMatch(/why you are reporting/);
  });

  it("needs words when the reason is 'other'", () => {
    expect(validateReport({ reason: "other", details: "" })).toMatch(/at least 10/);
  });

  it("allows an empty description for the named reasons", () => {
    expect(validateReport({ reason: "scam", details: "" })).toBeNull();
  });

  it("refuses a description that is too short to mean anything", () => {
    expect(validateReport({ reason: "scam", details: "bad" })).toMatch(/more detail/);
  });

  it("caps the description", () => {
    expect(validateReport({ reason: "scam", details: "x".repeat(1001) })).toMatch(
      /under 1000/,
    );
  });
});

describe("submitListingReport", () => {
  it("writes one report for the caller", async () => {
    const mock = client();
    const result = await submitListingReport(mock, {
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "wrong_details",
      details: "  The rent shown is half what the agent quoted.  ",
    });

    expect(result).toEqual({ error: null, duplicate: false });
    expect(mock.insert).toHaveBeenCalledWith({
      listing_id: "listing-1",
      reporter_id: "user-1",
      reason: "wrong_details",
      details: "The rent shown is half what the agent quoted.",
    });
  });

  it("sends null rather than an empty description", async () => {
    const mock = client();
    await submitListingReport(mock, {
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "scam",
      details: "   ",
    });

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ details: null }),
    );
  });

  it("reports a duplicate as already filed, not as a failure", async () => {
    const result = await submitListingReport(client({ insertError: { code: "23505", message: "dup" } }), {
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "scam",
      details: "",
    });

    expect(result).toEqual({ error: null, duplicate: true });
  });

  it("explains a missing migration", async () => {
    const result = await submitListingReport(client({ insertError: { code: "42P01", message: "no table" } }), {
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "scam",
      details: "",
    });

    expect(result.error).toMatch(/not available yet/);
    expect(result.duplicate).toBe(false);
  });

  it("refuses an invalid draft before writing", async () => {
    const mock = client();
    const result = await submitListingReport(mock, {
      listingId: "listing-1",
      reporterId: "user-1",
      reason: "other",
      details: "",
    });

    expect(result.error).toMatch(/at least 10/);
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

describe("loadMyListingReport", () => {
  it("returns the caller's latest report", async () => {
    const report = await loadMyListingReport(
      client({ rows: [{ id: "r1", reason: "scam", status: "open", created_at: "2026-10-01T00:00:00Z" }] }),
      "listing-1",
    );

    expect(report?.reason).toBe("scam");
  });

  it("returns null when nothing was filed", async () => {
    expect(await loadMyListingReport(client(), "listing-1")).toBeNull();
  });
});

describe("listingReportReasonLabel", () => {
  it("names the reasons in words", () => {
    expect(listingReportReasonLabel("already_taken")).toBe("Already taken");
    expect(listingReportReasonLabel("other")).toBe("Something else");
  });
});
