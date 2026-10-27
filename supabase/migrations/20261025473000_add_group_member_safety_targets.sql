-- Safety for people you meet in a group chat.
--
-- Blocking and reporting are keyed by roommate profile, but a group member is
-- only known by user id: there is no public profile to tap because the group
-- sheet lists people who need not be discoverable. This adds the member's
-- roommate profile id to the list the group sheet already reads, so the same
-- report/block flow used on a profile works for a group member.
--
-- The id is only handed to people who are already in that group with the
-- member, and it unlocks nothing by itself: roommate_reports and
-- roommate_blocks still decide what the caller may write.
--
-- Additive: the member list's return shape changes, so the function is replaced
-- rather than patched. No table, policy or row is touched.

drop function if exists public.chat_group_members_for_me(uuid);

create function public.chat_group_members_for_me(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  is_creator boolean,
  -- Null when the member has no roommate profile (an agent, an owner, or a
  -- student who never created one). Those members cannot be reported or
  -- blocked through the roommate safety flow.
  roommate_profile_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Member'),
    m.joined_at,
    g.created_by = m.user_id,
    rp.id
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join public.profiles p on p.id = m.user_id
  left join public.roommate_profiles rp on rp.user_id = m.user_id
  where m.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
  order by m.joined_at, m.user_id;
$$;

comment on function public.chat_group_members_for_me(uuid) is
  'Phase 2N: members of a group the caller belongs to, with names, who runs it, and the roommate profile a member can be reported or blocked through.';

revoke all on function public.chat_group_members_for_me(uuid) from public, anon;
grant execute on function public.chat_group_members_for_me(uuid) to authenticated;
