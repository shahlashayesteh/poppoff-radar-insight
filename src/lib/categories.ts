// Helpers for the dynamic per-venue categories pipeline.
// Categories are stored in `venue_categories` and per-week values in
// `server_category_stats` / `server_category_targets`.

import { supabase } from "@/integrations/supabase/client";

export type MetricType = "quantity" | "sales" | "percentage";

export type VenueCategory = {
  key: string;
  label: string;
  is_legacy: boolean;
  sort_order: number;
  metric_type?: MetricType;
};

export type CategoryStat = {
  user_id: string;
  week_start: string;
  category_key: string;
  sales: number;
  conversion: number;
  quantity: number;
  net_sales: number;
  metric_type: MetricType;
};

export type CategoryTarget = {
  user_id: string;
  category_key: string;
  target: number;
  metric_type: MetricType;
};

const LEGACY_DEFAULTS: VenueCategory[] = [
  { key: "wine", label: "Wine", is_legacy: true, sort_order: 10, metric_type: "sales" },
  { key: "cocktail", label: "Cocktails", is_legacy: true, sort_order: 20, metric_type: "sales" },
  { key: "dessert", label: "Desserts", is_legacy: true, sort_order: 30, metric_type: "sales" },
  { key: "sides", label: "Sides", is_legacy: true, sort_order: 40, metric_type: "sales" },
  { key: "spirits", label: "Spirits", is_legacy: true, sort_order: 50, metric_type: "sales" },
  { key: "sparkling", label: "Sparkling", is_legacy: true, sort_order: 60, metric_type: "sales" },
];

export function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Returns ALL categories a venue has ever tracked. Falls back to the
 *  legacy six only when the venue has tracked nothing yet. Prefer
 *  `fetchCategoriesForWeek` for per-period UI rendering. */
export async function fetchVenueCategories(venueId: string): Promise<VenueCategory[]> {
  const { data } = await (supabase as any)
    .from("venue_categories")
    .select("key, label, is_legacy, sort_order")
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("label");
  const rows = (data ?? []) as VenueCategory[];
  if (rows.length === 0) return LEGACY_DEFAULTS;
  return rows;
}

/** Returns ONLY the categories that have stat rows for the given week
 *  (across any server in the venue). Falls back to the legacy six if no
 *  data exists at all for that week. This is what dashboards should use. */
export async function fetchCategoriesForWeek(
  venueId: string,
  weekStart: string,
): Promise<VenueCategory[]> {
  const { data: statRows } = await (supabase as any)
    .from("server_category_stats")
    .select("category_key, metric_type")
    .eq("venue_id", venueId)
    .eq("week_start", weekStart);
  const keys = new Set<string>((statRows ?? []).map((r: any) => r.category_key as string));
  const metricByKey: Record<string, MetricType> = {};
  for (const r of statRows ?? []) {
    if (!metricByKey[r.category_key]) metricByKey[r.category_key] = (r.metric_type as MetricType) || "sales";
  }
  if (keys.size === 0) return LEGACY_DEFAULTS;
  const { data: cats } = await (supabase as any)
    .from("venue_categories")
    .select("key, label, is_legacy, sort_order")
    .eq("venue_id", venueId)
    .in("key", Array.from(keys))
    .order("sort_order")
    .order("label");
  return ((cats ?? []) as VenueCategory[]).map((c) => ({
    ...c,
    metric_type: metricByKey[c.key] || "sales",
  }));
}

export async function fetchCategoryStatsForVenueWeek(
  venueId: string,
  weekStart: string,
): Promise<CategoryStat[]> {
  const { data } = await (supabase as any)
    .from("server_category_stats")
    .select("user_id, week_start, category_key, sales, conversion, quantity, net_sales, metric_type")
    .eq("venue_id", venueId)
    .eq("week_start", weekStart);
  return (data ?? []) as CategoryStat[];
}

export async function fetchCategoryStatsForUser(
  venueId: string,
  userId: string,
  weekStart: string,
): Promise<CategoryStat[]> {
  const { data } = await (supabase as any)
    .from("server_category_stats")
    .select("user_id, week_start, category_key, sales, conversion, quantity, net_sales, metric_type")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  return (data ?? []) as CategoryStat[];
}

export async function fetchCategoryTargets(venueId: string): Promise<CategoryTarget[]> {
  const { data } = await (supabase as any)
    .from("server_category_targets")
    .select("user_id, category_key, target, metric_type")
    .eq("venue_id", venueId);
  return (data ?? []) as CategoryTarget[];
}

export function indexCategoryStats(rows: CategoryStat[]): Record<string, Record<string, CategoryStat>> {
  const out: Record<string, Record<string, CategoryStat>> = {};
  for (const r of rows) {
    (out[r.user_id] ??= {})[r.category_key] = r;
  }
  return out;
}

export function indexCategoryTargets(rows: CategoryTarget[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    (out[r.user_id] ??= {})[r.category_key] = Number(r.target) || 0;
  }
  return out;
}

/** Format a category value for display, based on its metric_type. */
export function formatCategoryValue(stat: Partial<CategoryStat> | undefined, metric: MetricType | undefined): string {
  if (!stat) return "—";
  const m = metric || stat.metric_type || "sales";
  if (m === "quantity") {
    const q = Number(stat.quantity ?? 0);
    return `${q.toLocaleString()} sold`;
  }
  if (m === "percentage") {
    return `${Number(stat.conversion ?? 0).toFixed(0)}%`;
  }
  const v = Number(stat.net_sales ?? stat.sales ?? 0);
  return `£${v.toFixed(0)}`;
}
