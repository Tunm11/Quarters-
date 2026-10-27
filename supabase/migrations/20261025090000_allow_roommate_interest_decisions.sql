-- Roommate connections, part 2: the receiving side.
--
-- Interests were write-only for the sender (pending rows, no updates). A profile
-- owner now needs to accept or decline the interests sent to their own profile,
-- which is what turns a pending interest into a connection for the sender.
--
-- Additive: one column grant, one update policy and one read RPC. Nothing
-- existing is dropped, and senders still cannot change their own status.

-- Owners may only write the decision column...
grant update (status) on table public.roommate_interests to authenticated;

-- ...and only on interests addressed to a profile they own, with a decision
-- value. `status = 'pending'` in the USING clause keeps an already-decided row
-- from being flipped a second time.
create policy roommate_interests_update_profile_owner
  on public.roommate_interests
  for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1
      from public.roommate_profiles p
      where p.id = profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (status in ('accepted', 'declined'));

-- Who is interested? The sender's public.account profile is private, so the
-- caller cannot join it directly. This definer function exposes only the
-- sender's display name plus their public roommate profile, and only for
-- interests addressed to the caller's own profiles.
create or replace function public.roommate_interests_for_owner()
returns table (
  id uuid,
  profile_id uuid,
  status public.roommate_interest_status,
  created_at timestamptz,
  sender_id uuid,
  sender_display_name text,
  sender_headline text,
  sender_city text,
  sender_avatar_path text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    i.id,
    i.profile_id,
    i.status,
    i.created_at,
    i.sender_id,
    coalesce(rp.display_name, p.display_name, split_part(u.email, '@', 1)),
    rp.headline,
    rp.city,
    rp.avatar_path
  from public.roommate_interests i
  join public.roommate_profiles mine
    on mine.id = i.profile_id
   and mine.user_id = (select auth.uid())
  join auth.users u
    on u.id = i.sender_id
  left join public.profiles p
    on p.id = i.sender_id
  left join public.roommate_profiles rp
    on rp.user_id = i.sender_id
   and rp.is_discoverable
  order by i.created_at desc;
$$;

comment on function public.roommate_interests_for_owner() is
  'Interests addressed to profiles owned by the caller, with a safe sender label.';

revoke all on function public.roommate_interests_for_owner() from public, anon;
grant execute on function public.roommate_interests_for_owner() to authenticated;
