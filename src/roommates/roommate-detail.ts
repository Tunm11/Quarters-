import type { PostgrestError } from "@supabase/supabase-js";
import {
  ROOMMATE_COLUMNS,
  mapRoommateProfilesError,
  withAvatarUrls,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";
import type { RoommateInterestRow, RoommateMessageRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase";

export type RoommateInterestSummary = Pick<
  RoommateInterestRow,
  "id" | "status" | "created_at"
>;

export type RoommateMessage = Pick<
  RoommateMessageRow,
  | "id"
  | "sender_id"
  | "body"
  | "created_at"
  | "read_at"
  | "shared_listing_id"
  | "shared_listing_ids"
  | "image_path"
  | "edited_at"
  | "deleted_at"
>;

const MESSAGE_COLUMNS =
  "id, sender_id, body, created_at, read_at, shared_listing_id, shared_listing_ids, image_path, edited_at, deleted_at";

export const MESSAGE_MAX_LENGTH = 1000;

/**
 * Loads one discoverable roommate profile for the detail screen.
 *
 * RLS decides visibility: a hidden profile resolves to no row and the screen
 * reports it as unavailable.
 */
export async function loadRoommateProfile(
  client: TypedSupabaseClient,
  profileId: string,
): Promise<{ profile: RoommateProfile | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_profiles")
    .select(ROOMMATE_COLUMNS)
    .eq("id", profileId)
    .eq("is_discoverable", true)
    .maybeSingle();

  if (error) {
    return { profile: null, error: mapRoommateProfilesError(error as PostgrestError) };
  }
  if (!data) {
    return { profile: null, error: null };
  }

  const [profile] = await withAvatarUrls(client, [data]);
  return { profile: profile ?? null, error: null };
}

function isMissingTable(error: PostgrestError): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

/** The database refuses writes between a blocked pair with a 42501. */
function isBlockRefusal(error: PostgrestError): boolean {
  return /because of a block/i.test(error.message ?? "");
}

export function mapInterestError(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return "Sending interest is not enabled on this database yet. The roommate migration has not been applied.";
  }
  if (error.code === "23505") {
    return "You have already sent interest to this roommate.";
  }
  if (isBlockRefusal(error)) {
    return "You cannot send interest to this student while either of you has a block in place.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to send interest.";
  }
  if (error.code === "23503") {
    return "This profile is no longer available.";
  }
  return "Could not send your interest. Please try again.";
}

export function mapInterestWithdrawalError(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return "Cancelling interest is not enabled on this database yet. The roommate migration has not been applied.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to cancel your interest.";
  }
  return "Could not cancel your interest. Please try again.";
}

export function mapReadReceiptError(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return "Read receipts are not enabled on this database yet. The roommate migration has not been applied.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to see read receipts.";
  }
  return "Could not record that these messages were read.";
}

export function mapMessageError(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return "Chat is not enabled on this database yet. The roommate migration has not been applied.";
  }
  if (isBlockRefusal(error)) {
    return "You cannot message this student while either of you has a block in place.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to chat.";
  }
  if (error.code === "23514") {
    return `Keep your message between 1 and ${MESSAGE_MAX_LENGTH} characters.`;
  }
  return "Could not send your message. Please try again.";
}

/**
 * The caller's own interest in this profile, if any. RLS returns only rows the
 * caller sent, so no sender filter is needed.
 */
export async function loadMyInterest(
  client: TypedSupabaseClient,
  profileId: string,
): Promise<{ interest: RoommateInterestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_interests")
    .select("id, status, created_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    return { interest: null, error: mapInterestError(error) };
  }
  return { interest: data ?? null, error: null };
}

export async function sendRoommateInterest(
  client: TypedSupabaseClient,
  profileId: string,
  senderId: string,
): Promise<{ interest: RoommateInterestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_interests")
    .insert({ profile_id: profileId, sender_id: senderId })
    .select("id, status, created_at")
    .single();

  if (!error) {
    return { interest: data, error: null };
  }

  // One interest per student per profile: if the existing row was withdrawn,
  // re-open it instead of telling the student they already asked.
  if (error.code === "23505") {
    const { data: reopened, error: reopenError } = await client
      .from("roommate_interests")
      .update({ status: "pending" })
      .eq("profile_id", profileId)
      .eq("sender_id", senderId)
      .eq("status", "withdrawn")
      .select("id, status, created_at")
      .maybeSingle();

    if (reopenError) {
      return { interest: null, error: mapInterestError(reopenError as PostgrestError) };
    }
    if (reopened) {
      return { interest: reopened, error: null };
    }
  }

  return { interest: null, error: mapInterestError(error) };
}

/**
 * Withdraws the caller's own pending interest. A decided interest (accepted or
 * declined) is not cancellable here: RLS only lets the sender write
 * 'withdrawn' over a 'pending' row, so an accepted connection stays intact.
 */
export async function withdrawRoommateInterest(
  client: TypedSupabaseClient,
  interestId: string,
): Promise<{ interest: RoommateInterestSummary | null; error: string | null }> {
  const { data, error } = await client
    .from("roommate_interests")
    .update({ status: "withdrawn" })
    .eq("id", interestId)
    .eq("status", "pending")
    .select("id, status, created_at")
    .maybeSingle();

  if (error) {
    return { interest: null, error: mapInterestWithdrawalError(error) };
  }
  if (!data) {
    return {
      interest: null,
      error: "This interest is already answered, so it can no longer be cancelled.",
    };
  }
  return { interest: data, error: null };
}

/** Messages the caller can see for this profile (their thread, or their own profile). */
export async function loadRoommateMessages(
  client: TypedSupabaseClient,
  profileId: string,
): Promise<{ messages: RoommateMessage[]; error: string | null }> {
  const { data, error } = await client
    .from("roommate_messages")
    .select(MESSAGE_COLUMNS)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (error) {
    return { messages: [], error: mapMessageError(error) };
  }
  return { messages: data ?? [], error: null };
}

/**
 * Stamps the messages the caller received in this thread as read, so the sender
 * can see "Seen". RLS only matches rows the caller did not send. Called when the
 * chat opens or regains focus; a failure never blocks the conversation.
 */
export async function markRoommateMessagesRead(
  client: TypedSupabaseClient,
  profileId: string,
  readerId: string,
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("roommate_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .neq("sender_id", readerId)
    .is("read_at", null);

  return { error: error ? mapReadReceiptError(error) : null };
}

export async function sendRoommateMessage(
  client: TypedSupabaseClient,
  input: {
    profileId: string;
    /** Thread key: the student who opened the conversation. */
    studentId: string;
    senderId: string;
    body: string;
    sharedListingId?: string | null;
    imagePath?: string | null;
  },
): Promise<{ message: RoommateMessage | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) {
    return { message: null, error: "Write a message first." };
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    return {
      message: null,
      error: `Keep your message to ${MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const { data, error } = await client
    .from("roommate_messages")
    .insert({
      profile_id: input.profileId,
      student_id: input.studentId,
      sender_id: input.senderId,
      body,
      shared_listing_id: input.sharedListingId ?? null,
      image_path: input.imagePath ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    return { message: null, error: mapMessageError(error) };
  }
  return { message: data, error: null };
}
