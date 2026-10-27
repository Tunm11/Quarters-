/**
 * Web Push sender.
 *
 * Called by the `notifications_send_push` database trigger (through pg_net) for
 * every new activity row, with a shared secret in `x-push-secret`.
 *
 * It looks up the account's browser subscriptions with the service role, signs
 * one Web Push message per subscription with the VAPID keys, and removes
 * subscriptions the push service reports as gone. The VAPID private key lives
 * only in this function's secrets — never in the client bundle.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type NotificationRecord = {
  id?: string;
  user_id?: string;
  kind?: string;
  title?: string;
  body?: string | null;
  href?: string | null;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const GONE_STATUSES = new Set([404, 410]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json({ error: "PUSH_WEBHOOK_SECRET is not configured" }, 500);
  }
  if (request.headers.get("x-push-secret") !== expectedSecret) {
    return json({ error: "Forbidden" }, 401);
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    return json({ error: "VAPID keys are not configured" }, 500);
  }

  let payload: { record?: NotificationRecord } & NotificationRecord;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const record = payload.record ?? payload;
  if (!record?.user_id || !record.title) {
    return json({ error: "Expected a notification record" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", record.user_id);

  if (error) {
    console.error("push subscriptions lookup failed", error.message);
    return json({ error: "Could not read subscriptions" }, 500);
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];
  if (rows.length === 0) return json({ sent: 0, removed: 0 });

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@quarters.app",
    publicKey,
    privateKey,
  );

  const message = JSON.stringify({
    id: record.id ?? null,
    kind: record.kind ?? null,
    title: record.title,
    body: record.body ?? "",
    href: record.href ?? "/notifications",
  });

  const stale: string[] = [];
  const delivered: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
          { TTL: 86_400, urgency: "normal" },
        );
        delivered.push(row.id);
      } catch (sendError) {
        const statusCode = (sendError as { statusCode?: number }).statusCode;
        if (statusCode && GONE_STATUSES.has(statusCode)) {
          stale.push(row.id);
        } else {
          console.error("push send failed", statusCode ?? sendError);
        }
      }
    }),
  );

  if (delivered.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", delivered);
  }
  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }

  return json({ sent: delivered.length, removed: stale.length });
});
