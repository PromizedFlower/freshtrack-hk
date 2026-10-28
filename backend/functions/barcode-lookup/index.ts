// Supabase Edge Function: barcode-lookup
// Resolves an EAN-13 / UPC barcode to a product: local barcode_cache first (ms), then the
// Open Food Facts API, caching the result for future scans.

import { corsResponse } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function findCached(barcode: string): Promise<any | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/barcode_cache?barcode=eq.${encodeURIComponent(barcode)}&limit=1`,
      { headers: authHeaders() },
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

async function cacheProduct(barcode: string, product: any): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/barcode_cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal", ...authHeaders() },
      body: JSON.stringify({ barcode, ...product, source: "openfoodfacts" }),
    });
  } catch {
    // cache write is best-effort; never fail the request over it
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse("ok");
  if (req.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);

  try {
    const { barcode } = await req.json();
    if (!barcode) return corsResponse({ error: "barcode is required" }, 400);

    const cached = await findCached(String(barcode));
    if (cached) return corsResponse({ source: "cache", product: cached });

    const resp = await fetch(`${OFF_API}/${encodeURIComponent(String(barcode))}.json`);
    if (!resp.ok) return corsResponse({ source: "none", product: null });

    const data = await resp.json();
    const p = data?.product;
    if (!p) return corsResponse({ source: "none", product: null });

    const normalized = {
      name: p.product_name || null,
      brand: p.brands || null,
      net_content: p.quantity || null,
      category: p.categories || null,
      image_url: p.image_front_url || p.image_url || null,
    };
    await cacheProduct(String(barcode), normalized);

    return corsResponse({ source: "openfoodfacts", product: { barcode, ...normalized } });
  } catch (err) {
    return corsResponse({ error: String(err?.message || err) }, 500);
  }
});
