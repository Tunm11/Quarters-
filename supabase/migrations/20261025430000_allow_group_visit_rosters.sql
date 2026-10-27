-- Group visits with more than two people.
--
-- A group visit used to be either a pair (the requester plus one connected
-- roommate) or a whole chat group. Wanting to see a place with two roommates
-- therefore meant creating a chat group first, so the shared-room card could
-- never carry three people.
--
-- listing_group_visits now also records an explicit roster:
--
--   member_ids — every account going, including the student who asked
--
-- A roster visit names neither a roommate profile nor a chat group, so the pair
-- and group requests keep working unchanged. The pair is just a roster of two.

alter table public.listing_group_visits
  add column if not exists member_ids uuid[] not null default '{}'::uuid[];

comment on column public.listing_group_visits.member_ids is
  'Every student going, including requested_by. Filled for roster visits; may be empty on legacy pair or group visits.';

-- Backfill the existing pair requests when the roommate has an account behind
-- the profile. Curated demo profiles have none, so those rows stay empty.
update public.listing_group_visits v
set member_ids = array[v.requested_by, p.user_id]
from public.roommate_profiles p
where p.id = v.roommate_profile_id
  and p.user_id is not null
  and v.requested_by <> p.user_id
  and cardinality(v.member_ids) = 0;

-- Backfill group requests from the group's members. The group column is guarded
-- so this migration also applies to a database without the group-visit change.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listing_group_visits'
      and column_name = 'group_id'
  ) then
    execute $backfill$
      update public.listing_group_visits v
      set member_ids = coalesce(
        (
          select array_agg(m.user_id order by m.joined_at)
          from public.chat_group_members m
          where m.group_id = v.group_id
        ),
        '{}'::uuid[]
      )
      where v.group_id is not null
        and cardinality(v.member_ids) = 0
    $backfill$;

    -- At most one target: a pair, a chat group, or neither (an explicit roster).
    execute 'alter table public.listing_group_visits drop constraint if exists listing_group_visits_target';
    execute $constraint$
      alter table public.listing_group_visits
        add constraint listing_group_visits_target
        check (num_nonnulls(roommate_profile_id, group_id) <= 1)
    $constraint$;

    execute $constraint$
      alter table public.listing_group_visits
        add constraint listing_group_visits_roster
        check (
          group_id is not null
          or roommate_profile_id is not null
          or cardinality(member_ids) >= 2
        )
    $constraint$;

    -- Asking again for the same room with a roster is harmless.
    execute $index$
      create unique index if not exists listing_group_visits_one_per_roster
        on public.listing_group_visits (listing_id, requested_by)
        where roommate_profile_id is null and group_id is null
    $index$;
  else
    execute $constraint$
      alter table public.listing_group_visits
        add constraint listing_group_visits_roster
        check (
          roommate_profile_id is not null
          or cardinality(member_ids) >= 2
        )
    $constraint$;

    execute $index$
      create unique index if not exists listing_group_visits_one_per_roster
        on public.listing_group_visits (listing_id, requested_by)
        where roommate_profile_id is null
    $index$;
  end if;
end $$;

grant select (member_ids) on table public.listing_group_visits to authenticated;
grant insert (member_ids) on table public.listing_group_visits to authenticated;

-- Everyone on the roster sees that the visit was asked for.
drop policy if exists listing_group_visits_select_roster
  on public.listing_group_visits;

create policy listing_group_visits_select_roster
  on public.listing_group_visits
  for select
  to authenticated
  using (
    cardinality(member_ids) > 0
    and member_ids @> array[(select auth.uid())]::uuid[]
  );

-- A student may plan a roster visit for a live public listing, as themselves,
-- and may only invite people they already have a conversation with — the same
-- gate chat groups use. The pair and group insert policies are untouched, and
-- insert policies are OR'ed.
do $$
declare
  has_group boolean := exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listing_group_visits'
      and column_name = 'group_id'
  );
begin
  execute 'drop policy if exists listing_group_visits_insert_roster on public.listing_group_visits';

  execute format(
    $policy$
      create policy listing_group_visits_insert_roster
        on public.listing_group_visits
        for insert
        to authenticated
        with check (
          requested_by = (select auth.uid())
          and roommate_profile_id is null
          %s
          and public.is_public_listing(listing_id)
          and cardinality(member_ids) >= 2
          and member_ids @> array[(select auth.uid())]::uuid[]
          and not exists (
            select 1
            from unnest(member_ids) as m(user_id)
            where m.user_id <> (select auth.uid())
              and not public.has_chatted_with(m.user_id)
          )
        )
    $policy$,
    case when has_group then 'and group_id is null' else '' end
  );
end $$;
