import type { PostgrestError } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** Who a contact is, so the picker can label them the way the inbox does. */
export type ChatContactKind = "roommate" | "agent" | "landlord" | "student";

/** Someone the viewer has already talked to, and may add to a group. */
export type ChatContact = {
  user_id: string;
  display_name: string;
  kind: ChatContactKind;
};

/** One group in the messages inbox. */
export type ChatGroupSummary = {
  group_id: string;
  name: string;
  created_by: string;
  /** Empty until the group's first message. */
  last_body: string;
  last_message_at: string | null;
  unread_count: number;
  member_names: string;
  member_count: number;
  /** Object path in the private chat-media bucket, null when the group has no picture. */
  avatar_path: string | null;
};

/** One group member's read cursor, for per-member receipts. */
export type ChatGroupReader = {
  user_id: string;
  display_name: string;
  last_read_at: string;
};

/** One member in the group management sheet. */
export type ChatGroupMember = {
  user_id: string;
  display_name: string;
  joined_at: string;
  is_creator: boolean;
  /**
   * The member's roommate profile, so the sheet can offer report and block for
   * that person. Null for a member who never created one.
   */
  roommate_profile_id: string | null;
};

/** One group message, with the sender's name for the bubble label. */
export type ChatGroupMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  /** Set when the message carries a property card. */
  shared_listing_id: string | null;
  /** Object path in the private chat-media bucket, null for text-only. */
  image_path: string | null;
  /** Set when the sender rewrote the text; drives the "Edited" label. */
  edited_at: string | null;
  /** Set when the sender withdrew the message for everyone. */
  deleted_at: string | null;
};

export const GROUP_MESSAGE_MAX_LENGTH = 1000;
export const GROUP_NAME_MAX_LENGTH = 60;
/** A group is the creator plus at least this many other people. */
export const GROUP_MIN_MEMBERS = 2;

const MESSAGE_COLUMNS =
  "id, group_id, sender_id, body, created_at, shared_listing_id, image_path, edited_at, deleted_at";

export function mapGroupError(error: PostgrestError): string {
  if (error.code === "22023") {
    return error.message || "Check the group details and try again.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to use group chat.";
  }
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202"
  ) {
    return "Group chat is not available yet. Apply the group chat migration.";
  }
  return "Could not load this group. Please try again.";
}

function mapManagementError(error: PostgrestError): string {
  if (error.code === "42501") {
    return error.message || "Only the group creator can do that.";
  }
  if (error.code === "22023") {
    return error.message || "Check the group details and try again.";
  }
  if (error.code === "42883" || error.code === "PGRST202") {
    return "Group management is not enabled yet. Apply the group management migration.";
  }
  return mapGroupError(error);
}

export function mapSendGroupMessageError(error: PostgrestError): string {
  if (error.code === "23514") {
    return `Keep your message to ${GROUP_MESSAGE_MAX_LENGTH} characters or fewer.`;
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "You are no longer in this group.";
  }
  return "Could not send your message. Please try again.";
}

/** The contact picker's source: everyone with an existing conversation. */
export async function loadChatContacts(
  client: TypedSupabaseClient,
): Promise<{ contacts: ChatContact[]; error: string | null }> {
  const { data, error } = await client.rpc("chat_contacts");

  if (error) {
    return { contacts: [], error: mapGroupError(error) };
  }

  return {
    contacts: (data ?? []).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name.trim() || "Someone you talked to",
      kind: row.kind as ChatContactKind,
    })),
    error: null,
  };
}

/** Creates the group and its membership in one call. */
export async function createChatGroup(
  client: TypedSupabaseClient,
  { name, memberIds }: { name: string; memberIds: string[] },
): Promise<{ groupId: string | null; error: string | null }> {
  const unique = [...new Set(memberIds)];
  if (unique.length < GROUP_MIN_MEMBERS) {
    return {
      groupId: null,
      error: `Add at least ${GROUP_MIN_MEMBERS} people to start a group.`,
    };
  }

  const { data, error } = await client.rpc("create_chat_group", {
    p_name: name.trim().slice(0, GROUP_NAME_MAX_LENGTH) || "New group",
    p_member_ids: unique,
  });

  if (error) {
    return { groupId: null, error: mapGroupError(error) };
  }

  return { groupId: data ?? null, error: null };
}

/** The viewer's groups, newest activity first. */
export async function loadChatGroups(
  client: TypedSupabaseClient,
): Promise<{ groups: ChatGroupSummary[]; error: string | null }> {
  const { data, error } = await client.rpc("chat_groups_for_me");

  if (error) {
    return { groups: [], error: mapGroupError(error) };
  }

  return {
    groups: (data ?? []).map((row) => ({
      group_id: row.group_id,
      name: row.name,
      created_by: row.created_by,
      last_body: row.last_body,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count,
      member_names: row.member_names,
      member_count: row.member_count,
      avatar_path: row.avatar_path,
    })),
    error: null,
  };
}

/** One group convo, oldest first. RLS hides groups the caller is not in. */
export async function loadGroupMessages(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ messages: ChatGroupMessage[]; error: string | null }> {
  const { data, error } = await client.rpc("chat_group_thread", {
    p_group_id: groupId,
  });

  if (error) {
    return { messages: [], error: mapGroupError(error) };
  }

  return {
    messages: (data ?? []).map((row) => ({
      id: row.id,
      sender_id: row.sender_id,
      sender_name: row.sender_name.trim() || "Member",
      body: row.body,
      created_at: row.created_at,
      shared_listing_id: row.shared_listing_id,
      image_path: row.image_path,
      edited_at: row.edited_at,
      deleted_at: row.deleted_at,
    })),
    error: null,
  };
}

export async function sendGroupMessage(
  client: TypedSupabaseClient,
  {
    groupId,
    senderId,
    body,
    sharedListingId = null,
    imagePath = null,
  }: {
    groupId: string;
    senderId: string;
    body: string;
    sharedListingId?: string | null;
    imagePath?: string | null;
  },
): Promise<{ message: ChatGroupMessage | null; error: string | null }> {
  const { data, error } = await client
    .from("chat_group_messages")
    .insert({
      group_id: groupId,
      sender_id: senderId,
      body: body.trim(),
      shared_listing_id: sharedListingId,
      image_path: imagePath,
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    return { message: null, error: mapSendGroupMessageError(error) };
  }

  return {
    message: {
      id: data.id,
      sender_id: data.sender_id,
      sender_name: "You",
      body: data.body,
      created_at: data.created_at,
      shared_listing_id: data.shared_listing_id,
      image_path: data.image_path,
      edited_at: data.edited_at,
      deleted_at: data.deleted_at,
    },
    error: null,
  };
}

/**
 * Moves the viewer's read cursor to now, which clears the group's unread badge.
 * Every member keeps their own cursor, so this never affects anyone else.
 */
export async function markGroupMessagesRead(
  client: TypedSupabaseClient,
  { groupId, userId }: { groupId: string; userId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("chat_group_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    return { error: mapGroupError(error) };
  }

  return { error: null };
}

/** Members of a group the viewer belongs to, earliest first. */
export async function loadChatGroupMembers(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ members: ChatGroupMember[]; error: string | null }> {
  const { data, error } = await client.rpc("chat_group_members_for_me", {
    p_group_id: groupId,
  });

  if (error) {
    return { members: [], error: mapManagementError(error) };
  }

  return {
    members: (data ?? []).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name.trim() || "Member",
      joined_at: row.joined_at,
      is_creator: row.is_creator,
      roommate_profile_id: row.roommate_profile_id ?? null,
    })),
    error: null,
  };
}

export async function addChatGroupMember(
  client: TypedSupabaseClient,
  { groupId, userId }: { groupId: string; userId: string },
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("add_chat_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  return { error: error ? mapManagementError(error) : null };
}

export async function removeChatGroupMember(
  client: TypedSupabaseClient,
  { groupId, userId }: { groupId: string; userId: string },
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("remove_chat_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  return { error: error ? mapManagementError(error) : null };
}

/** Leaves the group; ownership passes to the next member, or it is deleted. */
export async function leaveChatGroup(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("leave_chat_group", { p_group_id: groupId });
  return { error: error ? mapManagementError(error) : null };
}

export async function renameChatGroup(
  client: TypedSupabaseClient,
  { groupId, name }: { groupId: string; name: string },
): Promise<{ error: string | null }> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > GROUP_NAME_MAX_LENGTH) {
    return { error: `Keep the name to 1–${GROUP_NAME_MAX_LENGTH} characters.` };
  }

  const { error } = await client.rpc("rename_chat_group", {
    p_group_id: groupId,
    p_name: trimmed,
  });
  return { error: error ? mapManagementError(error) : null };
}

/** Sets or clears the group picture; the path must be in this group's folder. */
export async function setChatGroupAvatar(
  client: TypedSupabaseClient,
  { groupId, path }: { groupId: string; path: string | null },
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("set_chat_group_avatar", {
    p_group_id: groupId,
    p_path: path,
  });
  return { error: error ? mapManagementError(error) : null };
}

/** The other members' read cursors; used to label your own messages. */
export async function loadChatGroupReaders(
  client: TypedSupabaseClient,
  groupId: string,
): Promise<{ readers: ChatGroupReader[]; error: string | null }> {
  const { data, error } = await client.rpc("chat_group_readers", {
    p_group_id: groupId,
  });

  if (error) {
    return { readers: [], error: mapGroupError(error) };
  }

  return {
    readers: (data ?? []).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name.trim() || "Member",
      last_read_at: row.last_read_at,
    })),
    error: null,
  };
}

/** Members whose read cursor has passed this message. */
export function readersForMessage(
  readers: ChatGroupReader[],
  message: { created_at: string },
): ChatGroupReader[] {
  const sentAt = new Date(message.created_at).getTime();
  return readers.filter(
    (reader) => new Date(reader.last_read_at).getTime() >= sentAt,
  );
}

/** "Sent", "Seen by Ada" or "Seen by Ada, Bode +2" for one own message. */
export function readReceiptLabel(names: string[]): string {
  if (names.length === 0) return "Sent";
  if (names.length === 1) return `Seen by ${names[0]}`;
  if (names.length === 2) return `Seen by ${names[0]} and ${names[1]}`;
  return `Seen by ${names[0]}, ${names[1]} +${names.length - 2}`;
}

/** A readable default so an unnamed group is not titled after the creator. */
export function defaultGroupName(names: string[]): string {
  const trimmed = names.map((name) => name.trim()).filter(Boolean);
  if (trimmed.length === 0) return "New group";
  if (trimmed.length <= 2) return trimmed.join(" & ");
  return `${trimmed[0]}, ${trimmed[1]} & ${trimmed.length - 2} more`;
}
