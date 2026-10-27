import { describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase";
import {
  buildMyReports,
  countAwaitingReports,
  loadMyReports,
  mapMyReportsError,
  reportReasonText,
  reportStatusLabel,
  reportStatusTone,
  type MyReportRow,
} from "@/settings/my-reports";

function postgrestError(overrides: Record<string, unknown>) {
  return {
    message: "boom",
    details: null,
    hint: null,
    code: "42501",
    name: "PostgrestError",
    ...overrides,
  } as never;
}

function row(overrides: Partial<MyReportRow> = {}): MyReportRow {
  return {
    kind: "person",
    report_id: "report-1",
    subject: "Ada M.",
    reason: "harassment",
    status: "open",
    created_at: "2026-10-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("my report statuses", () => {
  it("uses the moderation words a student understands", () => {
    expect(reportStatusLabel("open")).toBe("Open");
    expect(reportStatusLabel("reviewing")).toBe("With a moderator");
    expect(reportStatusLabel("resolved")).toBe("Reviewed");
    expect(reportStatusLabel("dismissed")).toBe("Dismissed");
  });

  it("does not claim a status it does not recognise", () => {
    expect(reportStatusLabel("escalated")).toBe("Sent");
    expect(reportStatusTone("escalated")).toBe("neutral");
    expect(reportStatusTone("reviewing")).toBe("accent");
    expect(reportStatusTone("resolved")).toBe("positive");
    expect(reportStatusTone("open")).toBe("caution");
  });
});

describe("report reasons", () => {
  it("reads each queue in its own words", () => {
    expect(reportReasonText("person", "harassment")).toBe("Harassment or abuse");
    expect(reportReasonText("listing", "wrong_details")).toBe("Details are wrong");
  });

  it("falls back instead of showing a raw value", () => {
    expect(reportReasonText("person", "made_up")).toBe("Report");
    expect(reportReasonText("listing", "made_up")).toBe("Reported");
  });
});

describe("buildMyReports", () => {
  it("maps both kinds and keeps the newest first", () => {
    const reports = buildMyReports([
      row({ report_id: "older", created_at: "2026-10-20T09:00:00.000Z" }),
      row({
        kind: "listing",
        report_id: "newer",
        subject: "Quiet room in Yaba",
        reason: "scam",
        status: "reviewed",
        created_at: "2026-10-26T09:00:00.000Z",
      }),
    ]);

    expect(reports.map((report) => report.id)).toEqual(["newer", "older"]);
    expect(reports[0]).toMatchObject({
      kind: "listing",
      subject: "Quiet room in Yaba",
      reasonLabel: "Looks like a scam",
      statusLabel: "Reviewed",
      tone: "positive",
      awaiting: false,
    });
    expect(reports[1]).toMatchObject({
      kind: "person",
      statusLabel: "Open",
      awaiting: true,
    });
  });

  it("counts what is still being reviewed", () => {
    const reports = buildMyReports([
      row({ report_id: "a", status: "open" }),
      row({ report_id: "b", status: "reviewing" }),
      row({ report_id: "c", status: "dismissed" }),
    ]);

    expect(countAwaitingReports(reports)).toBe(2);
  });

  it("names a subject the server could not resolve", () => {
    expect(buildMyReports([row({ subject: null })])[0].subject).toBe("A student");
    expect(
      buildMyReports([row({ kind: "listing", subject: "   " })])[0].subject,
    ).toBe("A room");
  });

  it("drops a kind it cannot place rather than guessing", () => {
    expect(buildMyReports([row({ kind: "verification" })])).toEqual([]);
  });
});

describe("mapMyReportsError", () => {
  it("names the migration when the function is missing", () => {
    expect(mapMyReportsError(postgrestError({ code: "42883" }))).toContain(
      "Apply the reporting migration",
    );
  });

  it("asks a signed-out caller to sign in", () => {
    expect(mapMyReportsError(postgrestError({ code: "42501" }))).toContain(
      "Sign in",
    );
  });

  it("keeps a generic failure honest", () => {
    expect(mapMyReportsError(postgrestError({ code: "08006" }))).toBe(
      "Could not load the reports you filed. Please try again.",
    );
  });
});

describe("loadMyReports", () => {
  it("returns what the RPC sent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row()], error: null });

    const result = await loadMyReports({
      rpc,
    } as unknown as TypedSupabaseClient);

    expect(rpc).toHaveBeenCalledWith("my_reports");
    expect(result.error).toBeNull();
    expect(result.reports).toHaveLength(1);
  });

  it("reports a failure without inventing reports", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: postgrestError({ code: "42P01" }),
    });

    const result = await loadMyReports({
      rpc,
    } as unknown as TypedSupabaseClient);

    expect(result.reports).toEqual([]);
    expect(result.error).toContain("Apply the reporting migration");
  });

  it("treats an empty queue as empty", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const result = await loadMyReports({
      rpc,
    } as unknown as TypedSupabaseClient);

    expect(result).toEqual({ reports: [], error: null });
  });
});
