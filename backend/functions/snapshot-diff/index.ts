// Supabase Edge Function: snapshot-diff
// Detects items in a fresh fridge-shelf photo and diffs them against the current ledger:
// flags items seen in the photo but missing from the ledger (forgotten/unlogged) and
// ledger items possibly already consumed. Purely advisory — never judges food safety.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { callGemini, corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const SYSTEM_PROMPT = `You are the fridge inventory agent for FreshTrack HK.
Analyze the uploaded fridge shelf photo and list every food item you can see.
Output ONLY JSON: {"detected":[{"name","category"}]} where category is one of
"Produce","Dairy","Meat","Bakery","Pantry". Do not judge food safety. Do not add commentary.`;

function norm(s: string): string {
  return (s || "").toLowerCase().trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const { household_id, image_base64, mime_type = "image/jpeg", save_snapshot = true } = await req.json();
    if (!household_id) return corsResponse({ error: "household_id is required" }, 400);
    if (!image_base64) return corsResponse({ error: "image_base64 is required" }, 400);
    if (!SUPABASE_URL || !SERVICE_KEY) return corsResponse({ error: "Supabase env not configured" }, 500);

    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

    const [parsed, ledgerResp] = await Promise.all([
      callGemini({ systemPrompt: SYSTEM_PROMPT, promptText: "Mode: shelf. List visible items.", imageBase64, mimeType: mime_type }),
      fetch(`${SUPABASE_URL}/rest/v1/v_fridge_items_with_risk?household_id=eq.${encodeURIComponent(household_id)}&select=id,name,status`, { headers }),
    ]);
    if (!ledgerResp.ok) throw new Error(`ledger fetch failed ${ledgerResp.status}`);
    const ledger = (await ledgerResp.json()) as { id: string; name: string; status: string }[];

    const detected: { name: string; category: string }[] = Array.isArray(parsed?.detected) ? parsed.detected : [];

    const missingFromLedger = detected.filter(
      (d) => !ledger.some((l) => norm(l.name) === norm(d.name) || norm(l.name).includes(norm(d.name)) || norm(d.name).includes(norm(l.name))),
    );
    const ledgerNames = new Set(ledger.map((l) => norm(l.name)));
    const likelyConsumed = ledger
      .filter((l) => l.status === "in_stock" && !detected.some((d) => norm(d.name) === norm(l.name) || norm(d.name).includes(norm(l.name))))
      .map((l) => ({ id: l.id, name: l.name }));

    let snapshotId: string | null = null;
    if (save_snapshot) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/fridge_snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation", ...headers },
        body: JSON.stringify({ household_id, detected_items: detected }),
      });
      if (resp.ok) {
        const rows = await resp.json();
        snapshotId = rows?.[0]?.id ?? null;
      }
    }

    return corsResponse({ detected, missing_from_ledger: missingFromLedger, likely_consumed: likelyConsumed, snapshot_id: snapshotId });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
