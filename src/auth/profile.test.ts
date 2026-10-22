import type { PostgrestError, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  deriveDisplayName,
  ensureProfile,
  mapProfileError,
  updateDisplayName,
} from "@/auth/profile";
import type { TypedSupabaseClient } from "@/lib/supabase";

const profileRow = {
  id: "user-1",
  display_name: "Ada",
  avatar_url: null,
  created_at: "2026-10-22T14:00:00.000Z",
  updated_at: "2026-10-22T14:00:00.000Z",
};

type QueryResult = { data: unknown; error: unknown };

function pgError(code: string, message = "database error"): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

function makeUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: "user-1",
    email: "student@example.com",
    user_metadata: metadata,
  } as User;
}

function makeClient(options: {
  select?: QueryResult[];
  insert?: QueryResult;
  update?: QueryResult;
}) {
  const selectResults = [...(options.select ?? [])];
  const maybeSingle = vi.fn(
    async () => selectResults.shift() ?? { data: null, error: null },
  );
  const insertSingle = vi.fn(async () => options.insert ?? { data: null, error: null });
  const updateSingle = vi.fn(async () => options.update ?? { data: null, error: null });

  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: insertSingle })),
  }));
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: updateSingle })),
    })),
  }));
  const from = vi.fn(() => ({ select, insert, update }));

  return {
    client: { from } as unknown as TypedSupabaseClient,
    from,
    insert,
    update,
    maybeSingle,
  };
}

describe("deriveDisplayName", () => {
  it("uses a trimmed, valid sign-up display name", () => {
    expect(deriveDisplayName(makeUser({ display_name: "  Ada  " }))).toBe("Ada");
  });

  it("ignores missing, non-string, and out-of-bounds metadata", () => {
    expect(deriveDisplayName(makeUser())).toBeNull();
    expect(deriveDisplayName(makeUser({ display_name: 42 }))).toBeNull();
    expect(deriveDisplayName(makeUser({ display_name: "A" }))).toBeNull();
    expect(deriveDisplayName(makeUser({ display_name: "A".repeat(61) }))).toBeNull();
  });
});

describe("ensureProfile", () => {
  it("returns the existing own profile without inserting", async () => {
    const fake = makeClient({
      select: [{ data: profileRow, error: null }],
    });

    const result = await ensureProfile(fake.client, makeUser({ display_name: "Ada" }));

    expect(result).toEqual({ profile: profileRow, error: null });
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("creates a missing profile from the authenticated user and metadata", async () => {
    const fake = makeClient({
      select: [{ data: null, error: null }],
      insert: { data: profileRow, error: null },
    });

    const result = await ensureProfile(fake.client, makeUser({ display_name: " Ada " }));

    expect(result).toEqual({ profile: profileRow, error: null });
    expect(fake.insert).toHaveBeenCalledTimes(1);
    expect(fake.insert).toHaveBeenCalledWith({
      id: "user-1",
      display_name: "Ada",
    });
  });

  it("re-reads the profile when a concurrent insert wins the race", async () => {
    const fake = makeClient({
      select: [
        { data: null, error: null },
        { data: profileRow, error: null },
      ],
      insert: { data: null, error: pgError("23505") },
    });

    const result = await ensureProfile(fake.client, makeUser());

    expect(result).toEqual({ profile: profileRow, error: null });
    expect(fake.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("maps a denied insert to a clear permission error", async () => {
    const fake = makeClient({
      select: [{ data: null, error: null }],
      insert: { data: null, error: pgError("42501") },
    });

    const result = await ensureProfile(fake.client, makeUser());

    expect(result.profile).toBeNull();
    expect(result.error).toBe("Your account is not allowed to change that profile.");
  });
});

describe("updateDisplayName", () => {
  it("updates only the display_name field and returns the new row", async () => {
    const updated = { ...profileRow, display_name: "Grace" };
    const fake = makeClient({ update: { data: updated, error: null } });

    const result = await updateDisplayName(fake.client, "user-1", "Grace");

    expect(result).toEqual({ profile: updated, error: null });
    expect(fake.update).toHaveBeenCalledWith({ display_name: "Grace" });
  });

  it("surfaces a column-grant failure instead of claiming success", async () => {
    const fake = makeClient({
      update: { data: null, error: pgError("42501") },
    });

    const result = await updateDisplayName(fake.client, "user-1", "Grace");

    expect(result.profile).toBeNull();
    expect(result.error).toBe("Your account is not allowed to change that profile.");
  });
});

describe("mapProfileError", () => {
  it("maps the display-name constraint to its documented range", () => {
    expect(mapProfileError(pgError("23514"))).toContain("2-60 characters");
  });

  it("maps an unknown failure without exposing the raw database message", () => {
    const message = mapProfileError(pgError("XX000", "internal detail"));

    expect(message).toBe("Could not load your profile from Supabase. Please try again.");
    expect(message).not.toContain("internal detail");
  });
});
