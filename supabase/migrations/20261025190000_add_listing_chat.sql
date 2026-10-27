-- Chat between a student and the provider (agent or landlord) behind a listing.
--
-- Mirrors the roommate thread: messages are keyed by (listing_id, student_id),
-- so each student gets one conversation per room, and the provider answers all of
-- them from a single inbox. Bodies are append-only; the recipient may only set
-- read_at, which is what the "Seen" receipt reads.
--
-- Additive: one table, its grants and policies, realtime publication for it, and
-- one read-only RPC that gives a provider the thread list without exposing any
-- student's private profile columns.

create table public.listing_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- Thread key: the student who opened the conversation about this room.
  student_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  -- When the other participant read this message; null until then.
  read_at timestamptz,
  constraint listing_messages_body_length
    check (char_length(btrim(body)) between 1 and 1000)
);

comment on table public.listing_messages is
  'Phase 2H: messages between a student and the provider behind a listing. Bodies are append-only; the recipient may set read_at.';
comment on column public.listing_messages.student_id is
  'Thread key: the student who opened the conversation about this listing.';

create index listing_messages_thread_idx
  on public.listing_messages (listing_id, student_id, created_at);

-- Unread lookups for the provider inbox.
create index listing_messages_unread_idx
  on public.listing_messages (listing_id, student_id)
  where read_at is null;

alter table public.listing_messages enable row level security;

revoke all on table public.listing_messages from anon, authenticated;

grant select (id, listing_id, student_id, sender_id, body, created_at, read_at)
  on table public.listing_messages to authenticated;
grant insert (listing_id, student_id, sender_id, body)
  on table public.listing_messages to authenticated;
grant update (read_at)
  on table public.listing_messages to authenticated;

-- Either the student on their own thread, or the owner of the listing's provider.
create policy listing_messages_select_participants
  on public.listing_messages
  for select
  to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and public.owns_provider(l.provider_id)
    )
  );

-- Both sides write as themselves, and only into a thread they belong to. The room
-- must still be published (or be the writer's own listing), so an archived room
-- cannot be used as a messaging channel.
create policy listing_messages_insert_participants
  on public.listing_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and public.owns_provider(l.provider_id)
      )
    )
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and (
          l.publication_status = 'published'
          or public.owns_provider(l.provider_id)
        )
    )
  );

-- Only read_at is writable, and only by the participant who did not send it.
create policy listing_messages_mark_read
  on public.listing_messages
  for update
  to authenticated
  using (
    sender_id <> (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and public.owns_provider(l.provider_id)
      )
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and public.owns_provider(l.provider_id)
      )
    )
  );

-- Realtime: both sides see a reply as it arrives, and a read receipt when the
-- other opens the thread. Replica identity full carries the previous row on an
-- UPDATE, which is what lets the sender tell delivered from read.
alter table public.listing_messages replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'listing_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.listing_messages';
  end if;
end
$$;

-- The provider inbox: one row per (listing, student) thread on this provider's
-- rooms, newest first, with the last line and how many replies are unread.
-- SECURITY DEFINER because it needs the student's display name, and
-- public.profiles stays private to its owner.
create function public.listing_chat_threads()
returns table (
  listing_id uuid,
  listing_title text,
  student_id uuid,
  student_name text,
  last_body text,
  last_message_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select lm.*, l.title
    from public.listing_messages lm
    join public.listings l on l.id = lm.listing_id
    join public.providers p on p.id = l.provider_id
    where p.owner_id = (select auth.uid())
  ),
  latest as (
    select
      mine.*,
      row_number() over (
        partition by mine.listing_id, mine.student_id
        order by mine.created_at desc
      ) as position
    from mine
  ),
  unread as (
    select
      mine.listing_id,
      mine.student_id,
      count(*)::integer as unread_count
    from mine
    where mine.sender_id <> (select auth.uid())
      and mine.read_at is null
    group by mine.listing_id, mine.student_id
  )
  select
    latest.listing_id,
    latest.title,
    latest.student_id,
    coalesce(nullif(btrim(profiles.display_name), ''), 'Student') as student_name,
    latest.body,
    latest.created_at,
    coalesce(unread.unread_count, 0)
  from latest
  left join unread
    on unread.listing_id = latest.listing_id
   and unread.student_id = latest.student_id
  left join public.profiles on profiles.id = latest.student_id
  where latest.position = 1
  order by latest.created_at desc
  limit 50;
$$;

comment on function public.listing_chat_threads() is
  'Phase 2H: the caller''s listing conversations, newest first. Provider owners only.';

revoke all on function public.listing_chat_threads() from public, anon;
grant execute on function public.listing_chat_threads() to authenticated;
