// Supabase Edge Function: match-recipes
// Ranks rescue recipes for a household by how much of its EXPIRING (high/medium risk) stock
// each recipe would consume. Uses the PRD weighted formula:
//   match_score = (sum weights of matched ingredients) / (sum weights of all ingredients) * 100
//   weight: high=3.0, medium=2.0, low=1.0  -> expiring items dominate the ranking.
// Optional AI fallback generates a recipe when the best static match is weak (< 60%).

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsResponse } from "../_shared/gemini.ts";
import { generateRescueRecipes } from "../_shared/rescueRecipe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface FridgeItem {
  id: string;
  name: string;
  category: string;
  weight_grams: number;
  risk_level: "high" | "medium" | "low";
  days_left?: number;
  date_type?: string;
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST" && req.method !== "GET") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    let household_id = url.searchParams.get("household_id") || "";
    let use_ai_fallback = url.searchParams.get("use_ai_fallback") === "true";
    let query = "";
    let allergies: string[] = [];
    let dietary: string[] = [];
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      household_id = household_id || body.household_id || "";
      use_ai_fallback = use_ai_fallback || body.use_ai_fallback === true;
      query = query || body.query || "";
      if (Array.isArray(body.allergies)) allergies = body.allergies.map(String);
      if (Array.isArray(body.dietary)) dietary = body.dietary.map(String);
    } else {
      const qq = url.searchParams.get("query");
      if (qq) query = qq;
      const aq = url.searchParams.get("allergies");
      if (aq) allergies = aq.split(",").map((s) => s.trim()).filter(Boolean);
      const dq = url.searchParams.get("dietary");
      if (dq) dietary = dq.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    const [items, recipes] = await Promise.all([
      getJson(`v_fridge_items_with_risk?household_id=eq.${encodeURIComponent(household_id)}&select=id,name,category,weight_grams,risk_level,days_left,date_type&order=days_left.asc`),
      getJson(`recipes?select=id,title,prep_time_min,difficulty,servings,ingredients,steps,tags,source`),
    ]);

    const filtered = filterRecipes(recipes as RecipeRow[], allergies, dietary);
    const ranked = scoreRecipes(filtered, items as FridgeItem[]);

    let aiRecipes: any[] = [];
    let aiDisclaimer = "";
    const expiringItems = (items as FridgeItem[]).filter((i) => i.risk_level === "high" || i.risk_level === "medium");
    const wantAi = use_ai_fallback || (query && query.trim().length > 0);
    if (wantAi && (query || ranked.length === 0 || ranked[0].match_score < 60)) {
      try {
        const result = await generateRescueRecipes({
          items: expiringItems.map((i) => ({ ...i, days_left: i.days_left ?? 0 })),
          candidateRecipes: (recipes as RecipeRow[]).map((r) => ({ title: r.title, ingredients: r.ingredients })),
          query,
          allergies,
          dietary,
          count: 3,
        });
        aiRecipes = result.recipes;
        aiDisclaimer = result.disclaimer;
      } catch (_) {
        // AI unavailable — client keeps the local ranked list as the fallback.
      }
    }

    return corsResponse({ recipes: ranked, ai_recipes: aiRecipes, ai_disclaimer: aiDisclaimer });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
