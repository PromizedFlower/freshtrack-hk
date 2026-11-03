// Supabase Edge Function: household
// Membership management: create, join (invite code), list members, leave, remove.
// NOTE: for production, user_id / owner_id MUST come from the authenticated session
// (auth.uid()), not the request body. This scaffold uses explicit ids for local wiring.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function rpc(name: string, params: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`RPC ${name} failed ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function createHousehold(owner_id: string, name?: string): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/households`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation", ...authHeaders() },
    body: JSON.stringify({ owner_id, name: name || "My FreshTrack Fridge" }),
  });
  if (!resp.ok) throw new Error(`create household failed ${resp.status}`);
  const rows = await resp.json();
  return rows?.[0] || rows;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case "create":
        return corsResponse({ household: await createHousehold(body.owner_id, body.name) });

      case "join":
        return corsResponse(await rpc("join_household", { p_user: body.user_id, p_invite_code: body.invite_code }));

      case "list":
        return corsResponse({ members: await rpc("list_household_members", { p_household: body.household_id }) });

      case "leave":
        return corsResponse(await rpc("leave_household", { p_user: body.user_id, p_household: body.household_id }));

      case "remove":
        return corsResponse(await rpc("remove_household_member", {
          p_owner: body.owner_id, p_household: body.household_id, p_target: body.target_user_id,
        }));

      default:
        return corsResponse({ error: "unknown action" }, 400);
    }
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
