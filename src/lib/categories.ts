// Helpers for the dynamic per-venue categories pipeline.
// Categories are stored in `venue_categories` and per-week values in
// `server_category_stats` / `server_category_targets`.

import { supabase } from "@/integrations/supabase/client";

export type VenueCategory = {
  key: string;
  label: string;
  is_legacy: boolean;
  sort_order: number;
};

export type CategoryStat = {
  user_id: string;
  week_start: string;
  category_key: string;
  sales: number;
  conversion: number;
};

export type CategoryTarget = {
  user_id: string;
  category_key: string;
  target: number;
};

const LEGACY_DEFAULTS: VenueCategory[] = [
  { key: "wine", label: "Wine", is_legacy: true, sort_order: 10 },
  { key: "cocktail", label: "Cocktails", is_legacy: true, sort_order: 20 },
  { key: "dessert", label: "Desserts", is_legacy: true, sort_order: 30 },
  { key: "sides", label: "Sides", is_legacy: true, sort_order: 40 },
  { key: "spirits", label: "Spirits", is_legacy: true, sort_order: 50 },
  { key: "sparkling", label: "Sparkling", is_legacy: true, sort_order: 60 },
];

export function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Returns the venue's tracked categories. Falls back to the legacy six. */
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

export async function fetchCategoryStatsForVenueWeek(
  venueId: string,
  weekStart: string,
): Promise<CategoryStat[]> {
  const { data } = await (supabase as any)
    .from("server_category_stats")
    .select("user_id, week_start, category_key, sales, conversion")
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
    .select("user_id, week_start, category_key, sales, conversion")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  return (data ?? []) as CategoryStat[];
}

export async function fetchCategoryTargets(venueId: string): Promise<CategoryTarget[]> {
  const { data } = await (supabase as any)
    .from("server_category_targets")
    .select("user_id, category_key, target")
    .eq("venue_id", venueId);
  return (data ?? []) as CategoryTarget[];
}

/** Index helpers */
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
