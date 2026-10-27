-- "Seen" receipts for roommate chat.
--
-- Messages stay append-only for their author, but the other participant has to
-- be able to record that a message was read. One nullable timestamp per message
-- does that: null means unread, a value means the recipient opened the thread
-- after it was sent.
--
-- Additive: one column, one extra readable column, one update grant limited to
-- that column, and one policy. No message body, sender or thread key can be
-- changed by a client.

alter table public.roommate_messages
  add column read_at timestamptz;

comment on column public.roommate_messages.read_at is
  'When the other participant read this message; null until then.';

-- read_at joins the readable columns so both sides can see receipts.
grant select (id, profile_id, student_id, sender_id, body, created_at, read_at)
  on table public.roommate_messages to authenticated;

-- Only read_at is writable, and only by the participant who did not send it.
grant update (read_at) on table public.roommate_messages to authenticated;

create policy roommate_messages_mark_read
  on public.roommate_messages
  for update
  to authenticated
  using (
    sender_id <> (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.roommate_profiles p
        where p.id = profile_id
          and p.user_id = (select auth.uid())
      )
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and (
      student_id = (select auth.uid())
      or exists (
        select 1
        from public.roommate_profiles p
        where p.id = profile_id
          and p.user_id = (select auth.uid())
      )
    )
  );

comment on table public.roommate_messages is
  'Phase 2E: messages between a student and the owner of a roommate profile. Bodies are append-only; the recipient may set read_at.';
