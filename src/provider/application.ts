import type { PostgrestError } from "@supabase/supabase-js";
import type { ProviderRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Provider application data access.
 *
 * The database is the authority here:
 *   * providers.status defaults to 'pending' and is forced to 'pending' by the
 *     insert policy;
 *   * clients have no INSERT grant for 'approved', 'rejected' or 'suspended';
 *   * clients have no UPDATE or DELETE grant on providers at all.
 *
 * This module never accepts a status from its caller. It always writes
 * 'pending' and lets provider_reviews drive every later decision.
 */

export const PROVIDER_KINDS = ["landlord", "agent"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type ProviderStatus = ProviderRow["status"];

/** The applicant-facing columns the client is allowed to read. */
export type ProviderApplication = Pick<
  ProviderRow,
  "id" | "kind" | "display_name" | "status" | "created_at" | "updated_at"
>;

export type ProviderReviewSummary = {
  id: number;
  decision: Exclude<ProviderStatus, "pending">;
  provider_note: string | null;
  reviewed_at: string;
};

export const PROVIDER_NAME_MIN = 2;
export const PROVIDER_NAME_MAX = 80;

export const PROVIDER_TABLES_MIGRATION_MESSAGE =
  "The provider tables are not available. The Phase 2B provider-authorisation migration may not be applied to this Supabase project.";

export const PROVIDER_LOOKUP_MIGRATION_MESSAGE =
  "Provider status lookup is not available yet. Apply the 20261024090000_add_current_provider_application migration to this Supabase project, then try again.";

export function isProviderKind(value: unknown): value is ProviderKind {
  return value === "landlord" || value === "agent";
}

/** Matches the providers_display_name_length constraint (2–80 after trim). */
export function validateProviderDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Enter your name or business name.";
  }
  if (trimmed.length < PROVIDER_NAME_MIN) {
    return "Use at least 2 characters.";
  }
  if (trimmed.length > PROVIDER_NAME_MAX) {
    return `Use ${PROVIDER_NAME_MAX} characters or fewer.`;
  }
  return null;
}

export function isMissingProvidersTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

export function isMissingProviderLookup(error: { code?: string }): boolean {
  return error.code === "42883" || error.code === "PGRST202";
}

export function mapProviderError(error: PostgrestError): string {
  if (isMissingProvidersTable(error)) {
    return PROVIDER_TABLES_MIGRATION_MESSAGE;
  }
  if (error.code === "23505") {
    return "You already have a provider application. Reload to see its current status.";
  }
  if (error.code === "23514") {
    return `That provider name does not meet the database rules (${PROVIDER_NAME_MIN}–${PROVIDER_NAME_MAX} characters).`;
  }
  if (error.code === "23503") {
    return "That account could not be linked to a provider application. Sign out and back in, then try again.";
  }
  if (error.code === "42501") {
    return "Your account is not allowed to submit a provider application. Make sure you are signed in and the provider policies are applied.";
  }
  return "Could not submit your provider application. Please try again.";
}

export function mapProviderLookupError(error: PostgrestError): string {
  if (isMissingProviderLookup(error)) {
    return PROVIDER_LOOKUP_MIGRATION_MESSAGE;
  }
  if (isMissingProvidersTable(error)) {
    return PROVIDER_TABLES_MIGRATION_MESSAGE;
  }
  return "Could not check your provider application. Please try again.";
}

export type SubmitProviderApplicationInput = {
  ownerId: string;
  kind: ProviderKind;
  displayName: string;
};

export type SubmitProviderApplicationResult =
  | { ok: true; application: ProviderApplication }
  | { ok: false; error: string; duplicate: boolean };

/**
 * Creates the signed-in user's own application. The caller supplies the owner
 * id, which the insert policy checks against auth.uid(); the status is always
 * 'pending' here and in the policy.
 */
export async function submitProviderApplication(
  client: TypedSupabaseClient,
  input: SubmitProviderApplicationInput,
): Promise<SubmitProviderApplicationResult> {
  const displayName = input.displayName.trim();
  const nameError = validateProviderDisplayName(displayName);
  if (nameError) {
    return { ok: false, error: nameError, duplicate: false };
  }
  if (!isProviderKind(input.kind)) {
    return {
      ok: false,
      error: "Choose whether you are applying as a landlord or an agent.",
      duplicate: false,
    };
  }

  const { data, error } = await client
    .from("providers")
    .insert({
      owner_id: input.ownerId,
      kind: input.kind,
      display_name: displayName,
      status: "pending",
    })
    .select("id, kind, display_name, status, created_at, updated_at")
    .single();

  if (error) {
    return {
      ok: false,
      error: mapProviderError(error),
      duplicate: error.code === "23505",
    };
  }
  if (!data) {
    return {
      ok: false,
      error: "Supabase did not return the new provider application.",
      duplicate: false,
    };
  }

  return { ok: true, application: data };
}

export type LoadProviderApplicationResult = {
  application: ProviderApplication | null;
  error: string | null;
};

/**
 * Reads the caller's own application through the checked database function.
 * The table API cannot filter on owner_id because that column is intentionally
 * not granted to the client.
 */
export async function loadProviderApplication(
  client: TypedSupabaseClient,
): Promise<LoadProviderApplicationResult> {
  const { data, error } = await client
    .rpc("current_provider_application")
    .maybeSingle();

  if (error) {
    return { application: null, error: mapProviderLookupError(error) };
  }
  return { application: data ?? null, error: null };
}

export type LoadProviderReviewResult = {
  review: ProviderReviewSummary | null;
  error: string | null;
};

/**
 * The latest provider-facing review note. Only the provider-facing columns are
 * selected; internal notes, evidence and reviewer identity are not granted.
 */
export async function loadLatestProviderReview(
  client: TypedSupabaseClient,
  providerId: string,
): Promise<LoadProviderReviewResult> {
  const { data, error } = await client
    .from("provider_reviews")
    .select("id, decision, provider_note, reviewed_at")
    .eq("provider_id", providerId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { review: null, error: "Your latest review note could not be loaded." };
  }
  if (!data) {
    return { review: null, error: null };
  }

  const decision = data.decision;
  if (decision === "pending") {
    return { review: null, error: null };
  }

  return {
    review: {
      id: data.id,
      decision,
      provider_note: data.provider_note,
      reviewed_at: data.reviewed_at,
    },
    error: null,
  };
}
