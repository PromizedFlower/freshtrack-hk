// Supabase Edge Function: shopping-list
// Thin CRUD over the shopping_list table (list / add / update status / remove).
// The service key is used here for simplicity; production should scope by auth.uid().

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);
    const body = await req.json();
    const action = body.action as string;
    const household_id = body.household_id as string;

    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);

    if (action === "list") {
      const qs = `shopping_list?household_id=eq.${encodeURIComponent(household_id)}&order=created_at.desc`;
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/${qs}`, { headers: authHeaders() });
      if (!resp.ok) throw new Error(`list failed ${resp.status}`);
      return corsResponse({ items: await resp.json() });
    }

    if (action === "add") {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/shopping_list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation", ...authHeaders() },
        body: JSON.stringify({
          household_id,
          item_name: body.item_name,
          category: body.category ?? null,
          quantity: body.quantity ?? 1,
          unit: body.unit ?? "pcs",
          added_by: body.user_id ?? null,
          is_suggested: body.is_suggested ?? false,
        }),
      });
      if (!resp.ok) throw new Error(`add failed ${resp.status}`);
      return corsResponse({ item: await resp.json() });
    }

    if (action === "update") {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/shopping_list?id=eq.${body.id}&household_id=eq.${encodeURIComponent(household_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation", ...authHeaders() },
        body: JSON.stringify({ status: body.status }),
      });
      if (!resp.ok) throw new Error(`update failed ${resp.status}`);
      return corsResponse({ item: await resp.json() });
    }

    if (action === "remove") {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/shopping_list?id=eq.${body.id}&household_id=eq.${encodeURIComponent(household_id)}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!resp.ok) throw new Error(`remove failed ${resp.status}`);
      return corsResponse({ removed: true });
    }

    return corsResponse({ error: "unknown action" }, 400);
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
