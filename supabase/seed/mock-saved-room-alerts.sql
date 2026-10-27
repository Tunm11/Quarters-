-- QUARTERS — mock saved-room alerts: one rent change, one availability change.
--
-- Run after 20261025391000_add_saved_room_alerts.sql. Content, not schema.
--
-- takinpelu273@gmail.com has two saved rooms. This changes the rent on one and
-- the availability on the other, the way a provider would from their listing
-- editor. Nothing is inserted into public.notifications directly: the
-- saved-room triggers on public.listings write the activity rows, so the alerts
-- land through the same path a real provider edit takes (including web push).
--
--   Yaba flat  ₦350,000 a year        -> ₦385,000 a year   (price alert)
--   Ikeja bed  availability available -> limited            (availability alert)
--
-- Idempotent: the `is distinct from` guards make a second run a no-op instead
-- of writing the same alert twice. To watch them arrive again, set the old
-- values back and re-run this file. To remove the alerts:
--
--   delete from public.notifications
--   where user_id = (select id from auth.users where lower(email) = 'takinpelu273@gmail.com')
--     and kind in ('saved_room_price_changed', 'saved_room_availability_changed');

update public.listings as l
set rent_amount = 385000.00
from public.saved_listings as s
where s.listing_id = l.id
  and l.id = 'd0000000-0000-4000-8000-000000000103'
  and l.rent_amount is distinct from 385000.00;

update public.listings as l
set availability_status = 'limited'
from public.saved_listings as s
where s.listing_id = l.id
  and l.id = 'd0000000-0000-4000-8000-000000000104'
  and l.availability_status is distinct from 'limited';
