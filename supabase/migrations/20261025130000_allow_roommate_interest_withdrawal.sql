-- Roommate connections, part 3: the sender withdraws.
--
-- Interests were write-once for the sender (pending rows, no updates). A
-- student who changes their mind must be able to cancel the interest they sent,
-- so this adds one update policy scoped to their own rows.
--
-- The status column grant already exists (it was added for profile owners), and
-- the existing owner policy only covers interests addressed to profiles the
-- caller owns. Permissive policies are OR'd, so this one simply adds the
-- sender's own transition:
--
--   pending  -> withdrawn   cancel an unanswered interest
--   withdrawn -> pending    send interest again later
--
-- Accepted and declined interests are deliberately out of reach here: a
-- connection is not silently dropped, and a decision is not undone.

create policy roommate_interests_update_own
  on public.roommate_interests
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and status in ('pending', 'withdrawn')
  )
  with check (
    sender_id = (select auth.uid())
    and status in ('pending', 'withdrawn')
  );

comment on column public.roommate_interests.status is
  'pending | accepted | declined | withdrawn. Senders may withdraw a pending interest and re-open a withdrawn one; profile owners may accept or decline.';
