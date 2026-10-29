// Shared AI rescue-recipe generator for FreshTrack HK.
// Centralises the "AI 主导主路径" prompt: expiring-first (临期优先) ranking, allergen/dietary
// hard constraints, substitution reasoning and a food-safety disclaimer. Reused by
// recipe-ai-chat (primary) and match-recipes (fallback / query mode).

import { callGemini } from "./gemini.ts";

export interface FridgeItem {
  id: string;
  name: string;
  category: string;
  weight_grams: number;
  risk_level: "high" | "medium" | "low";
  days_left: number;
  date_type?: string;
}

export interface CandidateRecipe {
  title: string;
  ingredients: { name?: string }[];
}

export interface RescueInput {
  items: FridgeItem[];                       // expiring (high/medium), sorted days_left asc
  candidateRecipes?: CandidateRecipe[];      // local library context (optional)
  query?: string;                            // natural-language question
  allergies: string[];
  dietary: string[];
  count?: number;                            // number of dishes to propose (default 3)
}

export interface GeneratedRecipe {
  title: string;
  prep_time_min: number;
  difficulty: string;
  servings: number;
  ingredients: { name: string; weight_g?: number; substitute?: string | null }[];
  steps: string[];
  uses_expiring: string[];
  reason: string;
  ai_generated: true;
  source: "ai";
}

export interface RescueResult {
  recipes: GeneratedRecipe[];
  disclaimer: string;
}

const SYSTEM = `You are the Rescue Recipe agent for FreshTrack HK, a food-waste reduction app.
Given the user's expiring fridge items, propose practical dishes that PRIORITISE the soonest-to-expire
items (high risk first, then medium, smallest days_left first). Rescuing food before it spoils is the #1 goal.

Rules:
- Use as many high/medium-risk items as possible, ranked by urgency.
- Total cook time <= 20 min, common home equipment only.
- Only use ingredients the user has, plus at most a few basic pantry staples (salt, oil, soy sauce, garlic, rice).
- Strictly respect allergies and dietary restrictions; exclude any dish containing an allergen.
- If the user asked a specific question, answer it and shape recommendations around it.
- For any optional/missing ingredient, put a suggested substitution in that ingredient's "substitute" field (or null if none).

Output ONLY a JSON object of this exact shape (no markdown fences):
{
  "disclaimer": "one-sentence food-safety reminder",
  "recipes": [
    {
      "title": "string",
      "prep_time_min": 15,
      "difficulty": "Easy",
      "servings": 2,
      "ingredients": [{"name":"string","weight_g":200,"substitute":null}],
      "steps": ["string","string"],
      "uses_expiring": ["item name","item name"],
      "reason": "one line on why this rescues food"
    }
  ]
}
The disclaimer must remind users this is a suggestion and that food-safety (use_by) dates must always be
respected; never claim any food is safe to eat.`;

export function buildPrompt(input: RescueInput): string {
  const count = input.count && input.count > 0 ? input.count : 3;
  const lines: string[] = [];

  lines.push("EXPIRING FRIDGE ITEMS (most urgent first):");
  if (input.items.length) {
    lines.push(
      input.items
        .map((i) => `${i.name} | risk=${i.risk_level} | days_left=${i.days_left} | category=${i.category} | ~${i.weight_grams}g`)
        .join("\n"),
    );
  } else {
    lines.push("(none — fridge is healthy)");
  }

  if (input.candidateRecipes?.length) {
    lines.push("\nEXISTING RECIPE LIBRARY (reference only, adapt as needed):");
    lines.push(
      input.candidateRecipes
        .map((r) => `- ${r.title}: ${(r.ingredients || []).map((i) => i.name).join(", ")}`)
        .join("\n"),
    );
  }

  if (input.allergies.length) lines.push(`\nALLERGIES (must exclude): ${input.allergies.join(", ")}`);
  if (input.dietary.length) lines.push(`\nDIETARY (must satisfy): ${input.dietary.join(", ")}`);
  if (input.query) lines.push(`\nUSER QUESTION: ${input.query}`);

  lines.push(`\nPropose ${count} dishes.`);
  return lines.join("\n");
}

function coerceRecipe(r: any): GeneratedRecipe {
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).map((i: any) => ({
    name: String(i?.name || ""),
    weight_g: typeof i?.weight_g === "number" ? i.weight_g : undefined,
    substitute: i?.substitute ?? null,
  }));
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((s: any) => String(s));
  return {
    title: String(r?.title || "Rescue dish"),
    prep_time_min: Number(r?.prep_time_min) || 15,
    difficulty: String(r?.difficulty || "Easy"),
    servings: Number(r?.servings) || 2,
    ingredients,
    steps,
    uses_expiring: (Array.isArray(r?.uses_expiring) ? r.uses_expiring : []).map(String),
    reason: String(r?.reason || ""),
    ai_generated: true,
    source: "ai",
  };
}

// Tolerates the model returning {recipes:[...]}, a single {...} object, or a bare [...].
export function normalize(raw: any, input: RescueInput): RescueResult {
  const disclaimer =
    String(raw?.disclaimer || "") ||
    "建议仅供参考；请始终以食材包装上的 use-by 日期与感官判断为准，本应用不证明任何食物可安全食用。";

  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw?.recipes)) list = raw.recipes;
  else if (raw && typeof raw === "object" && raw.title) list = [raw];

  const recipes = list.map(coerceRecipe).slice(0, input.count && input.count > 0 ? input.count : 3);
  return { recipes, disclaimer };
}

export async function generateRescueRecipes(input: RescueInput): Promise<RescueResult> {
  const promptText = buildPrompt(input);
  const raw = await callGemini({ systemPrompt: SYSTEM, promptText, imageBase64: "" });
  return normalize(raw, input);
}
