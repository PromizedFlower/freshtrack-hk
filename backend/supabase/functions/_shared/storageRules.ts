// Shared storage-rules lookup for FreshTrack HK edge functions.
// Best-effort fuzzy match against the storage_rules table to back expiry estimation
// with the same USDA / HK CFS knowledge base the risk engine uses.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export interface StorageRule {
  shelf_life_days: number;
  default_date_type: "best_before" | "use_by";
  category: string;
}

// Returns the first storage rule whose English/Chinese keyword loosely contains the item name.
export async function lookupRule(name: string): Promise<StorageRule | null> {
  if (!SUPABASE_URL || !SERVICE_KEY || !name) return null;
  try {
    const pattern = encodeURIComponent(`*${name.trim().toLowerCase()}*`);
    const url =
      `${SUPABASE_URL}/rest/v1/storage_rules` +
      `?select=shelf_life_days,default_date_type,category` +
      `&or=(keyword_en.ilike.${pattern},keyword_zh.ilike.${pattern})` +
      `&limit=1`;

    const resp = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as StorageRule;
  } catch {
    return null;
  }
}

// Suggested expiry = purchase date + rule shelf life (rule-backed fallback).
export function suggestExpiry(rule: StorageRule | null, purchaseDate = new Date()): string {
  const days = rule?.shelf_life_days ?? 5;
  const d = new Date(purchaseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
