# Auth recovery — password reset and one-time email codes

Adds two missing ways into an existing account. Both use Supabase Auth only: no
table, migration, function, secret, or mock backend was added.

## Routes

| Route | Purpose |
| --- | --- |
| `/auth` | Sign in, sign up, plus `Forgot password?` and `Sign in with a one-time code` panels |
| `/reset-password` | Sets a new password for an account holding a recovery session |

`/reset-password` is public on purpose: the recovery link arrives signed out and
Supabase establishes a short-lived session from the URL fragment. A live session
is the proof that the link was valid, so the page renders the form only when
`status === "signedIn"`. Otherwise it explains that the link expired or was
already used and offers a fresh request.

## Flow 1 — forgot password

1. `requestPasswordReset(email)` → `supabase.auth.resetPasswordForEmail` with
   `redirectTo: <origin>/reset-password`.
2. The panel says a message was requested *if an account exists*. Supabase
   answers identically for unknown addresses, so the UI never claims an account
   is registered.
3. The emailed link opens `/reset-password`; `detectSessionInUrl` turns the
   fragment into a recovery session and fires `PASSWORD_RECOVERY`.
4. If the URL is not allow-listed in the project's Redirect URLs, Supabase
   falls back to the Site URL. `RecoveryRedirect` (mounted in `AppShell`) sees
   the `PASSWORD_RECOVERY` flag and replaces the route with `/reset-password`,
   so the student is never stranded on Home with an unusable link.
5. Saving calls `updatePassword`, then clears the recovery flag. Failures
   (`weak_password`, `same_password`, `reauthentication_needed`) are shown and no
   success screen appears.
6. The reset email template also contains a code when `{{ .Token }}` is in the
   template; that code can be entered on the same panel and is exchanged with
   `verifyOtp({ type: "recovery" })` for the recovery session.

## Flow 2 — one-time email code sign-in

1. `sendEmailCode(email)` → `supabase.auth.signInWithOtp` with
   `shouldCreateUser: false`. A sign-in screen must not create accounts; new
   students use the sign-up form.
2. `verifyEmailCode(email, code)` → `verifyOtp({ type: "email" })`. A session is
   only applied when Supabase returns one.
3. Resends are rate-limited in the UI with a 60-second cooldown per panel.

## Supabase dashboard settings this needs (owner action)

These are project settings, not code:

- **Redirect URLs**: allow `<preview-origin>/reset-password` (and localhost) in
  Authentication → URL Configuration. Without it, reset links land on the Site
  URL and rely on `RecoveryRedirect`.
- **Email templates**: the default "Reset Password" and "Magic Link" templates
  contain only `{{ .ConfirmationURL }}`. Add `{{ .Token }}` to either template if
  students should be able to type the code instead of opening the link. Links
  work either way.
- Email delivery must be configured in the project (the built-in SMTP has tight
  rate limits; production should use a custom SMTP provider).

## Validation

`bun tsc -b --noEmit` passes and the focused Vitest files cover the new short
form (`src/pages/auth.test.tsx`, `src/pages/reset-password.test.tsx`). No live
Supabase request was made: sending real email and following a real reset link
must be checked by the project owner against the deployed project, because this
workspace must not send email or change auth settings.
