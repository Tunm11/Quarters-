import { cachedSignedUrl } from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Account profile photos.
 *
 * The `avatars` bucket is private, so `profiles.avatar_url` holds an object path
 * ("<user_id>/avatar-<time>.jpg"), never a URL. Reads go through a signed URL,
 * cached like the other photo buckets so revisiting a screen does not download
 * the image again.
 *
 * Rows written before this module existed may still hold an absolute URL; those
 * are rendered as-is instead of being signed.
 */

export const ACCOUNT_AVATAR_BUCKET = "avatars";
export const ACCOUNT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const ACCOUNT_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Client-side checks the bucket enforces anyway, surfaced before uploading. */
export function validateAccountAvatarFile(file: File): string | null {
  if (!ACCOUNT_AVATAR_TYPES.includes(file.type as (typeof ACCOUNT_AVATAR_TYPES)[number])) {
    return "Use a JPEG, PNG or WebP photo.";
  }
  if (file.size > ACCOUNT_AVATAR_MAX_BYTES) {
    return "Keep the photo under 5 MB.";
  }
  return null;
}

/** True for a legacy absolute URL rather than a bucket path. */
export function isAbsoluteAvatarValue(value: string): boolean {
  return /^(https?:|data:)/i.test(value);
}

/** Only ever touch this account's own folder, whatever a stale state says. */
export function isOwnAvatarPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`);
}

function extensionOf(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Uploads into the caller's own folder. The timestamped filename means a new
 * photo never collides with the one it replaces, so a cached image is never
 * mistaken for the new one.
 */
export async function uploadAccountAvatar(
  client: TypedSupabaseClient,
  userId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  const invalid = validateAccountAvatarFile(file);
  if (invalid) return { path: null, error: invalid };

  const path = `${userId}/avatar-${Date.now()}.${extensionOf(file)}`;
  const { error } = await client.storage
    .from(ACCOUNT_AVATAR_BUCKET)
    .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });

  if (error) {
    const missingBucket =
      error.message?.toLowerCase().includes("bucket not found") ||
      error.message?.toLowerCase().includes("not found");
    return {
      path: null,
      error: missingBucket
        ? "Profile photos are not enabled on this database yet. The account migration has not been applied."
        : "Could not upload that photo. Please try again.",
    };
  }
  return { path, error: null };
}

/** Best-effort cleanup: a leftover object is harmless, a blocked save is not. */
export async function removeAccountAvatar(
  client: TypedSupabaseClient,
  userId: string,
  path: string,
): Promise<void> {
  if (!path || isAbsoluteAvatarValue(path) || !isOwnAvatarPath(userId, path)) return;
  await client.storage.from(ACCOUNT_AVATAR_BUCKET).remove([path]);
}

/** Resolves a stored avatar value to something an <img> can load. */
export async function accountAvatarUrl(
  client: TypedSupabaseClient,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (isAbsoluteAvatarValue(value)) return value;
  return cachedSignedUrl(client, ACCOUNT_AVATAR_BUCKET, value, 60 * 60);
}
