/**
 * Distinguish "the network went away" from "the code broke".
 *
 * Both arrive as an exception, but they deserve different screens: one is
 * fixed by reconnecting, the other by us shipping a fix. React's lazy route
 * imports and fetch both fail with messages rather than typed errors, so the
 * only portable signal is the text.
 */

const NETWORK_SIGNATURES = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "network error",
  "load failed",
  "err_internet_disconnected",
  "err_network_changed",
  "err_connection",
  "dynamically imported module",
  "importing a module script failed",
  "chunkloaderror",
  "timed out",
];

/** True when an error looks like a transport failure rather than a bug. */
export function looksLikeNetworkFailure(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const haystack = `${name} ${message}`.toLowerCase();

  return NETWORK_SIGNATURES.some((signature) => haystack.includes(signature));
}
