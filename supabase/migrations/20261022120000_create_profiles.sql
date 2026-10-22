-- Stage 1 — authentication profile foundation.
--
-- One row per authenticated user. No roles, permissions, verification flags,
-- or listing data live here.
--
-- Profile rows are created by the client on the first authenticated session
-- (see src/auth/profile.ts), not by an auth.users trigger. That keeps the
-- strategy correct when email confirmation is enabled: an unconfirmed account
-- has no profile row until it actually has a session.
--
-- This migration is reviewed before it is applied. It has not been pushed to
-- the remote project.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 2 and 60),
  constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) between 1 and 2048)
);

comment on table public.profiles is
  'Stage 1: one profile row per authenticated user. Own-row access only.';
comment on column public.profiles.display_name is
  'Optional display name, 2-60 characters after trimming.';
comment on column public.profiles.avatar_url is
  'Optional avatar URL stored for a later stage; no upload flow exists yet.';

-- updated_at is maintained server-side. The function is SECURITY INVOKER with
-- an empty search_path and only runs as a trigger, so it cannot be used to
-- escalate privileges or resolve shadowed objects.
create function public.profiles_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Trigger functions do not need EXECUTE for the roles that fire them, and
-- Supabase's default privileges may grant EXECUTE directly to the API roles.
revoke all on function public.profiles_set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

-- Row-level security is the authorization boundary. RLS is enabled and no
-- policy exists for anonymous users, so unauthenticated requests return nothing.
alter table public.profiles enable row level security;

-- Least privilege: remove the default table grants, then hand out only what
-- the signed-in client needs. Column-level grants keep id, created_at, and
-- updated_at immutable; display_name and avatar_url are the only editable
-- fields. There is no delete grant and no delete policy.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name, avatar_url) on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- USING limits which rows can be targeted; WITH CHECK repeats the ownership
-- test against the new row so a profile id cannot be reassigned.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
