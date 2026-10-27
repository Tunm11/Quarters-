-- Roommate budgets are annual.
--
-- Nigerian landlords let a room per year (or per academic session), so a
-- roommate's stated budget is the yearly share they can put towards rent, not a
-- monthly one. The form and the discovery bands always meant "what you can pay
-- towards rent each year"; this migration converts the rows written while the
-- screen still asked for a monthly figure.
--
-- Monthly entries are all below ₦100,000, and no annual share is that small, so
-- the guard converts each row at most once and is order-independent: running
-- this before or after the annual seed leaves both kinds of row correct.

update public.roommate_profiles
   set budget_amount = budget_amount * 12
 where budget_amount is not null
   and budget_amount > 0
   and budget_amount < 100000;

comment on column public.roommate_profiles.budget_amount is
  'Yearly rent share in NGN (a landlord lets per year or per academic session).';
