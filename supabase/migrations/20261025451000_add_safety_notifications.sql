-- Safety notifications: block confirmation, report decision, appeal decision.
--
-- These three events were copy only. Blocking a roommate, a moderator resolving
-- a report and a moderator deciding a verification re-review all happened in the
-- database, but none of them wrote an activity row, so the Bell badge never
-- moved and the existing push trigger (`notifications_send_push`) had nothing to
-- deliver. This migration closes that gap.
--
-- Every row is written by a trigger through public.notify_user(), the same
-- single insertion point as the interest, visit, room and saved-room alerts, so
-- delivery follows the normal path: an activity row, Realtime for the open app,
-- and one Web Push per registered browser through the send-push Edge Function.
--
-- Additive only: three trigger functions and three triggers. No existing rows
-- are rewritten and no columns are dropped.

------------------------------------------------------------------------------
-- Blocking
------------------------------------------------------------------------------

create function public.notify_roommate_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(nullif(btrim(new.blocked_display_name), ''), 'This student');

  -- Only the blocker hears about it. The blocked account is deliberately left
  -- unaware: telling someone they were blocked would tell the person who ended
  -- contact where to find the student who blocked them.
  perform public.notify_user(
    new.blocker_id,
    'roommate_blocked',
    'You blocked a roommate',
    v_name || ' can no longer see your roommate profile or message you, and you cannot message them. Undo this in Settings.',
    '/settings'
  );

  return new;
end;
$$;

comment on function public.notify_roommate_block() is
  'Phase 2F: confirms a block to the blocker. The blocked account is never notified.';

create trigger roommate_blocks_notify_blocker
  after insert on public.roommate_blocks
  for each row
  execute function public.notify_roommate_block();

------------------------------------------------------------------------------
-- Report decisions
------------------------------------------------------------------------------

create function public.notify_report_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
begin
  if new.status = old.status then
    return new;
  end if;

  -- `open` and `reviewing` are queue states: the reporter is notified once, when
  -- the report is decided, never while it waits.
  if new.status not in ('resolved', 'dismissed') then
    return new;
  end if;

  -- resolution_note is readable by the reporter, so quoting it back is not a new
  -- disclosure; it is trimmed because the column holds up to 500 characters.
  v_note := nullif(btrim(coalesce(new.resolution_note, '')), '');

  if new.status = 'resolved' then
    perform public.notify_user(
      new.reporter_id,
      'report_decision',
      'Your report was reviewed',
      'A moderator reviewed your report and took action where it was needed.'
        || case when v_note is null then '' else ' ' || left(v_note, 200) end
        || ' Thanks for helping keep QUARTERS safe.',
      '/notifications'
    );
  else
    perform public.notify_user(
      new.reporter_id,
      'report_decision',
      'Your report was reviewed',
      'A moderator reviewed your report and found no action was needed.'
        || case when v_note is null then '' else ' ' || left(v_note, 200) end
        || ' Thanks for helping keep QUARTERS safe.',
      '/notifications'
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_report_decision() is
  'Phase 2F: tells the reporter when a moderator resolves or dismisses their report.';

create trigger roommate_reports_notify_decision
  after update of status on public.roommate_reports
  for each row
  execute function public.notify_report_decision();

------------------------------------------------------------------------------
-- Verification re-review decisions
------------------------------------------------------------------------------

create function public.notify_verification_appeal_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('approved', 'declined') then
    return new;
  end if;

  v_note := nullif(btrim(coalesce(new.decision_note, '')), '');

  if new.status = 'approved' then
    perform public.notify_user(
      new.user_id,
      'appeal_decision',
      'Your re-review was approved',
      'A moderator approved your verification re-review. Your roommate profile is visible again.'
        || case when v_note is null then '' else ' ' || left(v_note, 200) end,
      '/roommates/verify'
    );
  else
    perform public.notify_user(
      new.user_id,
      'appeal_decision',
      'Your re-review was declined',
      'A moderator reviewed your re-review and kept the current decision.'
        || case when v_note is null then '' else ' ' || left(v_note, 200) end
        || ' You can request another review once something has changed.',
      '/roommates/verify'
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_verification_appeal_decision() is
  'Phase 2F: tells a student when their verification re-review is approved or declined.';

-- Fires both when a moderator resolves the appeal by hand and when the standing
-- sync trigger (roommate_verification_appeals_sync_decision) closes it after an
-- administrator changes the verification status.
create trigger roommate_verification_appeals_notify_decision
  after update of status on public.roommate_verification_appeals
  for each row
  execute function public.notify_verification_appeal_decision();
