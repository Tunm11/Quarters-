-- One photo per student.
--
-- /account and Settings stored an account photo (profiles.avatar_url in the
-- private `avatars` bucket) while the roommate screens stored a second photo
-- (roommate_profiles.avatar_path in `roommate-avatars`). Students ended up with
-- a different face on their roommate card and in roommate chats than on their
-- own account page.
--
-- Roommate rows are readable by every signed-in student, but `public.profiles`
-- is own-row only, so a client cannot read another student's `avatar_url` to
-- show it on a card. This function answers exactly that question for
-- discoverable roommate profiles: the owning account and its photo path.
-- Nothing else about the account (display name, email, timestamps) is exposed.
--
-- Additive: one function. No columns, rows, policies or grants change, and the
-- legacy roommate-avatars photo stays readable for curated demo rows, which
-- have no account behind them.

create or replace function public.roommate_account_photos(p_profile_ids uuid[])
returns table (
  profile_id uuid,
  owner_id uuid,
  avatar_url text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select rp.id, rp.user_id, p.avatar_url
  from public.roommate_profiles rp
  left join public.profiles p
    on p.id = rp.user_id
  where rp.id = any (p_profile_ids)
    and rp.is_discoverable
$$;

comment on function public.roommate_account_photos(uuid[]) is
  'Phase 2R: account photo path for discoverable roommate profiles, so cards and chats show the same photo as the owner''s account page.';

revoke all on function public.roommate_account_photos(uuid[]) from public, anon;
grant execute on function public.roommate_account_photos(uuid[]) to authenticated;
