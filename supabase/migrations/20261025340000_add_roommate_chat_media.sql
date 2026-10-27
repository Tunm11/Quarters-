-- Photos in roommate chat.
--
-- Room and group conversations already carry a photo (`image_path`) and a
-- property card; the roommate thread only had the card. This adds the column,
-- the insert/select grants, and a storage path that stays private to the two
-- people in that thread.
--
-- Object paths are:
--   chat-media/roommate/<profile_id>/<student_id>/<file>
--
-- The student id is part of the path on purpose: the profile folder alone is
-- shared by every student who ever messaged it, so the extra segment is what
-- lets can_access_chat_media() allow only the profile owner and that one
-- student to read the file.

alter table public.roommate_messages
  add column image_path text;

comment on column public.roommate_messages.image_path is
  'Object path in the private chat-media bucket, never a public URL.';

revoke all on table public.roommate_messages from anon, authenticated;

grant select (
  id, profile_id, student_id, sender_id, body, created_at, read_at,
  shared_listing_id, image_path
) on table public.roommate_messages to authenticated;
grant insert (
  profile_id, student_id, sender_id, body, shared_listing_id, image_path
) on table public.roommate_messages to authenticated;

-- Roommate media lives one folder deeper than room/group media, so the shared
-- access function learns that shape and keeps the old two-segment rules.
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
