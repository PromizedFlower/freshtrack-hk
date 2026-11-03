// Supabase Edge Function: cook-recipe
// Marks a recipe as cooked: deducts the confirmed fridge items (transaction) and writes
// SDG 12.3 impact logs, returning the updated household KPI. Delegates the atomic work to
// the Postgres function consume_for_recipe (schema_cook.sql).

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function rpc(name: string, params: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`RPC ${name} failed ${resp.status}: ${txt}`);
  }
  return resp.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const { recipe_id, household_id, consumed_item_ids, direct = false } = await req.json();
    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);
    if (!Array.isArray(consumed_item_ids) || consumed_item_ids.length === 0)
      return corsResponse({ error: "consumed_item_ids must be a non-empty array" }, 400);
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    const fn = direct ? "consume_direct" : "consume_for_recipe";
    const params: Record<string, unknown> = { p_household: household_id, p_item_ids: consumed_item_ids };
    if (!direct) params.p_recipe = recipe_id ?? null;

    const updated_kpi = await rpc(fn, params);
    return corsResponse({ updated_kpi });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
