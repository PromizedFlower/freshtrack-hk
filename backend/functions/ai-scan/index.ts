// Supabase Edge Function: ai-scan (Receipt & Food Photo Recognition via Gemini 2.5 Flash)
// Enforces strict distinction between 'best_before' (quality) and 'use_by' (safety)

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are the vision extraction agent for FreshTrack HK, a household food waste reduction app in Hong Kong.
Analyze the uploaded supermarket receipt (PARKnSHOP, Wellcome, HKTVmall, AEON) or food/date label photo.
Rules:
1. Normalize abbreviated English/Traditional Chinese receipt names into clean item names (e.g., "Baby Spinach", "Chicken Breast", "Whole Milk").
2. Classify each item into one of: "Produce", "Dairy", "Meat", "Bakery", "Pantry".
3. Strictly distinguish "use_by" (safety-critical items like raw meat, fresh pasteurized milk, ready-to-eat fish) from "best_before" (quality-based items like produce, bakery, yoghurt, pantry goods).
4. Never claim a food item is safe to eat from appearance alone; estimate spoilage shelf life based on standard cold-chain rules if no explicit date is printed.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  try {
    const { image_base64, mime_type = "image/jpeg", mode = "receipt" } = await req.json();

    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            { text: `Mode: ${mode}. Extract all grocery items into structured JSON.` },
            { inlineData: { mimeType: mime_type, data: image_base64 } }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const resp = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{"items": []}";

    return new Response(rawJson, {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
