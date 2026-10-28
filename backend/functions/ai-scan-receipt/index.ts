// Supabase Edge Function: ai-scan-receipt
// Scans a Hong Kong supermarket receipt (PARKnSHOP / Wellcome / HKTVmall / AEON), extracts
// grocery line items, and enriches each with a rule-backed suggested expiry date.
// Strictly distinguishes best_before (quality) from use_by (safety). Never judges edibility.

import { callGemini, corsResponse } from "../_shared/gemini.ts";
import { lookupRule, suggestExpiry } from "../_shared/storageRules.ts";

const SYSTEM_PROMPT = `You are the receipt extraction agent for FreshTrack HK, a Hong Kong household food-waste reduction app.
Analyze the uploaded supermarket receipt photo.
Rules:
1. Normalize abbreviated English / Traditional Chinese receipt names into clean canonical item names
   (e.g. "ORG BBY SPINACH 200G" -> "Baby Spinach", "鮮奶" -> "Whole Milk").
2. Classify each item into exactly one of: "Produce", "Dairy", "Meat", "Bakery", "Pantry".
3. Strictly distinguish "use_by" (safety-critical: raw meat, fresh pasteurized milk, ready-to-eat fish, tofu)
   from "best_before" (quality-based: produce, bakery, yoghurt, pantry, most cheese).
4. Extract quantity (integer count or 1), unit ("pcs" | "pack" | "ml" | "L" | "g" | "kg"), weight_g (integer grams),
   and price_hkd (decimal) when shown on the receipt. If absent, use reasonable defaults (1, "pcs", 200, 0).
5. Output ONLY a JSON object: {"items":[{"name","category","quantity","unit","weight_g","price_hkd","date_type","confidence"}]}.
   confidence is 0-1 of how sure you are about the item name. Do not add commentary.`;

const CATEGORIES = ["Produce", "Dairy", "Meat", "Bakery", "Pantry"];
const DATE_TYPES = ["best_before", "use_by"];

function clampItem(raw: any): any {
  const name = String(raw?.name || "").trim() || "Unknown Item";
  const category = CATEGORIES.includes(raw?.category) ? raw.category : "Pantry";
  const date_type = DATE_TYPES.includes(raw?.date_type) ? raw.date_type : "best_before";
  const quantity = Number.isFinite(Number(raw?.quantity)) && Number(raw.quantity) > 0 ? Number(raw.quantity) : 1;
  const weight_g = Number.isFinite(Number(raw?.weight_g)) && Number(raw.weight_g) > 0 ? Math.round(Number(raw.weight_g)) : 200;
  const price_hkd = Number.isFinite(Number(raw?.price_hkd)) ? Number(Number(raw.price_hkd).toFixed(2)) : 0;
  const confidence = Number.isFinite(Number(raw?.confidence)) ? Math.min(1, Math.max(0, Number(raw.confidence))) : 0.5;
  return { name, category, quantity, unit: String(raw?.unit || "pcs"), weight_g, price_hkd, date_type, confidence };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const { image_base64, mime_type = "image/jpeg", store_hint } = await req.json();
    if (!image_base64) return corsResponse({ error: "image_base64 is required" }, 400);

    const prompt =
      `Mode: receipt.${store_hint ? " Store hint: " + store_hint + "." : ""} ` +
      `Extract all grocery items into structured JSON.`;

    const parsed = await callGemini({ systemPrompt: SYSTEM_PROMPT, promptText: prompt, imageBase64: image_base64, mimeType: mime_type });
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

    const items = [];
    for (const it of rawItems) {
      const clean = clampItem(it);
      const rule = await lookupRule(clean.name);
      // Rule-backed enrichment: prefer authoritative date_type + expiry, keep model name/category.
      const date_type = rule ? rule.default_date_type : clean.date_type;
      items.push({
        ...clean,
        date_type,
        suggested_expiry_date: suggestExpiry(rule),
        is_date_estimated: true,
        storage_zone: rule ? undefined : "fridge",
      });
    }

    return corsResponse({ items });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
