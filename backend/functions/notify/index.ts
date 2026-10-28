// Supabase Edge Function: notify
// Dispatches pending notifications through pluggable channel adapters and marks their
// status. WeChat subscribe / Web Push / email are intentionally stubbed for wiring later;
// in_app rows are simply marked sent (they surface as the in-app "Use Soon" alert list).

import { corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface NotificationRow {
  id: string;
  channel: "wechat_subscribe" | "web_push" | "email" | "in_app";
  user_id: string | null;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
}

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// ---- Channel adapters (stub implementations; wire credentials in production) ----
async function sendWechat(_n: NotificationRow): Promise<void> {
  // TODO: call WeChat subscribe-message send API with user's openid from payload.
  return;
}
async function sendWebPush(_n: NotificationRow): Promise<void> {
  // TODO: use VAPID keys + web-push library against the user's push subscription.
  return;
}
async function sendEmail(_n: NotificationRow): Promise<void> {
  // TODO: send via Supabase Edge / Resend / SMTP with user email from profiles.
  return;
}

async function sendInApp(n: NotificationRow): Promise<void> {
  // In-app alerts are read directly from the notifications table; nothing to push.
  return;
}

async function dispatch(n: NotificationRow): Promise<boolean> {
  try {
    switch (n.channel) {
      case "wechat_subscribe": await sendWechat(n); break;
      case "web_push": await sendWebPush(n); break;
      case "email": await sendEmail(n); break;
      default: await sendInApp(n); break;
    }
    return true;
  } catch {
    return false;
  }
}

async function markStatus(id: string, status: "sent" | "failed"): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal", ...authHeaders() },
    body: JSON.stringify({ status, sent_at: status === "sent" ? new Date().toISOString() : null }),
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?status=eq.pending&scheduled_for=lte.${new Date().toISOString()}&select=id,channel,user_id,title,body,payload&limit=100`,
      { headers: authHeaders() },
    );
    if (!resp.ok) throw new Error(`fetch pending failed ${resp.status}`);
    const rows = (await resp.json()) as NotificationRow[];

    let sent = 0;
    let failed = 0;
    for (const n of rows) {
      const ok = await dispatch(n);
      await markStatus(n.id, ok ? "sent" : "failed");
      ok ? sent++ : failed++;
    }

    return corsResponse({ dispatched: rows.length, sent, failed });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
