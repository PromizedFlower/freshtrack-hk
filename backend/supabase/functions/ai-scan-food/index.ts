// Supabase Edge Function: ai-scan-food
// Recognizes fridge items / shelf contents / date-label photos and returns structured items.
// Modes: "item" (single food), "shelf" (multiple items on a shelf), "label" (date code / best-before-use-by).
// Strictly distinguishes best_before (quality) from use_by (safety). Never judges edibility.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { callGemini, corsResponse } from "../_shared/gemini.ts";
import { lookupRule, suggestExpiry } from "../_shared/storageRules.ts";

const SYSTEM_PROMPT = `You are the food recognition agent for FreshTrack HK, a Hong Kong household food-waste reduction app.
Analyze the uploaded food or date-label photo.
Rules:
1. Normalize names into clean canonical item names (e.g. "鮮奶" -> "Whole Milk", "雞胸" -> "Chicken Breast").
2. Classify each item into exactly one of: "Produce", "Dairy", "Meat", "Bakery", "Pantry".
3. Strictly distinguish date types:
   - "use_by" (safety-critical): raw meat, fresh pasteurized milk, ready-to-eat fish, tofu, fresh mince. If a label says "Use By / 此日期或之前食用", use "use_by".
   - "best_before" (quality-based): produce, bakery, yoghurt, pantry, hard cheese. If a label says "Best Before / 此日期前最佳", use "best_before".
4. For mode "label": extract the printed expiry date as YYYY-MM-DD. If no explicit date, set expiry_date=null and is_estimated=true.
5. For mode "item"/"shelf": you may estimate a plausible expiry only when no date is printed; set is_estimated=true.
6. Output ONLY JSON: {"detected_items":[{"name","category","date_type","expiry_date","is_estimated","storage_advice"}]}.
   Do not judge whether the food is safe to eat. Do not add commentary.`;

const CATEGORIES = ["Produce", "Dairy", "Meat", "Bakery", "Pantry"];
const DATE_TYPES = ["best_before", "use_by"];

function clampItem(raw: any): any {
  const name = String(raw?.name || "").trim() || "Unknown Item";
  const category = CATEGORIES.includes(raw?.category) ? raw.category : "Pantry";
  const date_type = DATE_TYPES.includes(raw?.date_type) ? raw.date_type : "best_before";
  const expiry_raw = raw?.expiry_date;
  const expiry_date = /^\d{4}-\d{2}-\d{2}$/.test(expiry_raw) ? expiry_raw : null;
  const is_estimated = expiry_date ? Boolean(raw?.is_estimated) : true;
  const storage_advice = String(raw?.storage_advice || "").trim() || undefined;
  return { name, category, date_type, expiry_date, is_estimated, storage_advice };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const { image_base64, mime_type = "image/jpeg", mode = "item" } = await req.json();
    if (!image_base64) return corsResponse({ error: "image_base64 is required" }, 400);

    const modeText =
      mode === "label"
        ? "Mode: label. Read the date code; distinguish Best Before vs Use By."
        : mode === "shelf"
        ? "Mode: shelf. Detect ALL food items visible and their dates if printed."
        : "Mode: item. Recognize the single food and any printed date.";
    const parsed = await callGemini({ systemPrompt: SYSTEM_PROMPT, promptText: modeText, imageBase64: image_base64, mimeType: mime_type });
    const rawItems = Array.isArray(parsed?.detected_items) ? parsed.detected_items : [];

    const detected_items = [];
    for (const it of rawItems) {
      const clean = clampItem(it);
      const rule = await lookupRule(clean.name);
      const date_type = rule ? rule.default_date_type : clean.date_type;
      const expiry_date = clean.expiry_date ?? suggestExpiry(rule);
      detected_items.push({
        ...clean,
        date_type,
        expiry_date,
        is_estimated: clean.expiry_date ? clean.is_estimated : true,
        storage_advice: clean.storage_advice ?? (rule ? "Store per standard cold-chain rule." : "Keep chilled at 0-4C."),
      });
    }

    return corsResponse({ detected_items });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
