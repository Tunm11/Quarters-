-- Property cards inside a group chat.
--
-- A group message may carry a room the sender wants everyone to look at, the
-- same way a roommate thread already can. The body keeps a readable sentence so
-- the message still makes sense anywhere the card is not rendered.
--
-- The thread RPC has to return the new column, so it is replaced rather than
-- patched in place.

alter table public.chat_group_messages
  add column shared_listing_id uuid references public.listings (id) on delete set null;

comment on column public.chat_group_messages.shared_listing_id is
  'Set when the message carries a property card; the listing the group was sent.';

create index chat_group_messages_shared_listing_idx
  on public.chat_group_messages (shared_listing_id)
  where shared_listing_id is not null;

revoke all on table public.chat_group_messages from anon, authenticated;

grant select (id, group_id, sender_id, body, created_at, shared_listing_id)
  on table public.chat_group_messages to authenticated;
grant insert (group_id, sender_id, body, shared_listing_id)
  on table public.chat_group_messages to authenticated;

drop function public.chat_group_thread(uuid);

create function public.chat_group_thread(p_group_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  shared_listing_id uuid
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
    msg.created_at,
    msg.shared_listing_id
  from public.chat_group_messages msg
  left join public.profiles p on p.id = msg.sender_id
  where msg.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
  order by msg.created_at
  limit 200;
$$;

comment on function public.chat_group_thread(uuid) is
  'Phase 2I: messages in a group the caller belongs to, oldest first, with any shared listing.';

revoke all on function public.chat_group_thread(uuid) from public, anon;
grant execute on function public.chat_group_thread(uuid) to authenticated;
