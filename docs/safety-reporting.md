# Reporting and blocking

Two queues exist, and they answer different questions:

| You are reporting | Table | Who reads it |
| ----------------- | ----- | ------------ |
| A **room** | `listing_reports` | Administrators; the reporter sees their own row |
| A **person** (a roommate profile) | `roommate_reports` | Administrators; the reporter sees their own row |

Blocking is separate and pairwise: `roommate_blocks` hides both profiles from
each other, withdraws any interest between them, and refuses new interests and
new messages in both directions. It never deletes the conversation — existing
messages stay on file for moderation.

## Where each action lives

| Surface | Report the room | Report the person | Block the person |
| ------- | --------------- | ----------------- | ---------------- |
| Room page | Yes — "Report this listing" | n/a | n/a |
| Room page → chat with the lister | Yes — conversation options menu (student side only) | n/a (the lister has no roommate profile) | n/a |
| A roommate's profile | n/a | Yes | Yes |
| One-to-one roommate chat → options | n/a | Yes | Yes |
| Group chat → Group settings → member options | n/a | Yes, when the member has a roommate profile | Yes, when the member has a roommate profile |
| Settings → Blocked roommates | — | — | Unblock |
| Settings → Reports you filed | — | Shows what you filed and its status | — |

The lister of a room is not a reportable person on their own: they have no
roommate profile, and reporting the room is what reaches administrators about
their conduct. Reporting a room from the conversation is offered on the student
side of a thread only, never to the lister answering a student.

## Group members

`20261025473000_add_group_member_safety_targets.sql` replaces
`chat_group_members_for_me()` so each member of a group you belong to comes with
their `roommate_profile_id`. That id is what the report and block flows need
(they are keyed by profile), and it is the reason a member can be acted on
without first finding their profile in discovery — which matters most precisely
when the person is harassing you in the group.

- An **agent or owner** in the group returns `null` and its options menu says so
  rather than offering an action the database would refuse.
- A member you have **already blocked** is marked `Blocked`, and the block is
  not offered again. The group roster still lists them: a block does not remove
  anyone from a group, and it does not silence their messages in that group.
  Leaving the group does that.
- The roster stays private: it is returned only to members of that group, and
  the function is revoked from `anon`.

## The list of reports you filed

`20261025474000_add_my_reports.sql` adds `my_reports()`, returning the caller's
own reports from both tables, newest first, each with a readable subject:

- a person report names the roommate profile, or failing that the account, or
  "A student";
- a room report names the listing title even after the provider unpublishes it;
- `status` is passed through exactly as moderation left it (`open`, `reviewing`,
  `reviewed`, `resolved`, `dismissed`).

The function is `SECURITY DEFINER` so it can resolve those names — a student
cannot read the profile of someone they have blocked — but every branch is
pinned to `auth.uid()`: it can only ever return the caller's own rows.

Settings → **Reports you filed** renders that list with the status on each card,
the count still with moderators in the section description, a skeleton while it
loads, a real empty state, and the migration message if the function is missing.
The empty state says what it is (nothing filed yet), where a report can be filed
from, and links to the rooms to file one — it never shows sample reports. On the
live project both report tables hold no rows, so that state is the honest one
until someone actually files something.

## What the database decides, not the screen

- One open report per account per person (`roommate_reports_one_open_idx`) and
  one report per account per listing (`listing_reports_once_per_reporter`); a
  repeat is answered as "you had already reported this" rather than as a
  failure, and never as a silent success.
- "Something else" needs words: `reason = 'other'` is refused without details.
- Room reports can only be filed against a listing the reporter can actually
  see (`is_public_listing`), so a draft cannot be reported.
- You cannot report or block yourself, and you cannot write a report attributed
  to anyone but yourself.
- The reported account is never told who reported them, and a provider never
  learns which student reported their room.

## Verification

- `bun run test:reporting` — 15 checks in PGlite: the roster carries the right
  profile ids and stays private, a member can report and block another member, a
  blocked member cannot send interest, a room report survives unpublishing, and
  `my_reports()` returns only the caller's rows with the right subjects and
  statuses.
- `bun run test` covers the client side: the settings lists, the group member
  options menu, and reporting a room from the lister conversation.

## Limits

- **No moderation UI yet.** Triage is SQL or the Supabase dashboard; the admin
  policies and the status columns are the only machinery, and
  `notify_user()` already reaches the reporter when a decision lands.
- **Blocking does not silence a group.** A blocked group member's messages still
  appear in that group's thread; the block stops discovery, interests and
  one-to-one messages. Per-group muting is not in this stage.
- **`my_reports()` shows no resolution note.** The moderation note is stored on
  the row, but the reader returns the status alone, so the app says "Reviewed"
  without quoting a moderator.
- **Agents cannot be blocked.** `roommate_blocks` targets roommate profiles, so
  a lister who harasses a student in a room chat can only be reported through
  the room.
