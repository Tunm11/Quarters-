-- The reports one account has filed, across both report kinds.
--
-- A student could file a report about a roommate and about a listing and then
-- never see either again: roommate_reports is filtered to the reporter when
-- reading the table, but the subject's name sits on a profile the reporter may
-- no longer be able to read, and a resolved listing disappears. This one
-- function returns the caller's own reports with a readable subject, so the
-- safety screen can show what was reported and where it stands.
--
-- SECURITY DEFINER to resolve those names, pinned to the caller: the function
-- only ever returns rows whose reporter_id is auth.uid(), so it cannot be used
-- to read anyone else's reports or any other account's data.
--
-- Read-only and additive: no table, policy, grant or row is touched.

create function public.my_reports()
returns table (
  kind text,
  report_id uuid,
  subject text,
  reason text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'person'::text,
    r.id,
    -- The roommate profile's name if it is still there, otherwise the account's
    -- own display name, otherwise an honest placeholder.
    coalesce(
      nullif(btrim(rp.display_name), ''),
      nullif(btrim(prof.display_name), ''),
      'A student'
    ),
    r.reason,
    r.status,
    r.created_at
  from public.roommate_reports r
  left join public.roommate_profiles rp on rp.id = r.reported_profile_id
  left join public.profiles prof
    on prof.id = coalesce(r.reported_user_id, rp.user_id)
  where r.reporter_id = (select auth.uid())

  union all

  select
    'listing'::text,
    lr.id,
    coalesce(nullif(btrim(l.title), ''), 'A room that is no longer published'),
    lr.reason::text,
    lr.status::text,
    lr.created_at
  from public.listing_reports lr
  left join public.listings l on l.id = lr.listing_id
  where lr.reporter_id = (select auth.uid())

  order by created_at desc;
$$;

comment on function public.my_reports() is
  'The reports the caller filed (roommate and listing), newest first, with a readable subject.';

revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;
