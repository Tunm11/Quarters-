import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Unread messages across every chat surface: roommate threads, room (listing)
 * threads and groups. RLS already limits each table to conversations the caller
 * is part of, so the counts never include anyone else's messages.
 *
 * A message counts as unread when the caller did not send it and the recipient
 * has not opened the thread since it arrived — the same `read_at` that drives the
 * "Seen" receipt. A group keeps only a per-member read cursor, so its unread
 * count comes from chat_groups_for_me().
 */
export async function countUnreadMessages(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ count: number; error: boolean }> {
  const [roommate, listing, groups] = await Promise.all([
    client
      .from("roommate_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", userId)
      .is("read_at", null),
    client
      .from("listing_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", userId)
      .is("read_at", null),
    client.rpc("chat_groups_for_me"),
  ]);

  if (roommate.error && listing.error) {
    return { count: 0, error: true };
  }

  // A missing groups RPC (migration not applied yet) must not break the badge
  // for the surfaces that do work.
  const groupUnread = (groups.data ?? []).reduce(
    (total, group) => total + (group.unread_count ?? 0),
    0,
  );

  return {
    count: (roommate.count ?? 0) + (listing.count ?? 0) + groupUnread,
    error: false,
  };
}
