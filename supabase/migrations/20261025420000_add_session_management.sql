-- Session and device management.
--
-- Supabase Auth keeps one row per sign-in in auth.sessions, and every access
-- token carries a `session_id` claim matching that row's id. A client session
-- has no read or delete rights on the auth schema, so this migration exposes
-- exactly two SECURITY DEFINER functions, both scoped to the caller:
--
--   * list_own_sessions()             -> the caller's active sessions, newest
--                                        activity first, flagging the session
--                                        making the call
--   * revoke_own_session(uuid)        -> deletes one of the caller's sessions,
--                                        which revokes its refresh token
--
-- "Sign out of this device" and "sign out of all devices" need no SQL: they are
-- supabase.auth.signOut({ scope }) with local/global scope.
--
-- The functions read auth.sessions but never expose another account's rows: the
-- WHERE clause is bound to auth.uid(), and EXECUTE is granted to authenticated
-- only (anon keeps no grant). Additive: two functions and their grants.

-- ---------------------------------------------------------------------------
-- List the caller's sessions
-- ---------------------------------------------------------------------------

create or replace function public.list_own_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    -- refreshed_at is a timestamp without time zone; GoTrue writes it in UTC.
    coalesce(s.refreshed_at at time zone 'UTC', s.updated_at) as last_active_at,
    s.user_agent,
    host(s.ip) as ip,
    coalesce(s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid, false) as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by last_active_at desc nulls last, s.created_at desc;
$$;

comment on function public.list_own_sessions() is
  'Session management: lists the caller''s own Supabase sessions (device, first seen, last refresh, IP) and flags the calling session.';

revoke all on function public.list_own_sessions() from public, anon;
grant execute on function public.list_own_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke one of the caller's sessions
-- ---------------------------------------------------------------------------

create or replace function public.revoke_own_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in to manage your sessions.' using errcode = '42501';
  end if;

  -- The user_id condition is what stops one account ending another's session.
  delete from auth.sessions s
  where s.id = p_session_id
    and s.user_id = caller;

  if not found then
    raise exception 'That session is no longer active.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.revoke_own_session(uuid) is
  'Session management: deletes one of the caller''s sessions. Its refresh token stops working immediately; its current access token simply expires.';

revoke all on function public.revoke_own_session(uuid) from public, anon;
grant execute on function public.revoke_own_session(uuid) to authenticated;
