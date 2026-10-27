-- The student's side of listing chat: their own conversations, newest first.
--
-- The provider side already has listing_chat_threads(). A student needs the same
-- summary to see every room they have asked about without opening each property
-- page. SECURITY DEFINER only so the provider's public display name can be read
-- alongside the thread; the caller still only ever receives their own rows.

create function public.listing_chat_threads_for_student()
returns table (
  listing_id uuid,
  listing_title text,
  provider_name text,
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
    select lm.*, l.title, p.display_name as provider_name
    from public.listing_messages lm
    join public.listings l on l.id = lm.listing_id
    join public.providers p on p.id = l.provider_id
    where lm.student_id = (select auth.uid())
  ),
  latest as (
    select
      mine.*,
      row_number() over (
        partition by mine.listing_id
        order by mine.created_at desc
      ) as position
    from mine
  ),
  unread as (
    select
      mine.listing_id,
      count(*)::integer as unread_count
    from mine
    where mine.sender_id <> (select auth.uid())
      and mine.read_at is null
    group by mine.listing_id
  )
  select
    latest.listing_id,
    latest.title,
    latest.provider_name,
    latest.body,
    latest.created_at,
    coalesce(unread.unread_count, 0)
  from latest
  left join unread on unread.listing_id = latest.listing_id
  where latest.position = 1
  order by latest.created_at desc
  limit 50;
$$;

comment on function public.listing_chat_threads_for_student() is
  'Phase 2H: the caller''s own room conversations, newest first. Student side only.';

revoke all on function public.listing_chat_threads_for_student() from public, anon;
grant execute on function public.listing_chat_threads_for_student() to authenticated;
