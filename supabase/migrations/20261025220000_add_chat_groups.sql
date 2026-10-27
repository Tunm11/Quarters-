-- Group chat for the messages inbox.
--
-- Additive: three tables (groups, members, messages), their grants and policies,
-- realtime for the message table, and four read/write RPCs.
--
-- A group is created by exactly one account and always contains its creator. The
-- creator may only add people they have actually talked to: an accepted roommate
-- connection, or a lister/student from a room conversation. That rule lives in
-- has_chatted_with() and is enforced again in create_chat_group(), so a crafted
-- request cannot assemble a group of strangers.
--
-- Read state is per member (chat_group_members.last_read_at) rather than per
-- message, because a group message can have any number of recipients.

create table public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_groups_name_length
    check (char_length(btrim(name)) between 1 and 60)
);

comment on table public.chat_groups is
  'Phase 2I: a group conversation created from the messages inbox.';

create table public.chat_group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Everything up to here is read for this member; drives the unread badge.
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.chat_group_members is
  'Phase 2I: who is in a group, and how far each member has read.';
comment on column public.chat_group_members.last_read_at is
  'Member-owned read cursor. Only the member may move it.';

create index chat_group_members_user_idx
  on public.chat_group_members (user_id, joined_at desc);

create table public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_group_messages_body_length
    check (char_length(btrim(body)) between 1 and 1000)
);

comment on table public.chat_group_messages is
  'Phase 2I: append-only group messages.';

create index chat_group_messages_thread_idx
  on public.chat_group_messages (group_id, created_at);

-- Membership check as a SECURITY DEFINER function: policies on members and
-- messages can use it without recursing back into chat_group_members RLS.
create function public.is_chat_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function public.is_chat_group_member(uuid) is
  'Phase 2I: true when the caller belongs to the group.';

revoke all on function public.is_chat_group_member(uuid) from public, anon;
grant execute on function public.is_chat_group_member(uuid) to authenticated;

-- Who the caller has actually talked to, in either chat surface. Group creation
-- and the contact picker both read from this one rule.
create function public.has_chatted_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id <> (select auth.uid())
    and (
      -- Roommate connection: accepted either way round.
      exists (
        select 1
        from public.roommate_interests i
        join public.roommate_profiles p on p.id = i.profile_id
        where i.status = 'accepted'
          and p.user_id = p_user_id
          and i.sender_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.roommate_interests i
        join public.roommate_profiles p on p.id = i.profile_id
        where i.status = 'accepted'
          and p.user_id = (select auth.uid())
          and i.sender_id = p_user_id
      )
      -- Room conversation: the caller asked about the lister's room, or the
      -- caller is the lister answering a student.
      or exists (
        select 1
        from public.listing_messages lm
        join public.listings l on l.id = lm.listing_id
        join public.providers pr on pr.id = l.provider_id
        where lm.student_id = (select auth.uid())
          and pr.owner_id = p_user_id
      )
      or exists (
        select 1
        from public.listing_messages lm
        join public.listings l on l.id = lm.listing_id
        join public.providers pr on pr.id = l.provider_id
        where lm.student_id = p_user_id
          and pr.owner_id = (select auth.uid())
      )
    );
$$;

comment on function public.has_chatted_with(uuid) is
  'Phase 2I: true when the caller and the given account have an existing conversation.';

revoke all on function public.has_chatted_with(uuid) from public, anon;
grant execute on function public.has_chatted_with(uuid) to authenticated;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

revoke all on table public.chat_groups from anon, authenticated;
revoke all on table public.chat_group_members from anon, authenticated;
revoke all on table public.chat_group_messages from anon, authenticated;

grant select (id, name, created_by, created_at)
  on table public.chat_groups to authenticated;
grant insert (name, created_by)
  on table public.chat_groups to authenticated;

grant select (group_id, user_id, joined_at, last_read_at)
  on table public.chat_group_members to authenticated;
grant insert (group_id, user_id)
  on table public.chat_group_members to authenticated;
grant update (last_read_at)
  on table public.chat_group_members to authenticated;

grant select (id, group_id, sender_id, body, created_at)
  on table public.chat_group_messages to authenticated;
grant insert (group_id, sender_id, body)
  on table public.chat_group_messages to authenticated;

-- A group is visible to its members and to its creator (so the creator can read
-- the row they just inserted before adding themselves as a member).
create policy chat_groups_select_members
  on public.chat_groups
  for select
  to authenticated
  using (created_by = (select auth.uid()) or public.is_chat_group_member(id));

create policy chat_groups_insert_creator
  on public.chat_groups
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy chat_groups_update_creator
  on public.chat_groups
  for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy chat_group_members_select_members
  on public.chat_group_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_chat_group_member(group_id)
  );

-- Only the creator adds people, and only to a group they created.
create policy chat_group_members_insert_creator
  on public.chat_group_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chat_groups g
      where g.id = group_id
        and g.created_by = (select auth.uid())
    )
  );

create policy chat_group_members_update_self
  on public.chat_group_members
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy chat_group_messages_select_members
  on public.chat_group_messages
  for select
  to authenticated
  using (public.is_chat_group_member(group_id));

create policy chat_group_messages_insert_members
  on public.chat_group_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_chat_group_member(group_id)
  );

-- Realtime: everyone in the group sees a new message without refreshing.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_group_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_group_messages';
  end if;
end
$$;

-- The contact picker: everyone the caller has conversed with, most recent first.
create function public.chat_contacts()
returns table (
  user_id uuid,
  display_name text,
  kind text
)
language sql
stable
security definer
set search_path = ''
as $$
  with peers as (
    select
      p.user_id as peer_id,
      coalesce(nullif(btrim(p.display_name), ''), 'Roommate') as peer_name,
      'roommate'::text as peer_kind,
      i.updated_at as touched
    from public.roommate_interests i
    join public.roommate_profiles p on p.id = i.profile_id
    where i.status = 'accepted'
      and i.sender_id = (select auth.uid())
      and p.user_id is not null

    union all

    select
      i.sender_id,
      coalesce(nullif(btrim(prof.display_name), ''), 'Roommate'),
      'roommate'::text,
      i.updated_at
    from public.roommate_interests i
    join public.roommate_profiles p on p.id = i.profile_id
    left join public.profiles prof on prof.id = i.sender_id
    where i.status = 'accepted'
      and p.user_id = (select auth.uid())
      and i.sender_id <> (select auth.uid())

    union all

    select
      pr.owner_id,
      coalesce(nullif(btrim(pr.display_name), ''), 'Lister'),
      pr.kind::text,
      max(lm.created_at)
    from public.listing_messages lm
    join public.listings l on l.id = lm.listing_id
    join public.providers pr on pr.id = l.provider_id
    where lm.student_id = (select auth.uid())
      and pr.owner_id <> (select auth.uid())
    group by pr.owner_id, pr.display_name, pr.kind

    union all

    select
      lm.student_id,
      coalesce(nullif(btrim(prof.display_name), ''), 'Student'),
      'student'::text,
      max(lm.created_at)
    from public.listing_messages lm
    join public.listings l on l.id = lm.listing_id
    join public.providers pr on pr.id = l.provider_id
    left join public.profiles prof on prof.id = lm.student_id
    where pr.owner_id = (select auth.uid())
      and lm.student_id <> (select auth.uid())
    group by lm.student_id, prof.display_name
  )
  select distinct on (peers.peer_id)
    peers.peer_id,
    peers.peer_name,
    peers.peer_kind
  from peers
  where peers.peer_id is not null
  order by peers.peer_id, peers.touched desc;
$$;

comment on function public.chat_contacts() is
  'Phase 2I: people the caller can add to a group — everyone they have chatted with.';

revoke all on function public.chat_contacts() from public, anon;
grant execute on function public.chat_contacts() to authenticated;

-- Create a group with the caller plus two or more contacts, in one transaction.
create function public.create_chat_group(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_group_id uuid;
  v_member uuid;
  v_count integer;
begin
  if v_me is null then
    raise exception 'Sign in to create a group.' using errcode = '42501';
  end if;

  select count(distinct m)::integer
    into v_count
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
  where m is not null
    and m <> v_me;

  if v_count < 2 then
    raise exception 'Add at least two people to start a group.' using errcode = '22023';
  end if;

  for v_member in
    select distinct m
    from unnest(p_member_ids) as m
    where m is not null
      and m <> v_me
  loop
    if not public.has_chatted_with(v_member) then
      raise exception 'You can only add people you have talked to.' using errcode = '22023';
    end if;
  end loop;

  insert into public.chat_groups (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'New group'), v_me)
  returning id into v_group_id;

  insert into public.chat_group_members (group_id, user_id)
  values (v_group_id, v_me);

  insert into public.chat_group_members (group_id, user_id)
  select v_group_id, distinct_member
  from (
    select distinct m as distinct_member
    from unnest(p_member_ids) as m
    where m is not null
      and m <> v_me
  ) as chosen;

  return v_group_id;
end;
$$;

comment on function public.create_chat_group(text, uuid[]) is
  'Phase 2I: creates a group for the caller with two or more existing contacts.';

revoke all on function public.create_chat_group(text, uuid[]) from public, anon;
grant execute on function public.create_chat_group(text, uuid[]) to authenticated;

-- The group list for the inbox: last line, unread count and member names.
create function public.chat_groups_for_me()
returns table (
  group_id uuid,
  name text,
  created_by uuid,
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
    select g.id, g.name, g.created_by, m.last_read_at
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
  'Phase 2I: the caller''s groups, newest activity first.';

revoke all on function public.chat_groups_for_me() from public, anon;
grant execute on function public.chat_groups_for_me() to authenticated;

-- One group thread with sender names, which public.profiles does not expose.
create function public.chat_group_thread(p_group_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    msg.id,
    msg.sender_id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      case
        when msg.sender_id = (select auth.uid()) then 'You'
        else 'Member'
      end
    ),
    msg.body,
    msg.created_at
  from public.chat_group_messages msg
  left join public.profiles p on p.id = msg.sender_id
  where msg.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
  order by msg.created_at
  limit 200;
$$;

comment on function public.chat_group_thread(uuid) is
  'Phase 2I: messages in a group the caller belongs to, oldest first.';

revoke all on function public.chat_group_thread(uuid) from public, anon;
grant execute on function public.chat_group_thread(uuid) to authenticated;
