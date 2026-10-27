-- Web push: where each browser's push subscription lives, and the hook that
-- hands a new notification to the sender.
--
-- The subscription is per browser, not per account: a student may have the
-- installed app on a phone and a tab on a laptop, so the endpoint is unique and
-- one account can own several rows.
--
-- Delivery itself is an Edge Function (`send-push`), because signing a push
-- needs the VAPID private key and that must never reach the browser. The
-- trigger below only enqueues an HTTP request through pg_net; it reads the
-- function URL and its shared secret from Supabase Vault, so neither value is
-- written into this file.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The push service URL for this browser. Unique so re-subscribing updates
  -- the same row instead of piling up duplicates.
  endpoint text not null,
  -- The subscriber's public key material, used to encrypt the payload.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) <= 2048)
);

comment on table public.push_subscriptions is
  'Phase 2M: one row per browser that agreed to receive web push for an account.';

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;

-- A browser may see that it is registered and remove itself; the sender reads
-- the key material with the service role.
grant select (id, endpoint, created_at)
  on table public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, user_agent)
  on table public.push_subscriptions to authenticated;
grant delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- pg_net gives the database an outbound HTTP client. Supabase installs it, but
-- enable it here so a fresh database has it too.
create extension if not exists pg_net;

-- Hand every new activity row to the sender. Silent no-op until the Vault
-- entries exist, so the table is safe before the function is deployed.
create function public.notify_push_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url
  from vault.decrypted_secrets s
  where s.name = 'push_function_url'
  limit 1;

  if v_url is null or btrim(v_url) = '' then
    return new;
  end if;

  select s.decrypted_secret into v_secret
  from vault.decrypted_secrets s
  where s.name = 'push_webhook_secret'
  limit 1;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );

  return new;
end;
$$;

comment on function public.notify_push_sender() is
  'Phase 2M: posts a new notification to the send-push Edge Function through pg_net.';

create trigger notifications_send_push
  after insert on public.notifications
  for each row
  execute function public.notify_push_sender();
