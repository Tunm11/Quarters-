-- Message management: edit, delete for me, delete for everyone.
--
-- Until now every message table was append-only: `edited_at` and `deleted_at`
-- did not exist and clients had no update/delete grant at all. A typo lived
-- forever, a message sent to the wrong person could not be recalled, and nobody
-- could tidy their own view of a thread.
--
-- Three writes are supported, through RPCs only (no table grants change, so a
-- crafted request still cannot rewrite someone else's row):
--
--   edit_chat_message()                  — the sender, text still live;
--   delete_chat_message_for_everyone()   — the sender, tombstones the row so
--                                          the thread keeps its shape and the
--                                          attachment stops resolving;
--   hide_chat_message()                  — anyone who can see it, for their own
--                                          eyes only, via chat_hidden_messages.
--
-- A tombstone keeps the row and replaces the body with a neutral line, because
-- every body column is NOT NULL with a length check; `deleted_at` is what the UI
-- reads to render the placeholder and hide the photo or property card.
--
-- Chat surfaces share one vocabulary: kind is 'room' (listing chat), 'roommate'
-- or 'group'.

alter table public.listing_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.roommate_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.chat_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

comment on column public.listing_messages.edited_at is
  'Set when the sender last rewrote the text; drives the "(edited)" label.';
comment on column public.listing_messages.deleted_at is
  'Set when the sender deleted the message for everyone; body becomes a placeholder.';
comment on column public.roommate_messages.edited_at is
  'Set when the sender last rewrote the text; drives the "(edited)" label.';
comment on column public.roommate_messages.deleted_at is
  'Set when the sender deleted the message for everyone; body becomes a placeholder.';
comment on column public.chat_group_messages.edited_at is
  'Set when the sender last rewrote the text; drives the "(edited)" label.';
comment on column public.chat_group_messages.deleted_at is
  'Set when the sender deleted the message for everyone; body becomes a placeholder.';

-- Reading a thread needs to know whether a line was edited or withdrawn.
grant select (edited_at, deleted_at)
  on table public.listing_messages to authenticated;
grant select (edited_at, deleted_at)
  on table public.roommate_messages to authenticated;
grant select (edited_at, deleted_at)
  on table public.chat_group_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Per-viewer hides ("delete for me")
-- ---------------------------------------------------------------------------

create table if not exists public.chat_hidden_messages (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  message_id uuid not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, kind, message_id),
  constraint chat_hidden_messages_kind
    check (kind in ('room', 'roommate', 'group'))
);

comment on table public.chat_hidden_messages is
  'Phase 2O: messages a person removed from their own view. Nobody else is affected.';

alter table public.chat_hidden_messages enable row level security;

revoke all on table public.chat_hidden_messages from anon, authenticated;
grant select, insert, delete on table public.chat_hidden_messages to authenticated;

drop policy if exists chat_hidden_messages_own on public.chat_hidden_messages;

create policy chat_hidden_messages_own
  on public.chat_hidden_messages
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------

-- Whether the caller can see this message at all, in whichever surface it lives.
create or replace function public.can_see_chat_message(p_kind text, p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'room' then exists (
      select 1
      from public.listing_messages m
      join public.listings l on l.id = m.listing_id
      where m.id = p_message_id
        and (
          m.student_id = (select auth.uid())
          or public.owns_provider(l.provider_id)
        )
    )
    when 'roommate' then exists (
      select 1
      from public.roommate_messages m
      left join public.roommate_profiles p on p.id = m.profile_id
      where m.id = p_message_id
        and (
          m.student_id = (select auth.uid())
          or m.sender_id = (select auth.uid())
          or p.user_id = (select auth.uid())
        )
    )
    when 'group' then exists (
      select 1
      from public.chat_group_messages m
      where m.id = p_message_id
        and public.is_chat_group_member(m.group_id)
    )
    else false
  end;
$$;

comment on function public.can_see_chat_message(text, uuid) is
  'Phase 2O: true when the caller is a participant of the thread this message is in.';

revoke all on function public.can_see_chat_message(text, uuid) from public, anon;
grant execute on function public.can_see_chat_message(text, uuid) to authenticated;

create or replace function public.sent_chat_message(p_kind text, p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'room' then exists (
      select 1 from public.listing_messages m
      where m.id = p_message_id and m.sender_id = (select auth.uid())
    )
    when 'roommate' then exists (
      select 1 from public.roommate_messages m
      where m.id = p_message_id and m.sender_id = (select auth.uid())
    )
    when 'group' then exists (
      select 1 from public.chat_group_messages m
      where m.id = p_message_id and m.sender_id = (select auth.uid())
    )
    else false
  end;
$$;

comment on function public.sent_chat_message(text, uuid) is
  'Phase 2O: true when the caller is the author of this message.';

revoke all on function public.sent_chat_message(text, uuid) from public, anon;
grant execute on function public.sent_chat_message(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Edit
-- ---------------------------------------------------------------------------

create or replace function public.edit_chat_message(
  p_kind text,
  p_message_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null then
    raise exception 'Sign in to change this message.' using errcode = '42501';
  end if;

  if not public.can_see_chat_message(p_kind, p_message_id) then
    raise exception 'That message is not in one of your conversations.' using errcode = '42501';
  end if;

  if not public.sent_chat_message(p_kind, p_message_id) then
    raise exception 'You can only edit your own messages.' using errcode = '42501';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Keep the message to 1–1000 characters.' using errcode = '22023';
  end if;

  if p_kind = 'room' then
    update public.listing_messages
    set body = v_body, edited_at = now()
    where id = p_message_id and deleted_at is null;
  elsif p_kind = 'roommate' then
    update public.roommate_messages
    set body = v_body, edited_at = now()
    where id = p_message_id and deleted_at is null;
  elsif p_kind = 'group' then
    update public.chat_group_messages
    set body = v_body, edited_at = now()
    where id = p_message_id and deleted_at is null;
  else
    raise exception 'Unknown chat surface.' using errcode = '22023';
  end if;

  if not found then
    raise exception 'This message was deleted, so it cannot be edited.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.edit_chat_message(text, uuid, text) is
  'Phase 2O: the sender rewrites their own live message; stamps edited_at.';

revoke all on function public.edit_chat_message(text, uuid, text) from public, anon;
grant execute on function public.edit_chat_message(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete for everyone
-- ---------------------------------------------------------------------------

create or replace function public.delete_chat_message_for_everyone(
  p_kind text,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_placeholder constant text := 'This message was deleted';
begin
  if v_me is null then
    raise exception 'Sign in to delete this message.' using errcode = '42501';
  end if;

  if not public.can_see_chat_message(p_kind, p_message_id) then
    raise exception 'That message is not in one of your conversations.' using errcode = '42501';
  end if;

  if not public.sent_chat_message(p_kind, p_message_id) then
    raise exception 'You can only delete your own messages for everyone.' using errcode = '42501';
  end if;

  -- Attachments stop resolving: the path and the shared card are cleared so no
  -- bubble can still fetch the photo or show the property.
  if p_kind = 'room' then
    update public.listing_messages
    set body = v_placeholder, deleted_at = now(),
        image_path = null, shared_listing_id = null
    where id = p_message_id and deleted_at is null;
  elsif p_kind = 'roommate' then
    update public.roommate_messages
    set body = v_placeholder, deleted_at = now(),
        image_path = null, shared_listing_id = null
    where id = p_message_id and deleted_at is null;
  elsif p_kind = 'group' then
    update public.chat_group_messages
    set body = v_placeholder, deleted_at = now(), image_path = null
    where id = p_message_id and deleted_at is null;
  else
    raise exception 'Unknown chat surface.' using errcode = '22023';
  end if;

  if not found then
    raise exception 'This message was already deleted.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.delete_chat_message_for_everyone(text, uuid) is
  'Phase 2O: the sender withdraws their message for the whole thread.';

revoke all on function public.delete_chat_message_for_everyone(text, uuid) from public, anon;
grant execute on function public.delete_chat_message_for_everyone(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete for me
-- ---------------------------------------------------------------------------

create or replace function public.hide_chat_message(p_kind text, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to remove this message.' using errcode = '42501';
  end if;

  if not public.can_see_chat_message(p_kind, p_message_id) then
    raise exception 'That message is not in one of your conversations.' using errcode = '42501';
  end if;

  insert into public.chat_hidden_messages (user_id, kind, message_id)
  values (v_me, p_kind, p_message_id)
  on conflict (user_id, kind, message_id) do nothing;
end;
$$;

comment on function public.hide_chat_message(text, uuid) is
  'Phase 2O: removes a message from the caller''s view only.';

revoke all on function public.hide_chat_message(text, uuid) from public, anon;
grant execute on function public.hide_chat_message(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Thread reads exclude what this viewer hid
-- ---------------------------------------------------------------------------

drop policy if exists listing_messages_select_participants on public.listing_messages;

create policy listing_messages_select_participants
  on public.listing_messages
  for select
  to authenticated
  using (
    (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and public.owns_provider(l.provider_id)
      )
    )
    and not exists (
      select 1
      from public.chat_hidden_messages h
      where h.user_id = (select auth.uid())
        and h.kind = 'room'
        and h.message_id = listing_messages.id
    )
  );

drop policy if exists roommate_messages_select_participants on public.roommate_messages;

create policy roommate_messages_select_participants
  on public.roommate_messages
  for select
  to authenticated
  using (
    (
      sender_id = (select auth.uid())
      or student_id = (select auth.uid())
      or exists (
        select 1
        from public.roommate_profiles p
        where p.id = profile_id
          and p.user_id = (select auth.uid())
      )
    )
    and not exists (
      select 1
      from public.chat_hidden_messages h
      where h.user_id = (select auth.uid())
        and h.kind = 'roommate'
        and h.message_id = roommate_messages.id
    )
  );

-- The group thread is read through a SECURITY DEFINER RPC, which bypasses RLS,
-- so it filters hides itself. The return shape grows, so it is replaced.
drop function if exists public.chat_group_thread(uuid);

create function public.chat_group_thread(p_group_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  shared_listing_id uuid,
  image_path text,
  edited_at timestamptz,
  deleted_at timestamptz
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
    msg.image_path,
    msg.edited_at,
    msg.deleted_at
  from public.chat_group_messages msg
  left join public.profiles p on p.id = msg.sender_id
  where msg.group_id = p_group_id
    and public.is_chat_group_member(p_group_id)
    and not exists (
      select 1
      from public.chat_hidden_messages h
      where h.user_id = (select auth.uid())
        and h.kind = 'group'
        and h.message_id = msg.id
    )
  order by msg.created_at
  limit 200;
$$;

comment on function public.chat_group_thread(uuid) is
  'Phase 2O: group messages the caller has not hidden, oldest first, with edit and delete state.';

revoke all on function public.chat_group_thread(uuid) from public, anon;
grant execute on function public.chat_group_thread(uuid) to authenticated;
