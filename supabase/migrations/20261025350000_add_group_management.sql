-- Group management: rename, avatar, add member, remove member, leave.
--
-- Until now a group was one-way: create_chat_group() was the only write, so a
-- creator could not add or remove anyone, nobody could leave, and the name and
-- picture were fixed at creation.
--
-- Rules kept in the database:
--   * only the creator renames the group, changes its picture, adds or removes
--     people;
--   * a person can only be added if the creator has actually talked to them
--     (has_chatted_with), and groups hold at most 50 people;
--   * anyone may leave. If the creator leaves, the earliest remaining member
--     becomes the creator; if the last person leaves, the group is deleted;
--   * the creator cannot remove themselves — that is what leaving is for.

alter table public.chat_groups
  add column if not exists avatar_path text;

comment on column public.chat_groups.avatar_path is
  'Object path in the private chat-media bucket (group-avatar/<group_id>/<file>), never a public URL.';

grant select (id, name, created_by, created_at, avatar_path)
  on table public.chat_groups to authenticated;

-- Shared check for the management RPCs and the storage policy.
create or replace function public.is_chat_group_creator(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_groups g
    where g.id = p_group_id
      and g.created_by = (select auth.uid())
  );
$$;

comment on function public.is_chat_group_creator(uuid) is
  'Phase 2N: true when the caller created this group.';

revoke all on function public.is_chat_group_creator(uuid) from public, anon;
grant execute on function public.is_chat_group_creator(uuid) to authenticated;

-- Group pictures live one folder deep like room/group attachments:
--   chat-media/group-avatar/<group_id>/<file>
-- Everyone in the group may read it; only the creator may upload it, which the
-- storage insert policy below enforces on top of this read rule.
create or replace function public.can_access_chat_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  target uuid;
  thread_student uuid;
  owner uuid;
begin
  if array_length(parts, 1) not in (2, 3) then
    return false;
  end if;

  begin
    target := parts[2]::uuid;
  exception when others then
    return false;
  end;

  if array_length(parts, 1) = 3 then
    if parts[1] <> 'roommate' then
      return false;
    end if;

    begin
      thread_student := parts[3]::uuid;
    exception when others then
      return false;
    end;

    select p.user_id into owner
    from public.roommate_profiles p
    where p.id = target;

    if owner is null then
      return false;
    end if;

    return thread_student = (select auth.uid())
      or owner = (select auth.uid());
  end if;

  if parts[1] = 'group' then
    return public.is_chat_group_member(target);
  end if;

  if parts[1] = 'group-avatar' then
    return public.is_chat_group_member(target);
  end if;

  if parts[1] = 'room' then
    return public.is_public_listing(target);
  end if;

  return false;
end;
$$;

revoke all on function public.can_access_chat_media(text) from public, anon;
grant execute on function public.can_access_chat_media(text) to authenticated;

-- A picture may only be uploaded by the creator. Parsing the folder here keeps
-- the policy from casting a non-uuid folder to uuid and erroring.
create or replace function public.can_set_chat_group_avatar(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  target uuid;
begin
  if array_length(parts, 1) <> 2 or parts[1] <> 'group-avatar' then
    return false;
  end if;

  begin
    target := parts[2]::uuid;
  exception when others then
    return false;
  end;

  return public.is_chat_group_creator(target);
end;
$$;

comment on function public.can_set_chat_group_avatar(text) is
  'Phase 2N: only the group creator may upload group-avatar/<group_id>/<file>.';

revoke all on function public.can_set_chat_group_avatar(text) from public, anon;
grant execute on function public.can_set_chat_group_avatar(text) to authenticated;

drop policy if exists chat_media_insert on storage.objects;

create policy chat_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.can_access_chat_media(name)
    and (
      (storage.foldername(name))[1] <> 'group-avatar'
      or public.can_set_chat_group_avatar(name)
    )
  );

-- ---------------------------------------------------------------------------
-- Rename and avatar
-- ---------------------------------------------------------------------------

create or replace function public.rename_chat_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_me is null then
    raise exception 'Sign in to manage this group.' using errcode = '42501';
  end if;
  if not public.is_chat_group_creator(p_group_id) then
    raise exception 'Only the group creator can rename it.' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Keep the group name to 1–60 characters.' using errcode = '22023';
  end if;

  update public.chat_groups set name = v_name where id = p_group_id;
end;
$$;

comment on function public.rename_chat_group(uuid, text) is
  'Phase 2N: creator-only rename, 1–60 characters.';

revoke all on function public.rename_chat_group(uuid, text) from public, anon;
grant execute on function public.rename_chat_group(uuid, text) to authenticated;

create or replace function public.set_chat_group_avatar(p_group_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to manage this group.' using errcode = '42501';
  end if;
  if not public.is_chat_group_creator(p_group_id) then
    raise exception 'Only the group creator can change the photo.' using errcode = '42501';
  end if;

  if p_path is not null and p_path not like 'group-avatar/' || p_group_id::text || '/%' then
    raise exception 'That file does not belong to this group.' using errcode = '22023';
  end if;

  update public.chat_groups set avatar_path = p_path where id = p_group_id;
end;
$$;

comment on function public.set_chat_group_avatar(uuid, text) is
  'Phase 2N: creator-only group picture; null clears it.';

revoke all on function public.set_chat_group_avatar(uuid, text) from public, anon;
grant execute on function public.set_chat_group_avatar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------

create or replace function public.add_chat_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null then
    raise exception 'Sign in to manage this group.' using errcode = '42501';
  end if;
  if not public.is_chat_group_creator(p_group_id) then
    raise exception 'Only the group creator can add people.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Choose someone else to add.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id
  ) then
    raise exception 'They are already in this group.' using errcode = '22023';
  end if;
  if not public.has_chatted_with(p_user_id) then
    raise exception 'You can only add people you have talked to.' using errcode = '22023';
  end if;

  select count(*)::integer into v_count
  from public.chat_group_members m
  where m.group_id = p_group_id;

  if v_count >= 50 then
    raise exception 'A group can hold up to 50 people.' using errcode = '22023';
  end if;

  insert into public.chat_group_members (group_id, user_id)
  values (p_group_id, p_user_id);
end;
$$;

comment on function public.add_chat_group_member(uuid, uuid) is
  'Phase 2N: creator-only add, limited to people they have chatted with.';

revoke all on function public.add_chat_group_member(uuid, uuid) from public, anon;
grant execute on function public.add_chat_group_member(uuid, uuid) to authenticated;

create or replace function public.remove_chat_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to manage this group.' using errcode = '42501';
  end if;
  if not public.is_chat_group_creator(p_group_id) then
    raise exception 'Only the group creator can remove people.' using errcode = '42501';
  end if;
  if p_user_id = v_me then
    raise exception 'Use leave_chat_group to leave the group.' using errcode = '22023';
  end if;

  delete from public.chat_group_members
  where group_id = p_group_id and user_id = p_user_id;

  if not found then
    raise exception 'They are not in this group.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.remove_chat_group_member(uuid, uuid) is
  'Phase 2N: creator-only removal; messages stay as history.';

revoke all on function public.remove_chat_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_chat_group_member(uuid, uuid) to authenticated;

create or replace function public.leave_chat_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_creator uuid;
  v_next uuid;
begin
  if v_me is null then
    raise exception 'Sign in to leave this group.' using errcode = '42501';
  end if;

  select g.created_by into v_creator
  from public.chat_groups g
  where g.id = p_group_id
  for update;

  if v_creator is null then
    raise exception 'This group no longer exists.' using errcode = '22023';
  end if;
  if not public.is_chat_group_member(p_group_id) then
    raise exception 'You are not in this group.' using errcode = '42501';
  end if;

  delete from public.chat_group_members
  where group_id = p_group_id and user_id = v_me;

  select m.user_id into v_next
  from public.chat_group_members m
  where m.group_id = p_group_id
  order by m.joined_at, m.user_id
  limit 1;

  if v_next is null then
    -- Last person out closes the room.
    delete from public.chat_groups where id = p_group_id;
  elsif v_creator = v_me then
    -- The group survives its creator; the earliest remaining member takes over
    -- so rename/picture/membership stay manageable.
    update public.chat_groups set created_by = v_next where id = p_group_id;
  end if;
end;
$$;

comment on function public.leave_chat_group(uuid) is
  'Phase 2N: any member may leave; ownership passes on or the empty group is deleted.';

revoke all on function public.leave_chat_group(uuid) from public, anon;
grant execute on function public.leave_chat_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reads the management sheet needs
-- ---------------------------------------------------------------------------

create or replace function public.chat_group_members_for_me(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  is_creator boolean
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
    g.created_by = m.user_id
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join public.profiles p on p.id = m.user_id
  where m.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
  order by m.joined_at, m.user_id;
$$;

comment on function public.chat_group_members_for_me(uuid) is
  'Phase 2N: members of a group the caller belongs to, with names and who runs it.';

revoke all on function public.chat_group_members_for_me(uuid) from public, anon;
grant execute on function public.chat_group_members_for_me(uuid) to authenticated;

-- The inbox list gains the picture path; the return shape changes, so the
-- function is replaced rather than patched.
drop function if exists public.chat_groups_for_me();

create function public.chat_groups_for_me()
returns table (
  group_id uuid,
  name text,
  created_by uuid,
  avatar_path text,
  last_body text,
  last_message_at timestamptz,
  unread_count integer,
  member_names text,
  member_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select g.id, g.name, g.created_by, g.avatar_path, m.last_read_at
    from public.chat_groups g
    join public.chat_group_members m on m.group_id = g.id
    where m.user_id = (select auth.uid())
  ),
  latest as (
    select distinct on (msg.group_id)
      msg.group_id,
      msg.body,
      msg.created_at
    from public.chat_group_messages msg
    join mine on mine.id = msg.group_id
    order by msg.group_id, msg.created_at desc
  ),
  unread as (
    select msg.group_id, count(*)::integer as n
    from public.chat_group_messages msg
    join mine on mine.id = msg.group_id
    where msg.sender_id <> (select auth.uid())
      and msg.created_at > mine.last_read_at
    group by msg.group_id
  ),
  people as (
    select
      mem.group_id,
      count(*)::integer as member_count,
      string_agg(
        coalesce(nullif(btrim(p.display_name), ''), 'Member'),
        ', '
        order by mem.joined_at
      ) as member_names
    from public.chat_group_members mem
    join mine on mine.id = mem.group_id
    left join public.profiles p on p.id = mem.user_id
    group by mem.group_id
  )
  select
    mine.id,
    mine.name,
    mine.created_by,
    mine.avatar_path,
    coalesce(latest.body, ''),
    latest.created_at,
    coalesce(unread.n, 0),
    coalesce(people.member_names, ''),
    coalesce(people.member_count, 0)
  from mine
  left join latest on latest.group_id = mine.id
  left join unread on unread.group_id = mine.id
  left join people on people.group_id = mine.id
  order by latest.created_at desc nulls last, mine.id
  limit 50;
$$;

comment on function public.chat_groups_for_me() is
  'Phase 2N: the caller''s groups, newest activity first, with avatar path.';

revoke all on function public.chat_groups_for_me() from public, anon;
grant execute on function public.chat_groups_for_me() to authenticated;
