/** Default destination after auth: the application's Home screen. */
export const AUTH_FALLBACK_PATH = "/";

/**
 * Accepts only same-origin, absolute paths. Rejects protocol-relative URLs
 * ("//evil.example"), backslash tricks, and the auth page itself so a signed-in
 * redirect can never loop.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) {
    return AUTH_FALLBACK_PATH;
  }
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return AUTH_FALLBACK_PATH;
  }
  if (value === "/auth" || value.startsWith("/auth?") || value.startsWith("/auth#")) {
    return AUTH_FALLBACK_PATH;
  }
  return value;
}
