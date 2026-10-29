// Supabase Edge Function: recipe-ai-chat
// The "AI 主导" entry point for Recipes. Takes the household's expiring items (high/medium,
// most urgent first) plus an optional natural-language query, and returns AI-generated rescue
// recipes ranked by expiry urgency (临期优先). Local template matching (match-recipes) remains the
// offline/lightweight baseline the UI falls back to when this fails.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsResponse } from "../_shared/gemini.ts";
import { generateRescueRecipes, FridgeItem, CandidateRecipe } from "../_shared/rescueRecipe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Lightweight per-isolate cache keyed by household + day + query, to avoid duplicate Gemini
// calls within a short window (flash is fast/cheap, but on-demand bursts still benefit).
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { ts: number; data: { recipes: any[]; disclaimer: string } }>();

function cacheKey(hid: string, query: string, allergies: string[], dietary: string[]): string {
  const day = new Date().toISOString().slice(0, 10);
  return [hid, day, (query || "").trim(), allergies.join(","), dietary.join(",")].join("|");
}

async function getJson(path: string): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status} on ${path}`);
  return resp.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST" && req.method !== "GET") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    let household_id = url.searchParams.get("household_id") || "";
    let query = url.searchParams.get("query") || "";
    let allergies: string[] = [];
    let dietary: string[] = [];
    let count = 3;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      household_id = household_id || body.household_id || "";
      query = query || body.query || "";
      if (Array.isArray(body.allergies)) allergies = body.allergies.map(String);
      if (Array.isArray(body.dietary)) dietary = body.dietary.map(String);
      if (body.count) count = Number(body.count);
    } else {
      const aq = url.searchParams.get("allergies");
      if (aq) allergies = aq.split(",").map((s) => s.trim()).filter(Boolean);
      const dq = url.searchParams.get("dietary");
      if (dq) dietary = dq.split(",").map((s) => s.trim()).filter(Boolean);
      const cq = url.searchParams.get("count");
      if (cq) count = Number(cq);
    }
    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    // 1. Expiring items (high/medium), most urgent first — the rescue priority.
    const items = (await getJson(
      `v_fridge_items_with_risk?household_id=eq.${encodeURIComponent(household_id)}` +
        `&risk_level=in.(high,medium)&select=id,name,category,weight_grams,risk_level,days_left,date_type` +
        `&order=days_left.asc&limit=15`,
    )) as FridgeItem[];

    // 2. Local recipe library as reference context (RAG-lite, no vector DB).
    const library = (await getJson(`recipes?select=title,ingredients&limit=15`).catch(() => [])) as CandidateRecipe[];

    // 3. Generate AI recommendations (临期优先 enforced by prompt), with a short-lived cache.
    const key = cacheKey(household_id, query, allergies, dietary);
    const hit = cache.get(key);
    let result: { recipes: any[]; disclaimer: string };
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      result = hit.data;
    } else {
      const gen = await generateRescueRecipes({ items, candidateRecipes: library, query, allergies, dietary, count });
      result = { recipes: gen.recipes, disclaimer: gen.disclaimer };
      cache.set(key, { ts: Date.now(), data: result });
    }

    return corsResponse({
      recipes: result.recipes,
      disclaimer: result.disclaimer,
      expiring_count: items.length,
    });
  } catch (err) {
    const message = String(err?.message || err);
    // 502 lets the client fall back to the local baseline (offline / quota / key missing).
    return corsResponse({ error: message }, 502);
  }
});
