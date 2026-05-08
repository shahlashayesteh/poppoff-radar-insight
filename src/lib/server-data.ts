import { supabase } from "@/integrations/supabase/client";

export async function claimServerCsvData() {
  await (supabase.rpc as any)("claim_placeholder_data").then(() => {}, () => {});
}

export async function recordLogin() {
  await (supabase.rpc as any)("record_login").then(() => {}, () => {});
}

// Estimate items sold per category from £ sales using avg menu price for that category.
// Falls back to a sensible default price per category when menu data is unavailable.
const DEFAULT_PRICES: Record<string, number> = {
  wine: 9, cocktail: 11, dessert: 7, sides: 5, spirits: 8, sparkling: 12,
};

export type CategoryKey = "wine" | "cocktail" | "dessert" | "sides" | "spirits" | "sparkling";

export function estimateItemsSold(categorySales: number, category: CategoryKey, avgPrices: Record<string, number>): number {
  const price = avgPrices[category] || DEFAULT_PRICES[category] || 8;
  if (!categorySales || price <= 0) return 0;
  return Math.round(categorySales / price);
}

export async function fetchVenueAvgPrices(venueId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from("venue_menu").select("parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(5);
  const buckets: Record<string, number[]> = { wine: [], cocktail: [], dessert: [], sides: [], spirits: [], sparkling: [] };
  for (const m of (data ?? [])) {
    const items = (m as any).parsed_items as any[] | null;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const cat = String(it?.category || "").toLowerCase();
      const priceNum = Number(String(it?.price || "").replace(/[^0-9.]/g, ""));
      if (!priceNum) continue;
      for (const k of Object.keys(buckets)) {
        if (cat.includes(k)) buckets[k].push(priceNum);
      }
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(buckets)) {
    const arr = buckets[k];
    if (arr.length) out[k] = arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  return out;
}

export function pctDelta(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
