-- Per-member read receipts for group chat.
--
-- Every member already carries their own read cursor in
-- chat_group_members.last_read_at, but nothing exposed it: a sender could not
-- tell whether the others had opened the thread, while room and roommate chats
-- have shown "Seen" all along.
--
-- chat_group_readers() returns the other members' cursors, so the thread can
-- label each of your messages with who has read past it. The caller is left out
-- because "Seen by you" is noise.
--
-- chat_group_members also joins the realtime publication, so a receipt lands
-- without a refresh the moment another member opens the group.

create or replace function public.chat_group_readers(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Member'),
    m.last_read_at
  from public.chat_group_members m
  left join public.profiles p on p.id = m.user_id
  where m.group_id = p_group_id
    and m.user_id <> (select auth.uid())
    and public.is_chat_group_member(p_group_id)
  order by m.joined_at, m.user_id;
$$;

comment on function public.chat_group_readers(uuid) is
  'Phase 2P: the other members of a group and how far each has read.';

revoke all on function public.chat_group_readers(uuid) from public, anon;
grant execute on function public.chat_group_readers(uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_group_members'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_group_members';
  end if;
end;
$$;
