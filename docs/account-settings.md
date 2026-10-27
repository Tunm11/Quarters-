# Account settings: email, profile photo and deletion

Settings (`/settings`) and the profile page (`/account`) manage the signed-in
account against real Supabase services. Nothing here is mocked: every control
calls Supabase Auth, Storage or Postgres and reports the answer it actually
gets.

Migration: `supabase/migrations/20261025400000_add_account_avatars_and_deletion.sql`.

```sh
bun scripts/apply-sql.mjs supabase/migrations/20261025400000_add_account_avatars_and_deletion.sql
```

Until it is applied, photo uploads and account deletion return an explicit
"account migration has not been applied" message. Email change needs no
migration.

## Email change

- `Settings → Account → Change email` validates the address and calls
  `supabase.auth.updateUser({ email })`, with the confirmation link returning to
  `/auth` in this app.
- Supabase decides the mechanics. With email confirmation enabled it sends a
  confirmation link (to the new address, and to the current address too when
  "Secure email change" is on) and keeps the current address active until the
  link is confirmed. The screen then says confirmation is pending; it never
  claims the address has already changed.
- While a change is pending, the Email row shows the address awaiting
  confirmation (`user.new_email`).
- With confirmation disabled Supabase changes the address immediately, and the
  screen says so.

## Profile photo

- Stored in the private `avatars` bucket at `<user_id>/avatar-<time>.<ext>`.
  `profiles.avatar_url` holds that object path, never a URL.
- Reads are signed (one hour) and cached per object path, matching the other
  photo buckets. A trigger rejects a path outside the caller's own folder.
- Any signed-in student can read an account photo; only its owner can write,
  replace or delete it. Replacing removes the previous object best-effort.
- JPEG, PNG or WebP, up to 5 MB — checked in the browser and by the bucket.
- This is the student's only photo. `/account`, Settings, roommate cards, the
  roommate profile screen and roommate chats all show it, and changing it from
  any of those screens changes it everywhere. The photo controls inside the
  roommate profile sheet write here, not to a second column.
- Opening your own roommate profile (`/roommate/<id>`) shows an owner panel with
  `Add photo` / `Change photo`, `Remove photo` and `Edit profile` instead of
  interest, chat, block and report actions. The same controls are in the sheet
  opened from the pencil on Find roommate.
- Roommate reads resolve it through `public.roommate_account_photos(uuid[])`,
  because `public.profiles` stays own-row only:

  ```sh
  bun scripts/apply-sql.mjs supabase/migrations/20261025410000_share_account_photo_with_roommates.sql
  ```

  Until that migration is applied, roommate cards keep falling back to the
  older seeded `roommate_profiles.avatar_path` photo instead of breaking.
- Curated demo roommate rows have no account behind them, so they keep their
  seeded `roommate-avatars` photo.

## Account deletion

- `Settings → Privacy & data → Delete my account` requires typing `DELETE`,
  then calls `public.delete_own_account('DELETE')`.
- The function runs as its owner (SECURITY DEFINER) because deleting an auth
  user is not a client privilege. It requires a signed-in caller and the exact
  confirmation string.
- Every public table references `auth.users` with `on delete cascade`, so the
  account's profile, profile photo, roommate profile and interests, messages,
  saved rooms, notification/push records and provider application go with it.
  Storage objects the account owned are cleaned up best-effort.
- One refusal: a paid share in a booking group that is not cancelled. Those
  payment rows and receipts belong to the other members too, so the account
  must leave or cancel the booking first. The refusal is shown verbatim, and
  the page does not navigate away.
- On success the local session is cleared and the app returns to the public
  home screen.

## Deliberate limits

- No admin defect: an account with an open booking cannot self-delete; there is
  no support-ticket flow in this build.
- Messages the deleted account wrote are removed from both sides of a
  conversation by the cascade; a photo the other person already downloaded
  stays on their device.
- No email-change resend button: submitting the same new address again asks
  Supabase to send the confirmation afresh.
