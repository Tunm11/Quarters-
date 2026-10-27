-- QUARTERS — rent is quoted per year or per session.
--
-- Nigerian rentals are not advertised at a monthly rate: landlords let a room,
-- flat or house by the year, and student hostels charge per academic session.
-- The rent_period enum keeps week/month/quarter for historical compatibility,
-- so legacy rows are folded into their annual equivalent before new writes are
-- restricted to the two terms the market actually uses.

update public.listings
set rent_amount = round(
      rent_amount * case rent_period
        when 'week' then 52
        when 'month' then 12
        when 'quarter' then 4
      end,
      2
    ),
    rent_period = 'year'
where rent_period in ('week', 'month', 'quarter');

alter table public.listings
  add constraint listings_rent_period_year_or_session
  check (rent_period is null or rent_period in ('year', 'term'));

comment on constraint listings_rent_period_year_or_session on public.listings is
  'Rent is let by the year or per academic session; monthly/weekly rates are not offered.';
