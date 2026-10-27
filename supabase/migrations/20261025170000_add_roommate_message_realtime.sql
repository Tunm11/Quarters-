-- Realtime for the roommate chat.
--
-- The thread was pull-only: a reply from the other participant appeared only
-- when the tab regained focus. Publishing roommate_messages to Supabase Realtime
-- lets both sides receive new messages and "Seen" stamps as they happen.
--
-- RLS still decides who may see each row; the publication only exposes the
-- change stream. Replica identity is set to full so an UPDATE (a read receipt)
-- carries the previous row too, which is what lets the sender's client tell a
-- freshly delivered message from one that was just read.

alter table public.roommate_messages replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'roommate_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.roommate_messages';
  end if;
end
$$;
