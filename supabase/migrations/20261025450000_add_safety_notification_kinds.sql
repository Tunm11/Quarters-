-- Notification kinds for the safety flows.
--
-- Kept in a migration of its own for the same reason as the saved-room kinds:
-- PostgreSQL may add an enum value inside a transaction, but nothing may use the
-- new value until that transaction commits. The trigger migration that follows
-- can then reference them without relying on lazy PL/pgSQL compilation.
--
--   roommate_blocked  the blocker's own confirmation, after a block is saved
--   report_decision   a moderator resolved or dismissed a report you filed
--   appeal_decision   a moderator approved or declined your re-review request

alter type public.notification_kind add value if not exists 'roommate_blocked';
alter type public.notification_kind add value if not exists 'report_decision';
alter type public.notification_kind add value if not exists 'appeal_decision';
