-- Phase 2C — read the signed-in applicant's own provider row.
--
-- providers.owner_id is deliberately absent from the client column grants, so
-- PostgREST cannot filter "where owner_id = auth.uid()" from the browser. The
-- providers_select_own policy still protects the row, but without a filter the
-- client cannot tell its own row apart from the other approved providers that
-- are public. This function is the smallest safe read path:
--
--   * no arguments, so it cannot be pointed at another account;
--   * SECURITY DEFINER with an empty search_path, matching the Phase 2B helper
--     style, and filtered by auth.uid() inside PostgreSQL;
--   * returns only the applicant-facing columns (never owner_id);
--   * EXECUTE is granted to authenticated only. anon and PUBLIC are revoked.
--
-- It adds no table privilege and changes no RLS policy. Listing publication is
-- still gated by public.is_approved_provider_owner() on the listings policies.

create function public.current_provider_application()
returns table (
  id uuid,
  kind public.provider_kind,
  display_name text,
  status public.provider_status,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.kind,
    p.display_name,
    p.status,
    p.created_at,
    p.updated_at
  from public.providers p
  where p.owner_id = (select auth.uid());
$$;

comment on function public.current_provider_application() is
  'Phase 2C: the signed-in user''s own provider application, or no rows. Never returns owner_id.';

revoke all on function public.current_provider_application() from public, anon;
grant execute on function public.current_provider_application() to authenticated;
