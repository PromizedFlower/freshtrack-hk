// Supabase Edge Function: match-recipes
// Ranks rescue recipes for a household by how much of its EXPIRING (high/medium risk) stock
// each recipe would consume. Uses the PRD weighted formula:
//   match_score = (sum weights of matched ingredients) / (sum weights of all ingredients) * 100
//   weight: high=3.0, medium=2.0, low=1.0  -> expiring items dominate the ranking.
// Optional AI fallback generates a recipe when the best static match is weak (< 60%).

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { callGemini, corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface FridgeItem {
  id: string;
  name: string;
  category: string;
  weight_grams: number;
  risk_level: "high" | "medium" | "low";
}
interface RecipeRow {
  id: string;
  title: string;
  prep_time_min: number;
  difficulty: string;
  servings: number;
  ingredients: { name?: string; weight_g?: number }[];
  steps: string[];
  tags: string[];
}

const RISK_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
const WEIGHT_PRIORITY = (r: string) => RISK_WEIGHT[r] ?? 1;

function norm(s: string): string {
  return (s || "").toLowerCase().trim();
}

function nameMatches(fridgeName: string, recipeName: string): boolean {
  const a = norm(fridgeName);
  const b = norm(recipeName);
  return a === b || a.includes(b) || b.includes(a);
}

function findFridgeItem(items: FridgeItem[], recipeName: string): FridgeItem | undefined {
  return items.find((it) => nameMatches(it.name, recipeName));
}

async function getJson(path: string): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status} on ${path}`);
  return resp.json();
}

function scoreRecipes(recipes: RecipeRow[], items: FridgeItem[]): any[] {
  return recipes
    .map((r) => {
      const ingredients = r.ingredients || [];
      let matchedWeight = 0;
      let totalWeight = 0;
      let expiringUsed = 0;
      let wasteSavedG = 0;

      for (const ing of ingredients) {
        const item = findFridgeItem(items, ing?.name || "");
        if (item) {
          const iw = WEIGHT_PRIORITY(item.risk_level);
          totalWeight += iw; // PRD: denominator uses the item's own risk weight
          matchedWeight += iw;
          if (item.risk_level === "high" || item.risk_level === "medium") {
            expiringUsed += 1;
            wasteSavedG += item.weight_grams;
          }
        } else {
          totalWeight += 1; // unmatched ingredient counts as low weight
        }
      }
      const matchScore = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
      return {
        id: r.id,
        title: r.title,
        prep_time_min: r.prep_time_min,
        difficulty: r.difficulty,
        servings: r.servings,
        tags: r.tags || [],
        ingredients: r.ingredients,
        steps: r.steps,
        match_score: matchScore,
        expiring_used_count: expiringUsed,
        waste_saved_kg: Math.round((wasteSavedG / 1000) * 100) / 100,
      };
    })
    .sort((a, b) => b.match_score - a.match_score || b.expiring_used_count - a.expiring_used_count);
}

// P3-3 overlay: exclude recipes containing an allergen, and (optionally) restrict to a
// dietary tag (e.g. "vegetarian"/"vegan"). Dietary tags must be present on the recipe.
function filterRecipes(recipes: RecipeRow[], allergies: string[], dietary: string[]): RecipeRow[] {
  return recipes.filter((r) => {
    const ingNames = (r.ingredients || []).map((i) => norm(i.name || ""));
    if (allergies.length && ingNames.some((n) => allergies.some((a) => n.includes(norm(a)) || norm(a).includes(n)))) {
      return false;
    }
    if (dietary.length) {
      const tags = (r.tags || []).map((t) => norm(t));
      if (!dietary.some((d) => tags.some((t) => t.includes(norm(d)) || norm(d).includes(t)))) return false;
    }
    return true;
  });
}

const FALLBACK_SYSTEM = `You are the Rescue Recipe agent for FreshTrack HK. Given a list of expiring fridge items,
generate ONE practical recipe that uses as many of the high/medium risk items as possible.
Constraints: total cook time <= 20 min; output ONLY JSON:
{"title","prep_time_min","difficulty","servings","ingredients":[{"name","weight_g"}],"steps":["..."],"disclaimer"}
The disclaimer must remind users this is a suggestion and food safety (use_by) dates must be respected.
Do not claim any food is safe to eat.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST" && req.method !== "GET") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    let household_id = url.searchParams.get("household_id") || "";
    let use_ai_fallback = url.searchParams.get("use_ai_fallback") === "true";
    let allergies: string[] = [];
    let dietary: string[] = [];
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      household_id = household_id || body.household_id || "";
      use_ai_fallback = use_ai_fallback || body.use_ai_fallback === true;
      if (Array.isArray(body.allergies)) allergies = body.allergies.map(String);
      if (Array.isArray(body.dietary)) dietary = body.dietary.map(String);
    } else {
      const aq = url.searchParams.get("allergies");
      if (aq) allergies = aq.split(",").map((s) => s.trim()).filter(Boolean);
      const dq = url.searchParams.get("dietary");
      if (dq) dietary = dq.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    const [items, recipes] = await Promise.all([
      getJson(`v_fridge_items_with_risk?household_id=eq.${encodeURIComponent(household_id)}&select=id,name,category,weight_grams,risk_level`),
      getJson(`recipes?select=id,title,prep_time_min,difficulty,servings,ingredients,steps,tags`),
    ]);

    const filtered = filterRecipes(recipes as RecipeRow[], allergies, dietary);
    const ranked = scoreRecipes(filtered, items as FridgeItem[]);

    let aiRecipe: any = null;
    if (use_ai_fallback && (ranked.length === 0 || ranked[0].match_score < 60)) {
      const expiring = (items as FridgeItem[])
        .filter((i) => i.risk_level !== "low")
        .map((i) => `${i.name} (${i.risk_level}, ${i.weight_grams}g)`);
      if (expiring.length > 0) {
        const prompt = `Expiring items: ${expiring.join(", ")}. Generate a rescue recipe.`;
        const parsed = await callGemini({ systemPrompt: FALLBACK_SYSTEM, promptText: prompt, imageBase64: "" }).catch(() => null);
        if (parsed) aiRecipe = { ...parsed, match_score: 0, expiring_used_count: expiring.length, waste_saved_kg: 0, ai_generated: true };
      }
    }

    return corsResponse({ recipes: ranked, ai_recipe: aiRecipe });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
