import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** One message in a listing conversation. */
export type ListingMessage = {
  id: string;
  listing_id: string;
  /** Thread key: the student who opened the conversation. */
  student_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** When the other participant read it; null until then. */
  read_at: string | null;
  /** Set when the message carries a property card. */
  shared_listing_id: string | null;
  /** Object path in the private chat-media bucket, null for text-only. */
  image_path: string | null;
  /** Set when the sender rewrote the text; drives the "Edited" label. */
  edited_at: string | null;
  /** Set when the sender withdrew the message for everyone. */
  deleted_at: string | null;
};

/** Who the student is talking to on the other side of a room conversation. */
export type ListingChatPeerKind = "landlord" | "agent";

/** One conversation in a student's inbox. */
export type StudentListingChatThread = {
  listing_id: string;
  listing_title: string;
  provider_name: string;
  /** Agents and landlords share the inbox but filter separately. */
  provider_kind: ListingChatPeerKind;
  last_body: string;
  last_message_at: string;
  unread_count: number;
};

/** One conversation in a provider's inbox. */
export type ListingChatThread = {
  listing_id: string;
  listing_title: string;
  student_id: string;
  student_name: string;
  last_body: string;
  last_message_at: string;
  unread_count: number;
};

export const LISTING_MESSAGE_MAX_LENGTH = 1000;

const MESSAGE_COLUMNS =
  "id, listing_id, student_id, sender_id, body, created_at, read_at, shared_listing_id, image_path, edited_at, deleted_at";

export function mapListingMessageError(error: PostgrestError): string {
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202"
  ) {
    return "Listing chat is not available yet. Apply the listing chat migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to message this lister.";
  }
  return "Could not load this conversation. Please try again.";
}

export function mapSendListingMessageError(error: PostgrestError): string {
  if (error.code === "23514") {
    return `Keep your message to ${LISTING_MESSAGE_MAX_LENGTH} characters or fewer.`;
  }
  if (error.code === "42501") {
    return "You can no longer message this lister.";
  }
  return "Could not send that message. Please try again.";
}

/** Every message in one student's thread on a listing, oldest first. */
export async function loadListingMessages(
  client: TypedSupabaseClient,
  { listingId, studentId }: { listingId: string; studentId: string },
): Promise<{ messages: ListingMessage[]; error: string | null }> {
  const { data, error } = await client
    .from("listing_messages")
    .select(MESSAGE_COLUMNS)
    .eq("listing_id", listingId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) {
    return { messages: [], error: mapListingMessageError(error) };
  }
  return { messages: data ?? [], error: null };
}

/**
 * Stamps the messages the caller received in this thread as read, so the sender
 * sees "Seen". RLS only matches rows the caller did not send, so a failure never
 * blocks the conversation.
 */
export async function markListingMessagesRead(
  client: TypedSupabaseClient,
  input: { listingId: string; studentId: string; readerId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("listing_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("listing_id", input.listingId)
    .eq("student_id", input.studentId)
    .neq("sender_id", input.readerId)
    .is("read_at", null);

  return { error: error ? mapListingMessageError(error) : null };
}

export async function sendListingMessage(
  client: TypedSupabaseClient,
  input: {
    listingId: string;
    /** Thread key: the student who opened the conversation. */
    studentId: string;
    senderId: string;
    body: string;
    sharedListingId?: string | null;
    imagePath?: string | null;
  },
): Promise<{ message: ListingMessage | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) {
    return { message: null, error: "Write a message first." };
  }
  if (body.length > LISTING_MESSAGE_MAX_LENGTH) {
    return {
      message: null,
      error: `Keep your message to ${LISTING_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const { data, error } = await client
    .from("listing_messages")
    .insert({
      listing_id: input.listingId,
      student_id: input.studentId,
      sender_id: input.senderId,
      body,
      shared_listing_id: input.sharedListingId ?? null,
      image_path: input.imagePath ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    return { message: null, error: mapSendListingMessageError(error) };
  }
  return { message: data, error: null };
}

/**
 * The caller's inbox as a provider: one row per student thread across their
 * listings, newest first. The RPC is the only path to the student's name —
 * public.profiles stays private to its owner.
 */
export async function loadListingChatThreads(
  client: TypedSupabaseClient,
): Promise<{ threads: ListingChatThread[]; error: string | null }> {
  const { data, error } = await client.rpc("listing_chat_threads");

  if (error) {
    return { threads: [], error: mapListingMessageError(error) };
  }

  return {
    threads: (data ?? []).map((row) => ({
      listing_id: row.listing_id,
      listing_title: row.listing_title,
      student_id: row.student_id,
      student_name: row.student_name.trim() || "Student",
      last_body: row.last_body,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count,
    })),
    error: null,
  };
}

/**
 * The caller's own room conversations, newest first — the Rooms section of the
 * messages inbox. Same RPC-backed shape as the provider side, without any other
 * student's thread.
 */
export async function loadStudentListingChatThreads(
  client: TypedSupabaseClient,
): Promise<{ threads: StudentListingChatThread[]; error: string | null }> {
  const { data, error } = await client.rpc("listing_chat_threads_for_student");

  if (error) {
    return { threads: [], error: mapListingMessageError(error) };
  }

  return {
    threads: (data ?? []).map((row) => ({
      listing_id: row.listing_id,
      listing_title: row.listing_title,
      provider_name: row.provider_name.trim() || "The lister",
      provider_kind: row.provider_kind,
      last_body: row.last_body,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count,
    })),
    error: null,
  };
}
