-- Notification kinds for rooms a student saved.
--
-- One migration of its own: PostgreSQL can add an enum value inside a
-- transaction, but nothing may use the new value until that transaction
-- commits. Keeping the additions here lets the trigger migration that follows
-- reference them without relying on lazy PL/pgSQL compilation.

alter type public.notification_kind add value if not exists 'saved_room_price_changed';
alter type public.notification_kind add value if not exists 'saved_room_availability_changed';
alter type public.notification_kind add value if not exists 'saved_room_available';
