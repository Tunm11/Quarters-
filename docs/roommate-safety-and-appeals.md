# Roommate safety and verification re-review

Stage: roommate discovery hardening. This document covers two related flows:
blocking/reporting a roommate, and explaining plus re-applying after a
verification is suspended or blocked.

## Blocking

A block is pairwise and stored by profile in `public.roommate_blocks`, with the
display name snapshotted at block time. The snapshot lets Settings list and undo
a block after the blocked profile has been hidden from the blocker.

Where it lives in the UI:

- Roommate profile → **Safety** → **Block**, or the chat options menu → **Block**.
- Roommate profile → **Safety** → **Report** / the report sheet's **Also block**.
- Settings → **Blocked roommates** → **Unblock**.

What the database enforces:

- Discovery (`roommate_profiles` select policy) hides the profile in both
  directions while a block exists.
- All interests between the pair become `withdrawn` when the block is inserted.
- New or re-opened interests between the pair are refused by
  `roommate_blocks_guard_interest`.
- New and edited messages between the pair are refused by
  `roommate_blocks_guard_message`. Read receipts (`read_at` only) still work.
- Either side can unblock; unblocking restores discovery but does not restore a
  connection that the block severed.

Existing messages are retained for moderation. They are not deleted by either
side; the thread becomes read-only while the block exists.

## Reporting

Reports live in `public.roommate_reports`. The reporter chooses one of the
listed reasons and may add up to 1000 characters of detail; the free-text
reason requires at least 10 characters.

- Only the reporter and administrators can read a report. The client cannot set
  `status`, `resolution_note` or `resolved_at`.
- One open (`open`/`reviewing`) report per reporter and profile; a new report is
  allowed after a decision.
- `roommate_reports_prepare` copies the reported account into
  `reported_user_id` so the queue can be queried without joining public profile
  data. Self-reports are rejected.
- Reporting does not automatically block. The sheet offers blocking after the
  report is sent, and the profile's Safety section always exposes it separately.

There is no moderation UI in this build. Moderators work through the Supabase
table (service role) using the status values `open`, `reviewing`, `resolved` and
`dismissed`.

## Verification rejection and re-apply

A rejected verification is a `roommate_verifications` row with `status =
'suspended'` or `'blocked'`. The verification screen now shows:

- The moderator's reason (`suspension_reason` / `blocked_reason`), falling back
  to `review_note` and then a status-specific explanation.
- The decision date.
- Each automated `risk_flags` entry in plain language (`shared_phone`,
  `thin_answers`, `uniform_answers`).
- A re-review request form.

Re-apply behavior:

- **Suspended:** the questionnaire is unlocked. The student can correct answers
  and save them (`Save updated answers`), then request a re-review. Saving does
  not restore access; `status` is administrator-managed and never sent by the
  client.
- **Blocked:** answers are locked, but the student can still submit one
  explanation for a moderator to review.

Requests live in `public.roommate_verification_appeals`:

- One pending request per verification (`status = 'pending'`).
- Reasons: `corrected`, `mistake`, `impersonation`, `other`.
- Message length 30–1000 characters.
- The insert trigger moves the verification to `review_state = 'under_review'`
  and writes a `flagged` row in `roommate_moderation_events` so the request is
  visible to moderation.
- When an administrator changes standing through the existing
  `admin_set_roommate_standing()`, the sync trigger approves the pending request
  on reinstatement or declines it on a further block. Decisions store the
  moderator's note and timestamp.

The verification load error mapping and the discovery gate share the same
reason helpers, so a suspended student sees the reason on the gate card as well
as on the verification screen.

## Notifications for these flows

All three events write a real activity row and are delivered like every other
notification: Realtime updates the Bell and the feed while the app is open, and
`notifications_send_push` hands the row to the `send-push` Edge Function for one
Web Push per registered browser. There is no mock preview any more.

| Event | Trigger | Kind | Destination |
| --- | --- | --- | --- |
| A block is saved | `roommate_blocks_notify_blocker` | `roommate_blocked` | `/settings` |
| A moderator resolves or dismisses a report | `roommate_reports_notify_decision` | `report_decision` | `/notifications` |
| A re-review is approved or declined | `roommate_verification_appeals_notify_decision` | `appeal_decision` | `/roommates/verify` |

- The block row goes to the **blocker only**. The blocked account is never told
  it was blocked: that would hand the person whose contact just ended a pointer
  to the student who blocked them.
- A report is notified once, when its status becomes `resolved` or `dismissed`.
  `open` and `reviewing` are queue states and stay quiet.
- The moderator's `resolution_note` / `decision_note` is appended (trimmed to 200
  characters). Both columns are already readable by the affected student, so the
  notification discloses nothing new.
- The appeal row is written by whichever path closes the appeal: a moderator
  updating the appeal, or the standing-sync trigger that resolves it when an
  administrator calls `admin_set_roommate_standing()`.
- Rows are written by `public.notify_user()`, so clients still cannot insert
  notifications, and the same delivery path (including push) applies.

## Migration

```sh
bun scripts/apply-sql.mjs --host aws-0-eu-west-1.pooler.supabase.com \
  supabase/migrations/20261025440000_add_roommate_safety_and_appeals.sql \
  supabase/migrations/20261025441000_fix_blocked_interest_withdrawal.sql \
  supabase/migrations/20261025450000_add_safety_notification_kinds.sql \
  supabase/migrations/20261025451000_add_safety_notifications.sql
```

The migrations are additive: three tables, their grants and policies, helper
functions, and triggers. The second migration replaces only the interest guard
so a block can withdraw existing interests. The last two add the notification
enum values (in a migration of their own, because a new enum value cannot be
used in the transaction that adds it) and the three notification triggers.
None of them rewrites existing rows or drops columns.

## Remaining limits

- No moderator UI: reports and appeals are resolved through SQL / the service
  role and the existing standing RPC.
- Delivery depends on the environment, not the code: the row is always written,
  but a browser only receives a push when the student turned push on for it, and
  the `send-push` function needs its VAPID keys plus the two Vault secrets
  (`push_function_url`, `push_webhook_secret`). Without the Vault entries the
  notification still lands in the feed; only the outbound push is skipped.
- Blocking, report decisions and appeal decisions have no email fallback.
- Blocking is pairwise between roommate profiles. It does not hide public
  listings or provider conversations.
- Automated tests cover validation, reason mapping and status copy. The live
  RLS and trigger paths have not been exercised cross-account by the test suite.
