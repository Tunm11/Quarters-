import type { PostgrestError } from "@supabase/supabase-js";
import type { RoommateMessage } from "@/roommates/roommate-detail";
import type { TypedSupabaseClient } from "@/lib/supabase";

export const SHARED_LISTING_SELECT =
  "id, sender_id, body, created_at, read_at, shared_listing_id, shared_listing_ids, image_path, edited_at, deleted_at";

/** A shared shortlist travels as one message; the database caps it at 12 rooms. */
export const SHORTLIST_SHARE_MAX = 12;

export function mapListingShareError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") {
    return "Sending rooms to a roommate is not enabled on this database yet. Apply the shared-listing migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to send this room to your roommate.";
  }
  return "Could not send this room. Please try again.";
}

export function mapShortlistShareError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") {
    return "Sharing a shortlist is not enabled on this database yet. Apply the shortlist-sharing migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Sign in to share your shortlist with a roommate.";
  }
  if (error.code === "23514") {
    return `A shared shortlist holds up to ${SHORTLIST_SHARE_MAX} rooms.`;
  }
  return "Could not share this shortlist. Please try again.";
}

/**
 * Posts the whole shortlist into a roommate thread as one message. The body
 * describes what was sent so the message still reads sensibly wherever the
 * attached rooms are ignored, and `shared_listing_ids` carries the rooms in the
 * order they were saved.
 */
export async function sendShortlistToRoommate(
  client: TypedSupabaseClient,
  input: {
    profileId: string;
    /** Thread key: the student who opened the conversation. */
    studentId: string;
    senderId: string;
    listingIds: string[];
    /** The collection that was open when it was sent, if it was one. */
    collectionName?: string | null;
  },
): Promise<{ message: RoommateMessage | null; error: string | null }> {
  const listingIds = [...new Set(input.listingIds.filter(Boolean))].slice(
    0,
    SHORTLIST_SHARE_MAX,
  );
  if (listingIds.length === 0) {
    return { message: null, error: "Save a room before you share a shortlist." };
  }

  const count = `${listingIds.length} ${
    listingIds.length === 1 ? "room" : "rooms"
  }`;
  const name = input.collectionName?.trim().slice(0, 60);

  const { data, error } = await client
    .from("roommate_messages")
    .insert({
      profile_id: input.profileId,
      student_id: input.studentId,
      sender_id: input.senderId,
      body: name
        ? `My shortlist "${name}" — ${count} to look at.`
        : `My shortlist — ${count} to compare.`,
      shared_listing_ids: listingIds,
    })
    .select(SHARED_LISTING_SELECT)
    .single();

  if (error) {
    return { message: null, error: mapShortlistShareError(error) };
  }
  return { message: data, error: null };
}

export function mapGroupVisitError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Group visits are not enabled on this database yet. Apply the shared-listing migration.";
  }
  if (error.code === "42703") {
    return "Group visits with three or more people are not enabled on this database yet. Apply the group-visit roster migration.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "You can only plan a group visit with roommates you already talk to.";
  }
  return "Could not ask for a group visit. Please try again.";
}

/**
 * Posts a property card into a roommate thread. The body carries a short line
 * so the message still reads sensibly anywhere that ignores the card, while
 * `shared_listing_id` lets the chat render the photo and the group-visit action.
 */
export async function sendListingToRoommate(
  client: TypedSupabaseClient,
  input: {
    profileId: string;
    /** Thread key: the student who opened the conversation. */
    studentId: string;
    senderId: string;
    listingId: string;
    listingTitle: string;
  },
): Promise<{ message: RoommateMessage | null; error: string | null }> {
  const title = input.listingTitle.trim().slice(0, 200) || "this room";

  const { data, error } = await client
    .from("roommate_messages")
    .insert({
      profile_id: input.profileId,
      student_id: input.studentId,
      sender_id: input.senderId,
      body: `Have a look at ${title}.`,
      shared_listing_id: input.listingId,
    })
    .select(SHARED_LISTING_SELECT)
    .single();

  if (error) {
    return { message: null, error: mapListingShareError(error) };
  }
  return { message: data, error: null };
}

/**
 * The visit the caller is already part of for this property: how many people
 * they asked to bring, or null when nobody has asked. A roster visit names the
 * caller in `member_ids`; older pair requests are backfilled with both accounts
 * where the roommate has one.
 */
export async function loadMyGroupVisit(
  client: TypedSupabaseClient,
  input: { listingId: string; viewerId: string },
): Promise<{ partySize: number | null; error: string | null }> {
  const { data, error } = await client
    .from("listing_group_visits")
    .select("id, member_ids")
    .eq("listing_id", input.listingId)
    .contains("member_ids", [input.viewerId])
    .limit(1)
    .maybeSingle();

  if (error) {
    return { partySize: null, error: mapGroupVisitError(error) };
  }
  if (!data) {
    return { partySize: null, error: null };
  }
  // Every roster has at least the student and one roommate.
  return {
    partySize: Math.max(data.member_ids.length, 2),
    error: null,
  };
}

/**
 * Asks the lister to host the whole party — the caller and every roommate they
 * picked — at one viewing. The database allows any number of people, provided
 * the caller asked and everyone invited is someone they already talk to. Asking
 * again for the same room is a no-op rather than an error.
 */
export async function planGroupVisit(
  client: TypedSupabaseClient,
  input: { listingId: string; viewerId: string; memberIds: string[] },
): Promise<{ partySize: number | null; error: string | null }> {
  const party = [...new Set([input.viewerId, ...input.memberIds].filter(Boolean))];
  if (party.length < 2) {
    return {
      partySize: null,
      error: "Choose at least one roommate to visit with.",
    };
  }

  const { error } = await client.from("listing_group_visits").insert({
    listing_id: input.listingId,
    requested_by: input.viewerId,
    member_ids: party,
  });

  if (!error) {
    return { partySize: party.length, error: null };
  }
  // One roster request per student per property.
  if (error.code === "23505") {
    return { partySize: party.length, error: null };
  }
  return { partySize: null, error: mapGroupVisitError(error) };
}
