import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** Which chat surface a message belongs to; the RPCs branch on this. */
export type ChatMessageKind = "room" | "roommate" | "group";

export const CHAT_MESSAGE_MAX_LENGTH = 1000;

export function mapMessageActionError(error: PostgrestError): string {
  if (error.code === "42501") {
    return error.message || "You cannot change this message.";
  }
  if (error.code === "22023") {
    return error.message || "Check the message and try again.";
  }
  if (error.code === "42883" || error.code === "PGRST202") {
    return "Message tools are not enabled yet. Apply the message management migration.";
  }
  return "Could not update this message. Please try again.";
}

/**
 * Rewrites the text of the caller's own message. The server re-checks authorship,
 * that the message is still live, and the 1–1000 character window.
 */
export async function editChatMessage(
  client: TypedSupabaseClient,
  {
    kind,
    messageId,
    body,
  }: { kind: ChatMessageKind; messageId: string; body: string },
): Promise<{ error: string | null }> {
  const trimmed = body.trim();
  if (trimmed.length < 1) {
    return { error: "Write something before saving." };
  }
  if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
    return {
      error: `Keep the message to ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const { error } = await client.rpc("edit_chat_message", {
    p_kind: kind,
    p_message_id: messageId,
    p_body: trimmed,
  });

  return { error: error ? mapMessageActionError(error) : null };
}

/**
 * Withdraws the caller's own message for the whole thread: the text becomes a
 * placeholder and any photo or shared card stops rendering.
 */
export async function deleteChatMessageForEveryone(
  client: TypedSupabaseClient,
  { kind, messageId }: { kind: ChatMessageKind; messageId: string },
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("delete_chat_message_for_everyone", {
    p_kind: kind,
    p_message_id: messageId,
  });

  return { error: error ? mapMessageActionError(error) : null };
}

/**
 * Removes a message from the caller's own view. Everyone else keeps theirs; the
 * server filters hidden rows out of later reads.
 */
export async function hideChatMessage(
  client: TypedSupabaseClient,
  { kind, messageId }: { kind: ChatMessageKind; messageId: string },
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("hide_chat_message", {
    p_kind: kind,
    p_message_id: messageId,
  });

  return { error: error ? mapMessageActionError(error) : null };
}

/** A message is editable only before it is withdrawn. */
export function canEditMessage({
  mine,
  deleted,
}: {
  mine: boolean;
  deleted: boolean;
}): boolean {
  return mine && !deleted;
}
