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
      const tokens = cat.split(/[^a-z]+/).filter(Boolean);
      const has = (w: string) => tokens.includes(w) || tokens.includes(w + "s");
      // Resolve compound categories to a single bucket so "dessert wines &
      // digestifs" doesn't inflate the dessert avg price, and "sparkling
      // water" doesn't get counted as sparkling wine.
      let assigned: string | null = null;
      if (has("dessert") && (has("wine") || has("digestif"))) assigned = "wine";
      else if (has("sparkling") && has("water")) assigned = null;
      else {
        for (const k of Object.keys(buckets)) {
          if (has(k)) { assigned = k; break; }
        }
      }
      if (assigned) buckets[assigned].push(priceNum);
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

export type ServerCatRow = {
  key: string;
  label: string;
  conversion: number;
  target: number;
  items: number;
  prevItems: number;
  sales: number;
  prevSales: number;
};

/**
 * Load this server's per-category rows for a given week, driven entirely by
 * the venue's tracked categories (venue_categories). Returns [] when the
 * venue has no dynamic categories — callers should then fall back to the
 * legacy six columns on server_stats.
 */
export async function loadServerCategoryRows(
  venueId: string,
  userId: string,
  weekStart: string,
  prevWeekStart: string | null,
): Promise<ServerCatRow[]> {
  const [vcRes, curRes, prevRes, tgtRes] = await Promise.all([
    supabase
      .from("venue_categories")
      .select("key,label,sort_order")
      .eq("venue_id", venueId)
      .order("sort_order"),
    supabase
      .from("server_category_stats")
      .select("category_key,conversion,sales,net_sales,quantity,metric_type")
      .eq("venue_id", venueId)
      .eq("user_id", userId)
      .eq("week_start", weekStart),
    prevWeekStart
      ? supabase
          .from("server_category_stats")
          .select("category_key,conversion,sales,net_sales,quantity,metric_type")
          .eq("venue_id", venueId)
          .eq("user_id", userId)
          .eq("week_start", prevWeekStart)
      : Promise.resolve({ data: [] as any[] } as any),
    supabase
      .from("server_category_targets")
      .select("category_key,target")
      .eq("venue_id", venueId)
      .eq("user_id", userId),
  ]);
  const vc = (vcRes.data ?? []) as { key: string; label: string }[];
  if (!vc.length) return [];
  const prices = await fetchVenueAvgPrices(venueId);
  const curMap = Object.fromEntries(((curRes.data ?? []) as any[]).map((s) => [s.category_key, s]));
  const prevMap = Object.fromEntries((((prevRes as any).data ?? []) as any[]).map((s) => [s.category_key, s]));
  const tgtMap = Object.fromEntries(((tgtRes.data ?? []) as any[]).map((t) => [t.category_key, Number(t.target) || 0]));
  const itemsFor = (s: any, key: string): number => {
    if (!s) return 0;
    if (String(s.metric_type) === "quantity") return Math.round(Number(s.quantity) || 0);
    const sales = Number(s.net_sales ?? s.sales ?? 0);
    return estimateItemsSold(sales, key as CategoryKey, prices);
  };
  return vc.map((c) => {
    const cur = curMap[c.key];
    const prev = prevMap[c.key];
    return {
      key: c.key,
      label: c.label,
      conversion: Number(cur?.conversion ?? 0),
      target: Number(tgtMap[c.key] ?? 0),
      sales: Number(cur?.net_sales ?? cur?.sales ?? 0),
      prevSales: Number(prev?.net_sales ?? prev?.sales ?? 0),
      items: itemsFor(cur, c.key),
      prevItems: itemsFor(prev, c.key),
    };
  });
}
