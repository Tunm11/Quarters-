-- Visit requests, part 2: the visitor cancels.
--
-- Requests were append-only for clients. A student who no longer needs the
-- viewing must be able to cancel it, but not at the last minute: the provider
-- may already be travelling to the property. The using clause enforces the
-- same 24-hour cutoff the app shows as a warning, so a stale tab or a crafted
-- request cannot bypass it. The cancelled status is already part of the enum.

grant update (status) on table public.listing_viewing_requests to authenticated;

create policy listing_viewing_requests_cancel_own
  on public.listing_viewing_requests
  for update
  to authenticated
  using (
    requester_id = (select auth.uid())
    and status in ('pending', 'confirmed')
    and scheduled_for > now() + interval '24 hours'
  )
  with check (status = 'cancelled');

comment on column public.listing_viewing_requests.status is
  'pending | confirmed | declined | cancelled | completed. Clients may only insert pending requests and cancel their own pending or confirmed request more than 24 hours before it starts.';
