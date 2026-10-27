import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  loadLatestProviderReview,
  loadProviderApplication,
  mapProviderError,
  PROVIDER_NAME_MAX,
  submitProviderApplication,
  validateProviderDisplayName,
} from "@/provider/application";
import type { TypedSupabaseClient } from "@/lib/supabase";

const applicationRow = {
  id: "provider-1",
  kind: "landlord",
  display_name: "Ada Rooms",
  status: "pending",
  created_at: "2026-10-24T09:00:00.000Z",
  updated_at: "2026-10-24T09:00:00.000Z",
};

type QueryResult = { data: unknown; error: unknown };

function pgError(code: string, message = "database error"): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

function makeClient(options: {
  rpc?: QueryResult[];
  insert?: QueryResult;
  review?: QueryResult[];
} = {}) {
  const rpcResults = [...(options.rpc ?? [])];
  const rpcMaybeSingle = vi.fn(
    async () => rpcResults.shift() ?? { data: null, error: null },
  );
  const rpc = vi.fn(() => ({ maybeSingle: rpcMaybeSingle }));

  const insertSingle = vi.fn(
    async () => options.insert ?? { data: null, error: null },
  );
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const reviewResults = [...(options.review ?? [])];
  const reviewMaybeSingle = vi.fn(
    async () => reviewResults.shift() ?? { data: null, error: null },
  );
  const reviewLimit = vi.fn(() => ({ maybeSingle: reviewMaybeSingle }));
  const reviewOrder = vi.fn(() => ({ limit: reviewLimit }));
  const reviewEq = vi.fn(() => ({ order: reviewOrder }));
  const reviewSelect = vi.fn(() => ({ eq: reviewEq }));

  const from = vi.fn((table: string) =>
    table === "providers"
      ? { insert }
      : { select: reviewSelect, insert },
  );

  return {
    client: { from, rpc } as unknown as TypedSupabaseClient,
    from,
    rpc,
    insert,
    insertSelect,
    reviewSelect,
    reviewEq,
    reviewOrder,
  };
}

describe("validateProviderDisplayName", () => {
  it("accepts a trimmed 2–80 character provider name", () => {
    expect(validateProviderDisplayName("Ada Rooms")).toBeNull();
    expect(validateProviderDisplayName("  AB  ")).toBeNull();
    expect(validateProviderDisplayName("A".repeat(PROVIDER_NAME_MAX))).toBeNull();
  });

  it("rejects empty, one-character and overlong names", () => {
    expect(validateProviderDisplayName("")).toContain("Enter your");
    expect(validateProviderDisplayName("   ")).toContain("Enter your");
    expect(validateProviderDisplayName("A")).toContain("at least 2");
    expect(validateProviderDisplayName("A".repeat(PROVIDER_NAME_MAX + 1))).toContain(
      `${PROVIDER_NAME_MAX} characters or fewer`,
    );
  });
});

describe("submitProviderApplication", () => {
  it("inserts the caller's application as pending and returns the new row", async () => {
    const fake = makeClient({ insert: { data: applicationRow, error: null } });

    const result = await submitProviderApplication(fake.client, {
      ownerId: "user-1",
      kind: "landlord",
      displayName: "  Ada Rooms  ",
    });

    expect(result).toEqual({ ok: true, application: applicationRow });
    expect(fake.insert).toHaveBeenCalledTimes(1);
    expect(fake.insert).toHaveBeenCalledWith({
      owner_id: "user-1",
      kind: "landlord",
      display_name: "Ada Rooms",
      status: "pending",
    });
    expect(fake.insertSelect).toHaveBeenCalledWith(
      "id, kind, display_name, status, created_at, updated_at",
    );
  });

  it("never sends an approved status, even when asked through an invalid kind", async () => {
    const fake = makeClient();

    const result = await submitProviderApplication(fake.client, {
      ownerId: "user-1",
      kind: "admin" as never,
      displayName: "Ada Rooms",
    });

    expect(result).toMatchObject({ ok: false, duplicate: false });
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid name before touching the database", async () => {
    const fake = makeClient();

    const result = await submitProviderApplication(fake.client, {
      ownerId: "user-1",
      kind: "agent",
      displayName: "A",
    });

    expect(result).toMatchObject({ ok: false });
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("reports a duplicate application and flags it for a status refresh", async () => {
    const fake = makeClient({
      insert: { data: null, error: pgError("23505") },
    });

    const result = await submitProviderApplication(fake.client, {
      ownerId: "user-1",
      kind: "agent",
      displayName: "Ada Rooms",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.duplicate).toBe(true);
    expect(result.error).toContain("already have a provider application");
  });

  it("maps a denied insert without exposing the raw database message", async () => {
    const fake = makeClient({
      insert: { data: null, error: pgError("42501", "row-level security") },
    });

    const result = await submitProviderApplication(fake.client, {
      ownerId: "user-1",
      kind: "agent",
      displayName: "Ada Rooms",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.error).toContain("not allowed");
    expect(result.error).not.toContain("row-level security");
  });
});

describe("mapProviderError", () => {
  it("maps a missing providers table to its migration message", () => {
    expect(mapProviderError(pgError("PGRST205"))).toContain(
      "Phase 2B provider-authorisation migration",
    );
  });

  it("keeps unknown failures generic", () => {
    const message = mapProviderError(pgError("XX000", "internal detail"));
    expect(message).toBe(
      "Could not submit your provider application. Please try again.",
    );
    expect(message).not.toContain("internal detail");
  });
});

describe("loadProviderApplication", () => {
  it("reads only the caller's application through the checked database function", async () => {
    const fake = makeClient({
      rpc: [{ data: applicationRow, error: null }],
    });

    const result = await loadProviderApplication(fake.client);

    expect(result).toEqual({ application: applicationRow, error: null });
    expect(fake.rpc).toHaveBeenCalledWith("current_provider_application");
  });

  it("returns no application without treating it as an error", async () => {
    const fake = makeClient({ rpc: [{ data: null, error: null }] });

    const result = await loadProviderApplication(fake.client);

    expect(result).toEqual({ application: null, error: null });
  });

  it("names the lookup migration when the function is absent", async () => {
    const fake = makeClient({ rpc: [{ data: null, error: pgError("PGRST202") }] });

    const result = await loadProviderApplication(fake.client);

    expect(result.application).toBeNull();
    expect(result.error).toContain("20261024090000_add_current_provider_application");
  });
});

describe("loadLatestProviderReview", () => {
  it("reads the provider-facing columns ordered by the newest review", async () => {
    const review = {
      id: 7,
      decision: "approved",
      provider_note: "Approved after reviewing the documents.",
      reviewed_at: "2026-10-24T10:00:00.000Z",
    };
    const fake = makeClient({ review: [{ data: review, error: null }] });

    const result = await loadLatestProviderReview(fake.client, "provider-1");

    expect(result).toEqual({ review, error: null });
    expect(fake.reviewSelect).toHaveBeenCalledWith(
      "id, decision, provider_note, reviewed_at",
    );
    expect(fake.reviewEq).toHaveBeenCalledWith("provider_id", "provider-1");
    expect(fake.reviewOrder).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("returns no review when the provider has not been reviewed", async () => {
    const fake = makeClient({ review: [{ data: null, error: null }] });

    const result = await loadLatestProviderReview(fake.client, "provider-1");

    expect(result).toEqual({ review: null, error: null });
  });

  it("does not surface a forbidden pending decision", async () => {
    const fake = makeClient({
      review: [
        {
          data: {
            id: 1,
            decision: "pending",
            provider_note: null,
            reviewed_at: "2026-10-24T10:00:00.000Z",
          },
          error: null,
        },
      ],
    });

    const result = await loadLatestProviderReview(fake.client, "provider-1");

    expect(result).toEqual({ review: null, error: null });
  });

  it("reports a review-note failure without blocking the status screen", async () => {
    const fake = makeClient({ review: [{ data: null, error: pgError("42501") }] });

    const result = await loadLatestProviderReview(fake.client, "provider-1");

    expect(result.review).toBeNull();
    expect(result.error).toBe("Your latest review note could not be loaded.");
  });
});
