-- Attachments in chat: a photo, a property card, or both alongside text.
--
-- Object paths are strictly:
--   chat-media/group/<group_id>/<file>   — readable by that group's members
--   chat-media/room/<listing_id>/<file>  — readable while the room is public
--
-- The bucket is private; every object read is checked against the database by
-- can_access_chat_media(), so a leaked path alone is not enough. A room's chat
-- photos are treated like its listing photos: the room is public, the file name
-- is a random UUID, and only people signed in can sign a URL for it. A group's
-- photos stay inside the group.
--
-- The message tables gain `image_path` (the object path, not a URL) and listing
-- messages gain `shared_listing_id`, so a bubble can carry a photo, a property
-- card, or a photo and a caption.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      name = excluded.name,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function public.can_access_chat_media(object_name text)
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
  if array_length(parts, 1) is distinct from 2 then
    return false;
  end if;

  begin
    target := parts[2]::uuid;
  exception when others then
    return false;
  end;

  if parts[1] = 'group' then
    return public.is_chat_group_member(target);
  end if;

  if parts[1] = 'room' then
    return public.is_public_listing(target);
  end if;

  return false;
end;
$$;

comment on function public.can_access_chat_media(text) is
  'Phase 2I: whether the caller may read or write this chat-media object path.';

revoke all on function public.can_access_chat_media(text) from public, anon;
grant execute on function public.can_access_chat_media(text) to authenticated;

drop policy if exists chat_media_read on storage.objects;
drop policy if exists chat_media_insert on storage.objects;

create policy chat_media_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and public.can_access_chat_media(name)
  );

create policy chat_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.can_access_chat_media(name)
  );

-- ---------------------------------------------------------------------------
-- Message columns
-- ---------------------------------------------------------------------------

alter table public.listing_messages
  add column shared_listing_id uuid references public.listings (id) on delete set null,
  add column image_path text;

comment on column public.listing_messages.shared_listing_id is
  'Set when the message carries a property card; the listing that was shared.';
comment on column public.listing_messages.image_path is
  'Object path in the private chat-media bucket, never a public URL.';

alter table public.chat_group_messages
  add column image_path text;

comment on column public.chat_group_messages.image_path is
  'Object path in the private chat-media bucket, never a public URL.';

revoke all on table public.listing_messages from anon, authenticated;

grant select (
  id, listing_id, student_id, sender_id, body, created_at, read_at,
  shared_listing_id, image_path
) on table public.listing_messages to authenticated;
grant insert (
  listing_id, student_id, sender_id, body, shared_listing_id, image_path
) on table public.listing_messages to authenticated;
grant update (read_at) on table public.listing_messages to authenticated;

revoke all on table public.chat_group_messages from anon, authenticated;

grant select (id, group_id, sender_id, body, created_at, shared_listing_id, image_path)
  on table public.chat_group_messages to authenticated;
grant insert (group_id, sender_id, body, shared_listing_id, image_path)
  on table public.chat_group_messages to authenticated;

-- The group thread RPC learns about the attachment path; the return shape
-- changes, so it is replaced rather than patched.
drop function public.chat_group_thread(uuid);

create function public.chat_group_thread(p_group_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  shared_listing_id uuid,
  image_path text
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
    msg.shared_listing_id,
    msg.image_path
  from public.chat_group_messages msg
  left join public.profiles p on p.id = msg.sender_id
  where msg.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
  order by msg.created_at
  limit 200;
$$;

comment on function public.chat_group_thread(uuid) is
  'Phase 2I: messages in a group the caller belongs to, oldest first, with any shared listing or photo.';

revoke all on function public.chat_group_thread(uuid) from public, anon;
grant execute on function public.chat_group_thread(uuid) to authenticated;
