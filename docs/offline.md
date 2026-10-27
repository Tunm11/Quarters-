# Offline

The service worker already made the app shell open without a network. That was
not enough: every screen is a Supabase read, so a student who lost signal got a
shell and an error. This stage makes the two screens that matter on the move —
the shortlist and the conversation inbox — open from a local copy, and says
plainly when that copy is being shown.

## What is kept, and where

`src/offline/offline-store.ts` writes the last successful read of each list to
`localStorage`, one entry per (account, list):

| Key | Holds |
| --- | ----- |
| `saved-rooms` | the shortlist as full public summaries, plus which folder each room is filed in |
| `inbox-room-threads` | the student's room conversations |
| `inbox-groups` | group conversations |
| `inbox-connections` | roommate connections |

Rules the store enforces:

- **Namespaced by account.** `quarters.offline.v1:<userId>:<list>`. A row written
  by one account is never returned for another.
- **Expires.** A copy older than 14 days is treated as missing rather than shown
  as current.
- **Never load-bearing.** A missing, unreadable or unwritable entry returns null
  or does nothing. Storage failure cannot break a screen that is online.

The shortlist's collection filing is a `Map`, which JSON cannot keep, so
`snapshots.ts` stores it as `[listingId, collectionId]` pairs and rebuilds it.

## How a hook uses it

`useSavedRooms`, `useStudentListingChatThreads`, `useChatGroups` and
`useRoommateConnections` share one rule:

1. Online → read Supabase; on success, **replace** that account's copy.
2. Offline → read the copy and render it. The hook exposes `offlineSavedAt` (the
   timestamp of the read the copy came from) so the screen can label it.
3. Offline with no copy → an honest error ("this device has no saved copy of your
   shortlist yet"), never an empty list pretending the shortlist is empty.

The switch happens on the browser's `online`/`offline` events, not on a fetch
failure: a real server error while online stays a visible error instead of being
papered over with stale rows.

Writes are refused while offline rather than queued: removing a saved room or
refiling it returns "You are offline, so this room stays saved" and leaves the
list untouched. There is no offline write queue, so nothing is lost silently.

## The indicator

- **Global:** `OfflineBanner` sits under the shell's skip link while
  `navigator.onLine` is false, and disappears when the connection returns (the
  screens then reload on their own). It is a `role="status"` live region.
- **Per screen:** `OfflineCopyNotice` appears on Saved and Messages when the rows
  on screen came from the cache — "Offline copy, last read 12 minutes ago.
  Changes are not sent until you are back online."

## Photographs

Signed Storage URLs expire, and the app cannot mint a new one without the
network. The service worker therefore keeps a bounded media cache
(`quarters-media-v1`, at most 120 entries) for
`/storage/v1/object/sign/` objects on the project's Supabase host:
cache-first, refreshed in the background while online. Database/API traffic is
still never cached, so a stale REST response can never be mistaken for a fresh
one.

## Running and verifying the worker

`public/sw.js` is a classic script copied verbatim into the build, so nothing in
the app's module graph imports it and no unit test used to run it. Two things
close that gap.

**It runs in the preview.** `registerOfflineWorker()` registers `/sw.js` in a
build and `/sw.js?mode=dev` against the dev server. In dev mode the worker caches
nothing but signed Storage photographs: it precaches no shell, never answers a
navigation and never touches `/assets/`, so Vite keeps ownership of the dev shell
and its module graph. That is what makes the photograph cache observable while
developing — previously it only existed after `bun run build`.

**The shipped file is executed.** `src/offline/service-worker.test.ts` evaluates
the real `public/sw.js` inside a simulated worker global (in-memory Cache API,
controllable network) and drives install, activate and fetch: shell precache,
network-first navigation with the cached fallback, cache-first photographs with a
background refresh, the 120-entry bound, database traffic left untouched, and the
dev mode registering no shell cache.

```bash
bun run test            # includes the worker harness
bun run build           # produces dist/sw.js
bun run test:offline-worker
```

`scripts/verify-offline-worker.mjs` boots the **built** `dist/sw.js` with `dist/`
as its network, then takes that network away. It fails if the built HTML names a
fingerprinted asset the worker did not cache, if an icon is missing, if an
offline navigation does not return the built shell, or if a photograph cannot be
served from cache once the network is gone.

## Limits

- **Thread contents, not just the inbox.** The inbox lists open offline; the
  messages inside a conversation are still a live read, so opening a thread while
  offline shows its error state. Caching every thread's messages is the next step
  if it is wanted.
- **No offline queue.** Saving, unsaving, sending, reporting and booking all need
  the network; the app says so instead of queueing.
- **14-day expiry** means a student who has not opened the app in a fortnight
  gets the honest empty state rather than a stale shortlist.
- **The copy is device-local.** Clearing site data, private mode, or another
  device starts empty; there is no server-side "offline pack".
- **The worker is verified in a simulated scope, not a real browser.** The
  harness above executes the shipped code, install included, but this workspace
  cannot drive a browser, so things only a browser decides — quota eviction under
  storage pressure, whether the OS keeps a worker alive, actual offline latency —
  are not covered by it.
- **Dev mode caches photographs only.** A dev page has no offline shell, by
  design: a cached dev `index.html` would outlive the module graph it points at.
