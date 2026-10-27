# Saved searches and new-room alerts

Explore → **Save this search** keeps the query and the filter-sheet choices on
the account, and Saved → **Saved searches** is where they are listed, renamed,
reopened and switched on or off. Each search has its own *Notify me when a room
matches* alert; nothing here is a mock, and no alert claims to have been sent
that the database did not write.

Migrations (version-controlled, **applied to the live project on 2026-10-27**):

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025460000_add_saved_search_match_notification_kind.sql \
  supabase/migrations/20261025461000_add_saved_searches.sql
```

If a future environment runs without them, every saved-search read or write
reports *“Saved searches are not available yet. The saved-searches migration may
not be applied to this Supabase project.”* — the screen never shows a search that
was not stored.

## What a saved search holds

| Column | Meaning |
| ------ | ------- |
| `query` | the Explore search box, matched as a substring of the listing's text |
| `category` | Explore's room-type shortcut: `all`, `private`, `shared` or `hostel` |
| `budget_min` / `budget_max` | the budget band from the filter sheet; both null means no budget opinion |
| `types` | the filter sheet's room types (`accommodation_type[]`) |
| `bedrooms` | the filter sheet's bedroom counts (`smallint[]`) |
| `facilities` | selected facilities; all of them must be present on a match |
| `notify` | whether a matching room writes an activity row |

The rows are columns rather than a serialized blob because the database matches
them itself. `name` is 1–40 characters after trimming, which is what the check
constraint and the sheet both enforce.

Ownership is enforced by row level security: the owner is the only account that
can read, insert, update or delete a row, and an insert for someone else is
refused by the policy's `WITH CHECK`. Column-level grants narrow writes to the
search fields — `user_id` and the timestamps are not client-writable.

## When an alert is written

`public.notify_saved_search_matches()` runs on `public.listings`:

- after an insert,
- after an update of `publication_status`, when the status actually changes.

It starts by checking `public.is_public_listing(new.id)`, so a draft, a hidden
listing or a room whose provider is not approved writes nothing. Publication is
the moment a room becomes findable on Explore, which is exactly what a saved
search is watching for. Deliberately, a saved search is **not** re-evaluated on
every listing edit: the promise is "tell me when a new room matches", and rent
or availability changes on a room you already saved have their own alerts (see
Settings → **Updates on saved rooms**).

For each public room, every search whose `notify` is on and whose criteria fit
writes one row through `public.notify_user()`:

| Rule | Compared against |
| ---- | ---------------- |
| keyword | `query` is a case-insensitive substring of the title, city, neighbourhood, institution, room type and facilities |
| room-type shortcut | `private` → `private_room`, `shared` → `shared_room`, `hostel` → `hostel`, `all` → anything |
| budget band | `rent_amount` inside the band; a room with no rent never matches a band |
| room types | `accommodation_type` is one of `types`, when the list is not empty |
| bedrooms | `bedrooms` is one of the list, when the list is not empty |
| facilities | every selected facility is present on the room (`facilities <@ new.facilities`) |

The trigger skips the provider who published the room, so a landlord is never
told about their own publish through a search they saved. Each matching search
produces its own row, with the search's name in the title (`New room matches
“Akoka under ₦800k”`), the room, its area and its rent in the body, and a link to
the room's page.

Because the rows go through `notify_user()`, the existing
`notifications_send_push` trigger forwards them as web push wherever the student
turned push on. `saved_search_match` is a new value of
`public.notification_kind`, added in its own migration because PostgreSQL forbids
using a new enum value in the transaction that added it.

## Reopening a search

A search travels in the URL — `?q=`, `?category=`, `?min`/`?max`, `?types`,
`?bedrooms` and one `?f=` per facility — so **View results** reopens the search
on Explore, the page can be reloaded, and the link can be shared. Facility names
are free text, so each gets its own parameter rather than being joined. Anything
the URL cannot be trusted for (an unknown room-type shortcut, a non-numeric or
implausible bedroom count) is ignored rather than guessed at.

The same round-trip is what a signed-out visitor gets: tapping **Save this
search** sends them to sign in with `returnTo` pointing back at the search, so
they land on the results they built.

## Surfaces

| Where | What it does |
| ----- | ------------ |
| Explore | a **Save this search** control appears as soon as the search narrows anything — including a search that currently matches nothing, which is when saving matters most |
| Save sheet | names the search, shows how many of the loaded rooms match, and sets the alert switch |
| Saved → Saved searches | the list, with *View results*, rename, delete, and the per-search alert switch |
| Settings → Notifications | a pointer to the same list, so the alert choices are findable where the other notification switches are |
| Notifications | `saved_search_match` renders with the search icon and the accent tone |

## Verification

```sh
bun run test:searches   # migrations applied to in-process PostgreSQL (PGlite)
bun run test            # unit and component tests, including the sheet and Saved tab
```

`scripts/verify-saved-searches.mjs` applies the real migration files and asserts
what the trigger writes: a matching room alerts the saver once with the right
title, body and link; a room with the wrong type, rent, facility count or
bedrooms writes nothing; publishing a draft alerts then, but re-saving the same
published room does not; `notify = false` stays quiet; the publishing provider is
never alerted for their own room; one account cannot read, rename or delete
another's searches; and clients cannot forge a notification row.

## Remaining limits

- Alerts fire on publication only. A room that would match a search but is
  already published when the search is saved is not announced — the results
  screen shows it instead.
- Rooms that become public because a provider was approved, or because an
  administrator restored visibility, are not covered; those paths do not pass
  through the two triggers above.
- The `saved_search_match` kind reaches the in-app feed and web push. Email
  delivery is still not connected anywhere in the app.
- The Saved tab does not count matches per search: it would mean reading the
  catalogue from a second screen. The sheet on Explore counts the rooms it has
  actually loaded and says so.
