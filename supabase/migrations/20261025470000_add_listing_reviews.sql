-- Reviews and ratings for published rooms.
--
-- A review is only worth trusting if the person writing it has actually been to
-- the property, so an insert is gated on evidence the account already produced
-- elsewhere in the app: a completed viewing request, or a room reservation in
-- that listing. The same rule decides whether the page offers "Write a review"
-- at all, through listing_review_basis().
--
-- The rating is a whole number of stars: half-star averages are computed, never
-- stored. One review per reviewer per listing, editable afterwards so a student
-- can correct themselves instead of posting twice.

create type public.listing_review_basis as enum ('visit', 'reservation');

comment on type public.listing_review_basis is
  'How the reviewer knows the property: completed a visit, or holds a room.';

create table public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- Never exposed through the table's column grants: reviews are shown without
  -- the reviewer's identity.
  author_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null,
  body text not null,
  basis public.listing_review_basis not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_reviews_rating_range check (rating between 1 and 5),
  constraint listing_reviews_body_length
    check (char_length(btrim(body)) between 20 and 1500),
  constraint listing_reviews_one_per_author unique (listing_id, author_id)
);

comment on table public.listing_reviews is
  'Student reviews of a listing. Verified: the author completed a visit or holds a room.';
comment on column public.listing_reviews.author_id is
  'The student who wrote it. Not client-readable, so reviews are anonymous on screen.';
comment on column public.listing_reviews.basis is
  'The evidence the insert policy checked: a completed visit or a room reservation.';

create index listing_reviews_listing_idx
  on public.listing_reviews (listing_id, created_at desc);

create trigger listing_reviews_touch_updated_at
  before update on public.listing_reviews
  for each row execute function public.touch_updated_at();

alter table public.listing_reviews enable row level security;

revoke all on table public.listing_reviews from anon, authenticated;

grant select (id, listing_id, rating, body, basis, created_at, updated_at)
  on table public.listing_reviews to anon, authenticated;

-- author_id is insertable by the author only (the policy re-checks auth.uid());
-- it is absent from the update grant, so a review cannot change hands.
grant insert (listing_id, author_id, rating, body, basis)
  on table public.listing_reviews to authenticated;

grant update (rating, body) on table public.listing_reviews to authenticated;

grant delete on table public.listing_reviews to authenticated;

-- Which evidence, if any, does the caller have for this listing? A reservation
-- outranks a visit because it is the stronger claim. Defined before the insert
-- policy that calls it: PostgreSQL validates a policy's expression when the
-- policy is created.
create function public.listing_review_basis(target_listing_id uuid)
returns public.listing_review_basis
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1
      from public.listing_room_bookings b
      where b.listing_id = target_listing_id
        and b.booked_by = (select auth.uid())
    ) then 'reservation'::public.listing_review_basis
    when exists (
      select 1
      from public.listing_viewing_requests r
      where r.listing_id = target_listing_id
        and r.requester_id = (select auth.uid())
        and r.status = 'completed'
    ) then 'visit'::public.listing_review_basis
  end;
$$;

comment on function public.listing_review_basis(uuid) is
  'The caller''s evidence for reviewing this listing, or null when they have none.';

revoke all on function public.listing_review_basis(uuid) from public, anon;
grant execute on function public.listing_review_basis(uuid) to authenticated;

create policy listing_reviews_select_public_listing
  on public.listing_reviews
  for select
  to anon, authenticated
  using (public.is_public_listing(listing_id));

create policy listing_reviews_select_admin
  on public.listing_reviews
  for select
  to authenticated
  using (public.is_admin());

create policy listing_reviews_insert_verified
  on public.listing_reviews
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_public_listing(listing_id)
    -- The claimed basis must match the evidence: a student cannot present a
    -- visit as a stay, and an unengaged account gets null and is refused.
    and basis = public.listing_review_basis(listing_id)
  );

create policy listing_reviews_update_own
  on public.listing_reviews
  for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy listing_reviews_delete_own
  on public.listing_reviews
  for delete
  to authenticated
  using (author_id = (select auth.uid()));

create policy listing_reviews_delete_admin
  on public.listing_reviews
  for delete
  to authenticated
  using (public.is_admin());

-- Aggregate for the rating summary. SECURITY DEFINER so the counts cover every
-- review while the caller still cannot read author_id.
create function public.listing_review_summary(target_listing_id uuid)
returns table (
  total integer,
  average numeric,
  five integer,
  four integer,
  three integer,
  two integer,
  one integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select r.rating
    from public.listing_reviews r
    where r.listing_id = target_listing_id
      and public.is_public_listing(target_listing_id)
  )
  select
    count(*)::integer,
    round(avg(rating)::numeric, 2),
    count(*) filter (where rating = 5)::integer,
    count(*) filter (where rating = 4)::integer,
    count(*) filter (where rating = 3)::integer,
    count(*) filter (where rating = 2)::integer,
    count(*) filter (where rating = 1)::integer
  from visible;
$$;

comment on function public.listing_review_summary(uuid) is
  'Review count, mean score and star distribution for a published listing.';

revoke all on function public.listing_review_summary(uuid) from public;
grant execute on function public.listing_review_summary(uuid) to anon, authenticated;

-- Writes go through this function rather than the table API: the eligibility
-- check, the authoritative basis and the reviewer's own identity all have to be
-- decided server-side, and the reviewer's row is not client-readable. Writing
-- twice corrects the existing review instead of adding a second one.
create function public.save_listing_review(
  target_listing_id uuid,
  p_rating smallint,
  p_body text,
  p_basis public.listing_review_basis
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
  declare
    reviewer uuid := (select auth.uid());
    evidence public.listing_review_basis := public.listing_review_basis(target_listing_id);
    review_id uuid;
  begin
    if reviewer is null then
      raise exception 'Sign in to review this room.' using errcode = '42501';
    end if;

    if not public.is_public_listing(target_listing_id) then
      raise exception 'This room is not available for reviews.' using errcode = '42501';
    end if;

    if evidence is null then
      raise exception 'Reviews are open to students who visited or reserved a room here.'
        using errcode = '42501';
    end if;

    if p_basis is distinct from evidence then
      raise exception 'That review does not match your activity on this room.'
        using errcode = '42501';
    end if;

    insert into public.listing_reviews (listing_id, author_id, rating, body, basis)
    values (target_listing_id, reviewer, p_rating, btrim(p_body), evidence)
    on conflict (listing_id, author_id) do update
      set rating = excluded.rating,
          body = excluded.body,
          updated_at = now()
    returning id into review_id;

    return review_id;
  end;
$$;

comment on function public.save_listing_review(uuid, smallint, text, public.listing_review_basis) is
  'Creates or corrects the caller''s review of a listing they visited or reserved.';

revoke all on function public.save_listing_review(uuid, smallint, text, public.listing_review_basis)
  from public, anon;
grant execute on function public.save_listing_review(uuid, smallint, text, public.listing_review_basis)
  to authenticated;

-- The caller's own review, so the sheet can open prefilled for a correction.
create function public.my_listing_review(target_listing_id uuid)
returns table (
  id uuid,
  rating smallint,
  body text,
  basis public.listing_review_basis,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.rating, r.body, r.basis, r.created_at, r.updated_at
  from public.listing_reviews r
  where r.listing_id = target_listing_id
    and r.author_id = (select auth.uid())
  limit 1;
$$;

comment on function public.my_listing_review(uuid) is
  'The caller''s review of this listing, or no row when they have not written one.';

revoke all on function public.my_listing_review(uuid) from public, anon;
grant execute on function public.my_listing_review(uuid) to authenticated;
