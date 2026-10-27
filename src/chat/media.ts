import { cachedSignedUrls } from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";

/** Which conversation an attachment belongs to; also names its storage folder. */
export type ChatMediaKind =
  | "room"
  | "group"
  | "roommate"
  | "group-avatar";

export const CHAT_MEDIA_BUCKET = "chat-media";
export const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function randomId(): string {
  const creator = globalThis.crypto?.randomUUID;
  if (typeof creator === "function") return creator.call(globalThis.crypto);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Rejects a file the bucket would refuse, before spending an upload. */
export function validateChatImage(file: File): string | null {
  if (!CHAT_IMAGE_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP photo.";
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return "That photo is larger than 8MB. Pick a smaller one.";
  }
  return null;
}

/**
 * Uploads one chat photo. Paths follow `chat-media/<kind>/<conversation>/<id>`,
 * which is exactly what the storage policy checks, so the sender must belong to
 * the conversation for the upload to be allowed.
 *
 * A roommate thread passes `<profile>/<student>` as its conversation id, so the
 * file lands in a folder only those two accounts can reach.
 */
export async function uploadChatImage(
  client: TypedSupabaseClient,
  {
    kind,
    conversationId,
    file,
  }: { kind: ChatMediaKind; conversationId: string; file: File },
): Promise<{ path: string | null; error: string | null }> {
  const invalid = validateChatImage(file);
  if (invalid) return { path: null, error: invalid };

  const extension = extensionByType[file.type] ?? "jpg";
  const path = `${kind}/${conversationId}/${randomId()}.${extension}`;

  const { error } = await client.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { path: null, error: "Could not upload that photo. Please try again." };
  }

  return { path, error: null };
}

/**
 * Turns stored object paths into short-lived signed URLs. The bucket is private,
 * so a path alone renders nothing; paths that no longer resolve are simply left
 * out and their bubble shows text only.
 */
export async function signChatImageUrls(
  client: TypedSupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  return cachedSignedUrls(client, CHAT_MEDIA_BUCKET, paths);
}
