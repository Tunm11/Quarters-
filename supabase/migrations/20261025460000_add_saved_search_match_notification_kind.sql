-- Notification kind for a room that matches a saved search.
--
-- Its own migration: PostgreSQL can add an enum value inside a transaction, but
-- nothing may use the new value until that transaction commits. Keeping the
-- addition here lets the trigger migration that follows reference it without
-- relying on lazy PL/pgSQL compilation.

alter type public.notification_kind add value if not exists 'saved_search_match';
