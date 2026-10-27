# Reviews, reports, move-in costs and availability

Four things a student needs before paying a deposit, all on the room page
(`property/:id`). Everything below is backed by real columns and real policies;
nothing on screen is invented when the provider left it out.

Migrations (applied to the live project on 2026-10-27):

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025470000_add_listing_reviews.sql \
  supabase/migrations/20261025471000_add_listing_reports.sql \
  supabase/migrations/20261025472000_add_listing_costs_and_availability.sql
```

`bun run test:trust` applies them to PGlite and asserts the rules below (32
checks). `bunx vitest run` covers the read models and the sheets.

## Reviews and ratings

A review is worth reading only if the reviewer has been there, so the database
decides who may write one:

| Evidence | Basis stored | Badge shown |
| -------- | ------------ | ----------- |
| holds a room in the listing (`listing_room_bookings.booked_by`) | `reservation` | *Reserved a room* |
| a completed viewing request (`listing_viewing_requests.status = 'completed'`) | `visit` | *Visited* |

`public.listing_review_basis(listing_id)` returns that evidence for the caller
(or null). The page uses the same function to decide whether to show **Write a
review**, so the button never appears to an account the write would refuse — and
`save_listing_review()` re-checks it server-side, including that the claimed
basis matches the real one.

- One review per student per listing (`unique (listing_id, author_id)`). Writing
  again corrects the existing review; the sheet reopens prefilled from
  `my_listing_review()`.
- The rating is a whole `smallint` 1–5; averages are computed, never stored.
  Bodies are 20–1500 characters after trimming.
- Reviews are anonymous on screen: `author_id` is outside the select grant, so
  no client — signed in or not — can read who wrote one.
- Reads are limited to published listings by the select policy, and
  `listing_review_summary()` (count, mean, star distribution) returns zeros for
  anything not public.

## Report a listing

`public.listing_reports` takes one report per account per listing
(`unique (listing_id, reporter_id)`), from any signed-in account that can see the
listing — the person best placed to spot a scam often never made it to a viewing.

Reasons: `scam`, `wrong_details`, `already_taken`, `unreachable`, `offensive`,
`duplicate`, `other`. `other` cannot be filed without a description (10–1000
characters), enforced by a check constraint as well as the sheet.

Reporting never takes a listing down and never tells the provider who reported
them. Students read only their own reports; administrators read all of them
through `is_admin()` and can move `status` (`open` → `reviewed` / `dismissed`).
A duplicate report is answered as "you already reported this", not as an error
that hides what happened.

## Move-in costs

The rent headline is no longer the whole price. Six columns on `listings`:

| Column | Meaning |
| ------ | ------- |
| `agency_fee_amount` | one-off agency/commission fee |
| `caution_deposit_amount` | refundable caution/security deposit |
| `utilities_amount` + `utilities_period` | utilities cost and the period it covers |
| `utilities_note` | how utilities are charged, in the provider's words |
| `available_from` | earliest move-in date |

Checks keep the pair honest: an amount with no period (or the reverse) is
refused, so "utilities: free" can never be rendered from half a fact. All three
amounts must be positive.

The card (`move-in-costs.ts` + `move-in-costs-card.tsx`) shows every stated line
with its own period, names every line the provider left out, and labels the sum
**At least** whenever anything is missing. Utilities are only added to the total
when they share the rent's period — a monthly figure is not part of an annual
rent — and the card says so rather than quietly dropping them. With no figures at
all, the card says the costs were not broken down and offers to ask the provider,
instead of showing a total that looks complete.

## Availability calendar

Twelve months, derived only from what exists:

- `listings.available_from` — months ending before it are **Not yet**; the month
  containing it is **Open** with the exact date in its note.
- `public.listing_availability_holds` — dated windows the owning provider
  withheld (max one year, end on or after start). Overlapping months are **Held**
  with the provider's note.
- `availability_status = 'unavailable'` — every month **Closed**.
- every room taken (`total_rooms` vs the rooms students hold) — every month
  **Closed**, since there is nothing to move into.

A listing with no dates at all draws **no grid**. The section then states the
move-in date was not given and how many rooms are free. A grid of green months
would claim a schedule the provider never provided.

Holds are readable by anyone who can see the listing, writable only by the
provider who owns it (`owns_listing()`, created with the listing foundation), so
a rival provider cannot mark someone else's rooms as taken.

## Verified and inspected listings

Provider approval says an account may publish here; it says nothing about a
particular room. Two nullable columns on `listings` record checks QUARTERS
did on the room itself:

| Column | Meaning |
| ------ | ------- |
| `verified_at` | a moderator checked the address, rent and room details |
| `inspected_at` | someone from QUARTERS visited the property |

Both are null until a moderator acts, and **no client role can write them**:
they are granted to `anon`/`authenticated` for `select` only, so a lister cannot
self-verify at insert or update (the database refuses with `42501`). The one
write path is `admin_set_listing_verification(listing_id, verified, inspected)`,
which refuses anyone without `is_admin()` and can only touch those two columns.
An inspection is the stronger mark, so `listings_inspection_implies_verification`
refuses one without a verification, and the function sets both together.

A check is about what the listing said at the time, so the trigger
`listings_clear_verification_on_edit` drops both stamps when the provider changes
the title, rent, period, city, neighbourhood or room type. A description or photo
edit keeps them; a material one has to be re-checked.

Where they show:

- **Room card** — a `Listing checks` row with `Inspected` / `Verified listing`
  chips, rendered only when the row holds a timestamp, so a catalogue never shows
  a mark the database does not have.
- **Room page** — a **What QUARTERS checked** panel listing provider approval,
  listing verification and inspection, each with the date it happened or an
  honest "Not checked yet", closed by the note that none of it is a tenancy
  guarantee.

Marking a listing today is SQL or the dashboard, e.g.

```sql
select * from public.admin_set_listing_verification('<listing-id>', true, true);
```

## What is not here yet

- **No provider-facing listing editor.** Listings are still created and edited
  outside the app, so the cost and date columns are written through the provider
  API (column grants allow exactly these fields) rather than a form. The student
  side is complete; the lister side has no screen.
- No email or push when a review lands, and no review moderation UI beyond the
  delete policies that let an author or an administrator remove one.
- **No admin screen for verification or inspection.** A moderator marks a room
  through `admin_set_listing_verification()` in SQL or the dashboard; there is no
  moderation console in the app. A listing with no marks shows neither badge and
  says "Not checked yet" — it is never assumed checked.
- The calendar shows months, not individual nights; reservations are not dated in
  this schema, so room-level holds are the only per-date input besides
  `available_from`.
