import type { TypedSupabaseClient } from "@/lib/supabase";

/**
 * Signed storage URLs, cached per object path.
 *
 * Supabase signs on demand, so two calls for the same photo return two different
 * URLs. A fresh URL is a fresh image as far as the browser is concerned: the
 * cached copy is bypassed and the whole photo is downloaded again — which is
 * what made list screens feel heavy on every revisit.
 *
 * One signature is kept per object and reused until shortly before it expires,
 * so a photo downloaded once is served from the HTTP cache after that.
 *
 * Only successful URLs are cached; a failure simply means the caller gets no
 * entry for that path and can try again later.
 */

type CachedUrl = { url: string; expiresAt: number };

const cache = new Map<string, CachedUrl>();

/** Renew this long before expiry so a URL never dies mid-render. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Default lifetime, matching what the chat and listing screens ask for. */
export const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

function cacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

/** Test helper: forget everything that was signed. */
export function clearSignedUrlCache(): void {
  cache.clear();
}

/**
 * Signed URLs for many objects at once, reusing anything still valid. Returns a
 * path → URL map, in the shape the storage client already produces.
 */
export async function cachedSignedUrls(
  client: TypedSupabaseClient,
  bucket: string,
  paths: string[],
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;

  const now = Date.now();
  const missing: string[] = [];

  for (const path of unique) {
    const hit = cache.get(cacheKey(bucket, path));
    if (hit && hit.expiresAt > now) {
      urls.set(path, hit.url);
    } else {
      missing.push(path);
    }
  }

  if (missing.length === 0) return urls;

  const { data } = await client.storage
    .from(bucket)
    .createSignedUrls(missing, ttlSeconds);

  const expiresAt = now + ttlSeconds * 1000 - REFRESH_MARGIN_MS;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      cache.set(cacheKey(bucket, entry.path), {
        url: entry.signedUrl,
        expiresAt,
      });
      urls.set(entry.path, entry.signedUrl);
    }
  }

  return urls;
}

/** One object, with the same caching behaviour. */
export async function cachedSignedUrl(
  client: TypedSupabaseClient,
  bucket: string,
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const urls = await cachedSignedUrls(client, bucket, [path], ttlSeconds);
  return urls.get(path) ?? null;
}
