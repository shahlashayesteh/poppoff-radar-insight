// =============================================================================
// Performance Engine — single source of truth for every "how well did this
// server do" number shown anywhere in the app (home, stats, manager view,
// coaching prompts). No page may compute its own ring fill, delta, status
// label, or score.
//
// Design principles:
//   1. Target-based rings (achievement, not movement).
//   2. 4-week rolling average is the PRIMARY behavioural benchmark;
//      week-over-week is secondary.
//   3. Category-aware denominators — fairness foundation only, the actual
//      conversion number is still whatever the CSV/dynamic stats stored.
//   4. Items terminology distinguishes real POS quantities from estimates.
//   5. Blended performance score: target progress, trend, NORMALISED
//      commercial impact (vs expected, not raw £), CONDITIONAL consistency.
//   6. Revenue Influence: incremental £ vs venue baseline conversion.
//   7. Opportunity / context: stored & threaded through, unused in the
//      visible score yet — future fairness layer can plug in without
//      touching pages.
// =============================================================================

import { supabase } from "@/integrations/supabase/client";
import { fetchVenueAvgPrices, estimateItemsSold, type CategoryKey } from "@/lib/server-data";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type QuantitySource = "real" | "estimated" | "fallback";

export type DenominatorType =
  | "eligible_covers"
  | "adult_bev_opportunities"
  | "eligible_tables"
  | "celebration_tables"
  | "alcohol_tables"
  | "total_tables"
  | "covers";

export type TrendStatus = "Focus" | "Improving" | "Strong" | "Crushing";
export type EliteTier = 0 | 1 | 2 | 3; // 0 below, 1 100-120%, 2 120-150%, 3 >=150%

export interface ScoreBreakdown {
  target: number;       // 0..1 contribution before weight
  trend: number;        // 0..1
  commercial: number;   // 0..1 (normalised vs expected, NOT raw share)
  consistency: number;  // 0..1 (neutral 0.5 when sample too small)
  applied: { target: number; trend: number; commercial: number; consistency: number };
}

export interface CategoryMetric {
  key: string;
  label: string;
  denominatorType: DenominatorType;

  // Conversion (percentage points)
  current: number;
  prevWeek: number;
  fourWeekAvg: number;
  fourWeekValues: number[];     // up to 4 most recent completed weeks (exclusive of current)
  target: number;

  // Sales (£)
  sales: number;
  prevSales: number;
  fourWeekAvgSales: number;

  // Items / quantity
  quantity: number;             // best-effort count (real or estimated)
  quantitySource: QuantitySource;
  items: number;                // alias for legacy callers — same as quantity

  // Ring / status
  rawRingPct: number;           // can exceed 100
  ringPct: number;              // clamped to 100 for the bar fill
  eliteTier: EliteTier;
  deltaWoW: number | null;      // pp
  deltaVs4wk: number | null;    // pp
  statusLabel: TrendStatus;

  // Scoring
  score: number;                // 0..100
  scoreBreakdown: ScoreBreakdown;

  // Fairness / commercial intelligence foundation
  opportunityCount: number | null;
  venueBaselineConversion: number | null;
  expectedSales: number | null;
  avgUnitPrice: number | null;
  revenueInfluence: number | null; // £ above venue baseline
}

export interface PerformanceContext {
  section?: string | null;
  daypart?: string | null;
  avgTableSpend?: number | null;
  coversPerTable?: number | null;
  shiftMinutes?: number | null;
  bookingType?: string | null;
  menuType?: "set" | "alc" | "mixed" | null;
  tableVolume?: number | null;
  [k: string]: unknown;
}

export interface ServerPerformance {
  rows: CategoryMetric[];
  totals: {
    sales: number;
    prevSales: number;
    fourWeekAvgSales: number;
    salesDeltaPctWoW: number | null;
    salesDeltaPctVs4wk: number | null;
    totalRevenueInfluence: number;
  };
  context: PerformanceContext;
}

// -----------------------------------------------------------------------------
// Pure helpers — exported so UI/coaching share identical logic.
// -----------------------------------------------------------------------------

export function ringPercent(current: number, target: number): { raw: number; clamped: number } {
  if (!target || target <= 0) return { raw: 0, clamped: 0 };
  const raw = (current / target) * 100;
  return { raw, clamped: Math.max(0, Math.min(100, raw)) };
}

export function eliteTierOf(rawPct: number): EliteTier {
  if (rawPct >= 150) return 3;
  if (rawPct >= 120) return 2;
  if (rawPct >= 100) return 1;
  return 0;
}

/**
 * Status label. Driven by the 4-week delta when available (primary
 * behavioural signal), otherwise by week-over-week.
 */
export function statusFromDelta(deltaPP: number | null): TrendStatus {
  if (deltaPP === null || deltaPP <= 0) return "Focus";
  if (deltaPP <= 2) return "Improving";
  if (deltaPP <= 5) return "Strong";
  return "Crushing";
}

/**
 * Category denominator metadata — labels the conversion fraction we'd
 * ideally compute when opportunity data exists. Today the stored
 * `conversion` value is used directly; this metadata exists so the engine
 * can recompute against a real opportunity_count in a later release
 * without UI churn.
 */
export function categoryDenominator(rawKey: string): DenominatorType {
  const k = rawKey.toLowerCase();
  if (k.includes("dessert")) return "eligible_covers";
  if (k.includes("side")) return "eligible_covers";
  if (k.includes("cocktail")) return "adult_bev_opportunities";
  if (k.includes("wine")) return "eligible_tables";
  if (k.includes("sparkling") || k.includes("champagne")) return "celebration_tables";
  if (k.includes("spirit") || k.includes("whisky") || k.includes("whiskey")) return "alcohol_tables";
  if (k.includes("water")) return "total_tables";
  return "covers";
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
}

// -----------------------------------------------------------------------------
// Scoring — refined commercial weighting + conditional consistency.
// -----------------------------------------------------------------------------

const WEIGHTS = { target: 0.35, trend: 0.30, commercial: 0.25, consistency: 0.10 };

function targetScore(current: number, target: number): number {
  if (!target || target <= 0) return 0.5; // neutral if no target yet
  return Math.max(0, Math.min(1, current / target));
}

function trendScore(deltaVs4wk: number | null): number {
  // Map ±5pp swing to full 0..1 range, centred on 0.5.
  if (deltaVs4wk === null) return 0.5;
  const clamped = Math.max(-5, Math.min(5, deltaVs4wk));
  return 0.5 + (clamped / 10);
}

/**
 * Commercial impact — normalised against expected sales for THIS category,
 * not the server's total sales mix. A strong dessert performer shouldn't
 * lose to an average wine performer just because wine prices are higher.
 *
 * Expected baseline = venue-average conversion × this server's
 * opportunity (covers fallback) × avg unit price.
 */
function commercialScore(currentSales: number, expectedSales: number | null): number {
  if (!expectedSales || expectedSales <= 0) return 0.5; // neutral
  const ratio = currentSales / expectedSales;
  // Cap at 2x expected → full mark; below ~0.25x → 0.
  return Math.max(0, Math.min(1, (ratio - 0.25) / 1.75));
}

/**
 * Consistency — neutral if sample/opportunity volume is too small to
 * judge fairly. Avoids punishing strong servers on peak/difficult
 * shifts with naturally volatile cover counts.
 */
function consistencyScore(values: number[], opportunityCount: number | null): number {
  const sample = values.length;
  const opp = opportunityCount ?? 0;
  // Need at least 3 prior weeks AND a meaningful opportunity volume (or
  // unknown opp — we don't punish missing data).
  if (sample < 3) return 0.5;
  if (opportunityCount !== null && opp < 20) return 0.5;
  const m = mean(values);
  if (m <= 0) return 0.5;
  const cv = stddev(values) / m; // coefficient of variation
  return Math.max(0, Math.min(1, 1 - cv));
}

export function performanceScore(args: {
  current: number;
  target: number;
  deltaVs4wk: number | null;
  currentSales: number;
  expectedSales: number | null;
  fourWeekValues: number[];
  opportunityCount: number | null;
}): { score: number; breakdown: ScoreBreakdown } {
  const t = targetScore(args.current, args.target);
  const tr = trendScore(args.deltaVs4wk);
  const c = commercialScore(args.currentSales, args.expectedSales);
  const cs = consistencyScore(args.fourWeekValues, args.opportunityCount);
  const applied = {
    target: t * WEIGHTS.target,
    trend: tr * WEIGHTS.trend,
    commercial: c * WEIGHTS.commercial,
    consistency: cs * WEIGHTS.consistency,
  };
  const score = (applied.target + applied.trend + applied.commercial + applied.consistency) * 100;
  return {
    score: Math.round(score * 10) / 10,
    breakdown: { target: t, trend: tr, commercial: c, consistency: cs, applied },
  };
}

// -----------------------------------------------------------------------------
// Loader — one call → fully-baked rows. Pulls current + previous + last 4
// completed weeks of per-category stats plus venue baselines in parallel.
// -----------------------------------------------------------------------------

interface CategoryStatRow {
  category_key: string;
  conversion: number | null;
  sales: number | null;
  net_sales: number | null;
  quantity: number | null;
  metric_type: string | null;
  opportunity_count?: number | null;
  week_start: string;
  user_id?: string;
}

const LEGACY_KEYS = ["wine", "cocktail", "dessert", "sides", "spirits", "sparkling"] as const;
type LegacyKey = (typeof LEGACY_KEYS)[number];

export async function loadServerPerformance(args: {
  venueId: string;
  userId: string;
  weekStart: string;
}): Promise<ServerPerformance> {
  const { venueId, userId, weekStart } = args;

  // Pull category definitions + targets + per-category stats for a wide
  // window (current + 4 prior weeks) in one round-trip per resource.
  const [
    vcRes,
    statsRes,
    venueStatsRes,
    tgtRes,
    serverStatsRes,
    pricesMap,
  ] = await Promise.all([
    supabase
      .from("venue_categories")
      .select("key,label,sort_order")
      .eq("venue_id", venueId)
      .order("sort_order"),
    supabase
      .from("server_category_stats")
      .select("category_key,conversion,sales,net_sales,quantity,metric_type,opportunity_count,week_start")
      .eq("venue_id", venueId)
      .eq("user_id", userId)
      .lte("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(40),
    // Venue baseline — all servers, last 8 weeks of completed data.
    supabase
      .from("server_category_stats")
      .select("category_key,conversion,sales,net_sales,quantity,week_start,user_id")
      .eq("venue_id", venueId)
      .lt("week_start", weekStart)
      .gte("week_start", isoOffsetDays(weekStart, -56))
      .limit(2000),
    supabase
      .from("server_category_targets")
      .select("category_key,target")
      .eq("venue_id", venueId)
      .eq("user_id", userId),
    // Legacy fallback + spend per cover context.
    supabase
      .from("server_stats")
      .select("*")
      .eq("venue_id", venueId)
      .eq("user_id", userId)
      .lte("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(8),
    fetchVenueAvgPrices(venueId),
  ]);

  const vc = (vcRes.data ?? []) as { key: string; label: string }[];
  const allStats = (statsRes.data ?? []) as CategoryStatRow[];
  const venueStats = (venueStatsRes.data ?? []) as CategoryStatRow[];
  const tgts = Object.fromEntries(
    ((tgtRes.data ?? []) as { category_key: string; target: number }[]).map((t) => [t.category_key, Number(t.target) || 0]),
  );
  const serverStats = (serverStatsRes.data ?? []) as Array<Record<string, unknown>>;

  // Group per-server stats by category_key (already ordered desc by week).
  const byCat = new Map<string, CategoryStatRow[]>();
  for (const r of allStats) {
    const arr = byCat.get(r.category_key) ?? [];
    arr.push(r);
    byCat.set(r.category_key, arr);
  }

  // Venue baselines — avg conversion per category (across all servers,
  // prior weeks within the 8-week window). Used as fairness reference.
  const venueByCat = new Map<string, CategoryStatRow[]>();
  for (const r of venueStats) {
    const arr = venueByCat.get(r.category_key) ?? [];
    arr.push(r);
    venueByCat.set(r.category_key, arr);
  }

  const useDynamic = vc.length > 0 && allStats.length > 0;
  const keys = useDynamic ? vc.map((c) => c.key) : (LEGACY_KEYS as readonly string[]);
  const labelFor = (k: string) =>
    vc.find((c) => c.key === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);

  // Current-week + prior-week + 4-week-avg helpers --------------------------
  const rows: CategoryMetric[] = [];

  // Spend-per-cover proxy used as a fallback opportunity count when the
  // engine doesn't have a real opportunity_count for the week.
  const currentSrv = serverStats.find((s) => String(s.week_start) === weekStart);
  const covers = Number((currentSrv?.total_covers as number | undefined) ?? 0);

  for (const k of keys) {
    let current = 0;
    let prevWeek = 0;
    let fourWeekValues: number[] = [];
    let target = Number(tgts[k] ?? 0);
    let sales = 0;
    let prevSales = 0;
    let fourWeekSalesValues: number[] = [];
    let quantity = 0;
    let quantitySource: QuantitySource = "fallback";
    let opportunityCount: number | null = null;

    if (useDynamic && byCat.has(k)) {
      const arr = byCat.get(k)!;
      const cur = arr.find((r) => r.week_start === weekStart);
      const priors = arr.filter((r) => r.week_start < weekStart);
      const prev = priors[0];
      const last4 = priors.slice(0, 4);

      current = Number(cur?.conversion ?? 0);
      prevWeek = Number(prev?.conversion ?? 0);
      fourWeekValues = last4.map((r) => Number(r.conversion ?? 0));
      sales = Number(cur?.net_sales ?? cur?.sales ?? 0);
      prevSales = Number(prev?.net_sales ?? prev?.sales ?? 0);
      fourWeekSalesValues = last4.map((r) => Number(r.net_sales ?? r.sales ?? 0));
      opportunityCount = cur?.opportunity_count != null ? Number(cur.opportunity_count) : null;

      const qty = Number(cur?.quantity ?? 0);
      if (qty > 0 || cur?.metric_type === "quantity") {
        quantity = Math.round(qty);
        quantitySource = "real";
      } else if (sales > 0) {
        const price = pricesMap[k];
        if (price && price > 0) {
          quantity = Math.round(sales / price);
          quantitySource = "estimated";
        } else {
          quantity = estimateItemsSold(sales, k as CategoryKey, pricesMap);
          quantitySource = "fallback";
        }
      }
    } else if (LEGACY_KEYS.includes(k as LegacyKey)) {
      const lk = k as LegacyKey;
      const fld = `${lk}_conversion`;
      const sfld = `${lk}_sales`;
      const tfld = `${lk}_target`;
      current = Number((currentSrv?.[fld] as number | undefined) ?? 0);
      const prevSrv = serverStats.find((s) => String(s.week_start) < weekStart);
      prevWeek = Number((prevSrv?.[fld] as number | undefined) ?? 0);
      const priors = serverStats.filter((s) => String(s.week_start) < weekStart).slice(0, 4);
      fourWeekValues = priors.map((s) => Number((s[fld] as number | undefined) ?? 0));
      sales = Number((currentSrv?.[sfld] as number | undefined) ?? 0);
      prevSales = Number((prevSrv?.[sfld] as number | undefined) ?? 0);
      fourWeekSalesValues = priors.map((s) => Number((s[sfld] as number | undefined) ?? 0));
      // Legacy target may live on the matching server_targets row, but in
      // legacy mode we read it from the catTargets map (covered above) or
      // fall back to 0 → ring will render as "—".
      if (!target) {
        // legacy server_targets has cocktail_target etc. — not fetched
        // here, but the dynamic targets path covers it for venues that
        // upgraded. Leaving 0 makes ringPct null in pages.
        target = 0;
      }
      // legacy has no quantity column — always estimated
      if (sales > 0) {
        quantity = estimateItemsSold(sales, lk as CategoryKey, pricesMap);
        quantitySource = pricesMap[lk] ? "estimated" : "fallback";
      }
      target = target || Number((serverStats.find((s) => true)?.[tfld] as number | undefined) ?? 0);
    } else {
      continue; // no data for this key at all
    }

    if (current === 0 && target === 0 && sales === 0 && quantity === 0) {
      // nothing to report on this category for this server/week
      continue;
    }

    const fourWeekAvg = mean(fourWeekValues);
    const fourWeekAvgSales = mean(fourWeekSalesValues);

    const { raw, clamped } = ringPercent(current, target);
    const eliteTier = eliteTierOf(raw);

    const deltaWoW = (prevWeek === 0 && current === 0) ? null : current - prevWeek;
    const deltaVs4wk = fourWeekValues.length ? current - fourWeekAvg : null;

    // PRIMARY status driver: 4wk delta. Falls back to WoW only when we have
    // no historical baseline yet.
    const statusLabel = statusFromDelta(deltaVs4wk ?? deltaWoW ?? null);

    // -------- Fairness / revenue influence -----------------------------
    const venueArr = venueByCat.get(k) ?? [];
    const venueConvValues = venueArr
      .map((r) => Number(r.conversion ?? 0))
      .filter((n) => n > 0);
    const venueBaselineConversion = venueConvValues.length ? mean(venueConvValues) : null;

    // Average unit price for this category (menu-derived, with default
    // fallback baked into estimateItemsSold).
    const avgUnitPrice = pricesMap[k] ?? null;

    // Opportunity proxy: real opportunity_count if present, otherwise the
    // server's covers this week (best blunt proxy). Used both for
    // expected-sales estimate and for revenue influence.
    const opportunityProxy = opportunityCount ?? (covers > 0 ? covers : null);

    const expectedSales =
      venueBaselineConversion != null && opportunityProxy != null && avgUnitPrice != null
        ? // expected attaches ≈ baseline% × opportunity × price
          (venueBaselineConversion / 100) * opportunityProxy * avgUnitPrice
        : null;

    const revenueInfluence =
      venueBaselineConversion != null && opportunityProxy != null && avgUnitPrice != null
        ? Math.round(
            ((current - venueBaselineConversion) / 100) * opportunityProxy * avgUnitPrice,
          )
        : null;

    const { score, breakdown } = performanceScore({
      current,
      target,
      deltaVs4wk,
      currentSales: sales,
      expectedSales,
      fourWeekValues,
      opportunityCount: opportunityCount ?? (covers > 0 ? covers : null),
    });

    rows.push({
      key: k,
      label: labelFor(k),
      denominatorType: categoryDenominator(k),
      current,
      prevWeek,
      fourWeekAvg,
      fourWeekValues,
      target,
      sales,
      prevSales,
      fourWeekAvgSales,
      quantity,
      quantitySource,
      items: quantity,
      rawRingPct: raw,
      ringPct: clamped,
      eliteTier,
      deltaWoW,
      deltaVs4wk,
      statusLabel,
      score,
      scoreBreakdown: breakdown,
      opportunityCount,
      venueBaselineConversion,
      expectedSales,
      avgUnitPrice,
      revenueInfluence,
    });
  }

  // Totals & context
  const sales = rows.reduce((s, r) => s + r.sales, 0);
  const prevSales = rows.reduce((s, r) => s + r.prevSales, 0);
  const fourWeekAvgSales = rows.reduce((s, r) => s + r.fourWeekAvgSales, 0);
  const totalRevenueInfluence = rows.reduce(
    (s, r) => s + (r.revenueInfluence ?? 0),
    0,
  );

  const context: PerformanceContext =
    (currentSrv?.context as PerformanceContext | undefined) ?? {};

  return {
    rows,
    totals: {
      sales,
      prevSales,
      fourWeekAvgSales,
      salesDeltaPctWoW: prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : null,
      salesDeltaPctVs4wk: fourWeekAvgSales > 0 ? ((sales - fourWeekAvgSales) / fourWeekAvgSales) * 100 : null,
      totalRevenueInfluence,
    },
    context,
  };
}

// -----------------------------------------------------------------------------
// Small util — ISO date arithmetic without dragging in a date lib.
// -----------------------------------------------------------------------------
function isoOffsetDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Display helpers — keep visual tone decisions out of the pages.
// -----------------------------------------------------------------------------

export function statusTone(s: TrendStatus): string {
  switch (s) {
    case "Crushing": return "var(--brand-green)";
    case "Strong":   return "var(--brand-green)";
    case "Improving": return "var(--brand-orange)";
    case "Focus":    return "var(--opportunity)";
  }
}

/**
 * Visual treatment cue for the ring when the server is OVER target.
 * Pages translate this into glow / badge / colour intensity. Keeping
 * the mapping centralised so manager + server views match.
 */
export function eliteVisual(tier: EliteTier): { glow: string; badge: string | null } {
  switch (tier) {
    case 3: return { glow: "0 0 24px color-mix(in oklab, var(--brand-green) 60%, transparent)", badge: "ELITE" };
    case 2: return { glow: "0 0 16px color-mix(in oklab, var(--brand-green) 40%, transparent)", badge: "TOP" };
    case 1: return { glow: "0 0 10px color-mix(in oklab, var(--brand-green) 30%, transparent)", badge: null };
    default: return { glow: "none", badge: null };
  }
}

/**
 * Format the items line for the UI with explicit "Est." prefix when not
 * a real POS count.
 */
export function formatItems(row: Pick<CategoryMetric, "quantity" | "quantitySource">): string {
  if (row.quantitySource === "real") return `${row.quantity} sold`;
  return `~${row.quantity} est.`;
}

// -----------------------------------------------------------------------------
// Server-level summary helpers — every manager surface should consume these so
// the team table, server detail, ranking, and coaching all see the same number.
// -----------------------------------------------------------------------------

/**
 * Overall server score (0..100). Weighted average of category scores using
 * each category's expected sales as the weight (commercial weighting). Falls
 * back to current sales, then equal-weight, when expected sales is unknown.
 *
 * This is the single number used for ranking, "Top performer" highlights,
 * and team-table coloring.
 */
export function overallScore(perf: ServerPerformance | null | undefined): number | null {
  const rows = perf?.rows ?? [];
  if (!rows.length) return null;
  let sum = 0;
  let wsum = 0;
  for (const r of rows) {
    const w = (r.expectedSales && r.expectedSales > 0)
      ? r.expectedSales
      : (r.sales > 0 ? r.sales : 1);
    sum += r.score * w;
    wsum += w;
  }
  if (wsum <= 0) return null;
  return Math.round((sum / wsum) * 10) / 10;
}

/** Highest-scoring category with positive 4wk-or-WoW momentum. */
export function bestCategory(perf: ServerPerformance | null | undefined): CategoryMetric | null {
  const rows = perf?.rows ?? [];
  const winners = rows
    .filter((r) => (r.deltaVs4wk ?? r.deltaWoW ?? 0) > 0)
    .sort((a, b) => b.score - a.score);
  return winners[0] ?? null;
}

/** Lowest-scoring category, or the one trending down most vs 4wk. */
export function focusCategory(perf: ServerPerformance | null | undefined): CategoryMetric | null {
  const rows = perf?.rows ?? [];
  if (!rows.length) return null;
  const sorted = rows.slice().sort((a, b) => a.score - b.score);
  return sorted[0];
}

/**
 * Aggregate venue performance — runs the engine for every server in the
 * venue (in parallel) so the team table, leaderboard, and overview cards
 * read from the exact same numbers as the server-facing pages.
 */
export interface VenueServerEntry {
  userId: string;
  perf: ServerPerformance;
  overall: number | null;
}

export interface VenuePerformance {
  servers: VenueServerEntry[];
  byUser: Record<string, VenueServerEntry>;
  ranked: VenueServerEntry[];      // highest overall first
  totals: {
    sales: number;
    prevSales: number;
    fourWeekAvgSales: number;
    salesDeltaPctWoW: number | null;
    salesDeltaPctVs4wk: number | null;
    totalRevenueInfluence: number;
    avgOverall: number | null;
  };
}

export async function loadVenuePerformance(args: {
  venueId: string;
  weekStart: string;
  userIds: string[];
}): Promise<VenuePerformance> {
  const { venueId, weekStart, userIds } = args;
  const entries = await Promise.all(
    userIds.map(async (uid) => {
      const perf = await loadServerPerformance({ venueId, userId: uid, weekStart });
      return { userId: uid, perf, overall: overallScore(perf) };
    }),
  );

  const byUser = Object.fromEntries(entries.map((e) => [e.userId, e]));
  const ranked = entries.slice().sort(
    (a, b) => (b.overall ?? -1) - (a.overall ?? -1),
  );

  const sales = entries.reduce((s, e) => s + e.perf.totals.sales, 0);
  const prevSales = entries.reduce((s, e) => s + e.perf.totals.prevSales, 0);
  const fourWeekAvgSales = entries.reduce((s, e) => s + e.perf.totals.fourWeekAvgSales, 0);
  const totalRevenueInfluence = entries.reduce(
    (s, e) => s + e.perf.totals.totalRevenueInfluence,
    0,
  );
  const overalls = entries.map((e) => e.overall).filter((n): n is number => n !== null);
  const avgOverall = overalls.length ? Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10) / 10 : null;

  return {
    servers: entries,
    byUser,
    ranked,
    totals: {
      sales,
      prevSales,
      fourWeekAvgSales,
      salesDeltaPctWoW: prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : null,
      salesDeltaPctVs4wk: fourWeekAvgSales > 0 ? ((sales - fourWeekAvgSales) / fourWeekAvgSales) * 100 : null,
      totalRevenueInfluence,
      avgOverall,
    },
  };
}

/** Lightweight visual tone from an overall score 0..100. */
export function scoreTone(score: number | null): string {
  if (score === null) return "var(--brand-orange)";
  if (score >= 75) return "var(--brand-green)";
  if (score >= 55) return "var(--brand-orange)";
  return "var(--opportunity)";
}

export function scoreLabel(score: number | null): TrendStatus {
  if (score === null) return "Focus";
  if (score >= 85) return "Crushing";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Improving";
  return "Focus";
}

// -----------------------------------------------------------------------------
// MOTIVATION LAYER — translates internal stats into the simple, emotional
// performance language servers actually react to. The analytical numbers
// (pp, deltas, scores) stay inside the engine; pages should NEVER show "pp"
// or "vs 4wk avg" on server-facing surfaces. Use these helpers instead.
// -----------------------------------------------------------------------------

export type Rag = "green" | "amber" | "red";

/** Strong red/amber/green from ring fill (target progress). */
export function ragFromRing(ringPct: number, hasTarget: boolean): Rag {
  if (!hasTarget) return "amber";
  if (ringPct >= 90) return "green";
  if (ringPct >= 65) return "amber";
  return "red";
}

export function ragColor(rag: Rag): string {
  if (rag === "green") return "var(--brand-green)";
  if (rag === "amber") return "var(--brand-orange)";
  return "var(--opportunity)";
}

export function ragSoftBg(rag: Rag): string {
  const c = ragColor(rag);
  return `color-mix(in oklab, ${c} 14%, white)`;
}

export function ragBorder(rag: Rag): string {
  const c = ragColor(rag);
  return `color-mix(in oklab, ${c} 55%, transparent)`;
}

/** Estimate how many more items needed to hit target this week. */
export function itemsToTarget(row: CategoryMetric): number | null {
  if (!row.target || row.target <= 0) return null;
  if (row.current >= row.target) return 0;
  const opp = row.opportunityCount ?? null;
  if (opp && opp > 0) {
    const gap = (row.target - row.current) / 100;
    return Math.max(1, Math.round(gap * opp));
  }
  if (row.current > 0 && row.items > 0) {
    const ratio = row.target / row.current;
    const projected = Math.round(row.items * ratio);
    return Math.max(1, projected - row.items);
  }
  return null;
}

/** "Up 12% on your usual" / "Down 8% on your usual" / "Right on your usual". */
export function humanMomentum(row: CategoryMetric): { text: string; rag: Rag } | null {
  if (row.fourWeekAvgSales > 0) {
    const pct = ((row.sales - row.fourWeekAvgSales) / row.fourWeekAvgSales) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 3) return { text: "Right on your usual", rag: "amber" };
    if (pct > 0) return { text: `Up ${abs}% on your usual`, rag: "green" };
    return { text: `Down ${abs}% on your usual`, rag: "red" };
  }
  if (row.prevSales > 0) {
    const pct = ((row.sales - row.prevSales) / row.prevSales) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 3) return { text: "Level with last week", rag: "amber" };
    if (pct > 0) return { text: `Up ${abs}% on last week`, rag: "green" };
    return { text: `Down ${abs}% on last week`, rag: "red" };
  }
  return null;
}

export function humanTotalsMomentum(perf: ServerPerformance | null): { text: string; rag: Rag } | null {
  if (!perf) return null;
  const t = perf.totals;
  if (t.fourWeekAvgSales > 0) {
    const pct = ((t.sales - t.fourWeekAvgSales) / t.fourWeekAvgSales) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 3) return { text: "Right on your usual week", rag: "amber" };
    if (pct > 0) return { text: `${abs}% better than your usual week`, rag: "green" };
    return { text: `${abs}% below your usual week`, rag: "red" };
  }
  return null;
}

/** "8 desserts to hit target" / "On target — hold the line" / "Beat target by 3". */
export function humanTargetCall(row: CategoryMetric): string | null {
  if (!row.target || row.target <= 0) return null;
  if (row.current >= row.target) {
    const overPct = Math.round(row.current - row.target);
    if (overPct <= 0) return "On target — hold the line";
    if (overPct >= 50) return "Smashed target — keep flying";
    return `Beat target by ${overPct} points`;
  }
  const itemsNeeded = itemsToTarget(row);
  if (itemsNeeded !== null && itemsNeeded <= 10) {
    return `Only ${itemsNeeded} more ${row.label.toLowerCase()} to hit target`;
  }
  const gap = Math.round(row.target - row.current);
  return `${gap}% to target`;
}

/** "8 more sold than usual" using sales-derived approximation. */
export function humanItemsDelta(row: CategoryMetric): string | null {
  if (row.items <= 0 || row.sales <= 0 || row.fourWeekAvgSales <= 0) return null;
  const avgItems = row.items * (row.fourWeekAvgSales / row.sales);
  const diff = Math.round(row.items - avgItems);
  if (diff === 0) return null;
  const word = row.label.toLowerCase();
  if (diff > 0) return `${diff} more ${word} than usual`;
  return `${Math.abs(diff)} fewer ${word} than usual`;
}

// -----------------------------------------------------------------------------
// LEADERBOARD — backed by the venue_weekly_leaderboard RPC.
// -----------------------------------------------------------------------------

export interface LeaderboardCat {
  sales: number;
  conversion: number | null;
  quantity: number | null;
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string | null;
  current_sales: number;
  prev_sales: number;
  fourwk_avg_sales: number;
  current_by_category: Record<string, LeaderboardCat> | null;
  movementPct: number | null;
  rank: number;
}

export async function loadVenueLeaderboard(args: {
  venueId: string;
  weekStart: string;
}): Promise<LeaderboardRow[]> {
  const { venueId, weekStart } = args;
  const { data, error } = await supabase.rpc("venue_weekly_leaderboard" as never, {
    p_venue_id: venueId,
    p_week_start: weekStart,
  } as never);
  if (error) {
    console.warn("[leaderboard] venue_weekly_leaderboard failed", error);
    return [];
  }
  if (!data) return [];
  const rows = (data as Array<Omit<LeaderboardRow, "movementPct" | "rank">>).map((r) => {
    const cur = Number(r.current_sales) || 0;
    const avg = Number(r.fourwk_avg_sales) || 0;
    return {
      ...r,
      current_sales: cur,
      prev_sales: Number(r.prev_sales) || 0,
      fourwk_avg_sales: avg,
      movementPct: avg > 0 ? ((cur - avg) / avg) * 100 : null,
      rank: 0,
    };
  });
  rows.sort((a, b) => b.current_sales - a.current_sales);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function categoryLeaderboard(
  rows: LeaderboardRow[],
  categoryKey: string,
  limit = 5,
): Array<LeaderboardRow & { catSales: number; catQty: number | null }> {
  return rows
    .map((r) => {
      const cat = r.current_by_category?.[categoryKey];
      return {
        ...r,
        catSales: Number(cat?.sales) || 0,
        catQty: cat?.quantity != null ? Number(cat.quantity) : null,
      };
    })
    .filter((r) => r.catSales > 0)
    .sort((a, b) => b.catSales - a.catSales)
    .slice(0, limit);
}

export function weeklyMovers(rows: LeaderboardRow[], limit = 3): LeaderboardRow[] {
  return rows
    .filter((r) => r.movementPct !== null && r.movementPct > 0)
    .sort((a, b) => (b.movementPct ?? 0) - (a.movementPct ?? 0))
    .slice(0, limit);
}

/** Percentile rank (0..100). 78 means "outperforming 78% of team". */
export function percentileRank(rank: number, total: number): number | null {
  if (!total || total <= 1) return null;
  return Math.round(((total - rank) / (total - 1)) * 100);
}

// -----------------------------------------------------------------------------
// REFLECTION / NEXT-WEEK MOTIVATION LAYER — used by the Server Home page to
// surface a curated, retrospective + forward-looking story of the week.
// The Stats page keeps its own granular language; this layer translates the
// SAME numbers into "what mattered most" + "what to push next week".
// -----------------------------------------------------------------------------

/** Signed momentum % for a category: sales vs 4wk avg, fallback to WoW. */
export function momentumPct(row: CategoryMetric): number | null {
  if (row.fourWeekAvgSales > 0) {
    return ((row.sales - row.fourWeekAvgSales) / row.fourWeekAvgSales) * 100;
  }
  if (row.prevSales > 0) {
    return ((row.sales - row.prevSales) / row.prevSales) * 100;
  }
  return null;
}

/** Color a momentum % with the down=red rule. */
export function ragFromMomentum(pct: number | null): Rag {
  if (pct === null) return "amber";
  if (pct >= 3) return "green";
  if (pct <= -3) return "red";
  return "amber";
}

/** Ring fill scaled to magnitude of movement. 25% movement = full fill. */
export function magnitudeFillPct(pct: number | null): number {
  if (pct === null) return 0;
  return Math.max(8, Math.min(100, Math.abs(pct) * 4));
}

/** Top N categories that mattered MOST this week, by absolute momentum. */
export function topMovers(perf: ServerPerformance | null, n = 3): CategoryMetric[] {
  const rows = perf?.rows ?? [];
  if (!rows.length) return [];
  const withMo = rows
    .map((r) => ({ r, m: momentumPct(r) }))
    .filter((x) => x.m !== null) as { r: CategoryMetric; m: number }[];
  withMo.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
  const picked = withMo.slice(0, n).map((x) => x.r);
  if (picked.length < n) {
    const have = new Set(picked.map((r) => r.key));
    const fillers = rows
      .filter((r) => !have.has(r.key) && (r.target > 0 || r.items > 0))
      .sort((a, b) => b.score - a.score);
    picked.push(...fillers.slice(0, n - picked.length));
  }
  return picked;
}

/** Biggest positive mover (the "win"). */
export function biggestGainer(perf: ServerPerformance | null): CategoryMetric | null {
  const rows = perf?.rows ?? [];
  let best: { r: CategoryMetric; m: number } | null = null;
  for (const r of rows) {
    const m = momentumPct(r);
    if (m === null || m <= 0) continue;
    if (!best || m > best.m) best = { r, m };
  }
  return best?.r ?? null;
}

/** Biggest negative mover (the "miss"). */
export function biggestDecliner(perf: ServerPerformance | null): CategoryMetric | null {
  const rows = perf?.rows ?? [];
  let worst: { r: CategoryMetric; m: number } | null = null;
  for (const r of rows) {
    const m = momentumPct(r);
    if (m === null || m >= 0) continue;
    if (!worst || m < worst.m) worst = { r, m };
  }
  return worst?.r ?? null;
}

/**
 * Best category to push NEXT week — under-target with the largest
 * potential revenue lift. Falls back to the biggest decliner.
 */
export function nextWeekOpportunity(perf: ServerPerformance | null): CategoryMetric | null {
  const rows = perf?.rows ?? [];
  let best: { r: CategoryMetric; v: number } | null = null;
  for (const r of rows) {
    if (!r.target || r.target <= 0 || r.current >= r.target) continue;
    const need = itemsToTarget(r) ?? 0;
    const price = r.avgUnitPrice ?? 0;
    const lift = need * price;
    if (lift <= 0) continue;
    if (!best || lift > best.v) best = { r, v: lift };
  }
  if (best) return best.r;
  return biggestDecliner(perf);
}

/** One-line retrospective summary of the whole week. */
export function weeklyReflection(perf: ServerPerformance | null): { text: string; rag: Rag } | null {
  if (!perf) return null;
  const t = perf.totals;
  if (t.fourWeekAvgSales > 0) {
    const pct = ((t.sales - t.fourWeekAvgSales) / t.fourWeekAvgSales) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 3) return { text: "This week landed right on your usual performance", rag: "amber" };
    if (pct > 0) return { text: `You performed ${abs}% above your usual week`, rag: "green" };
    return { text: `This week finished ${abs}% below your usual`, rag: "red" };
  }
  if (t.prevSales > 0) {
    const pct = ((t.sales - t.prevSales) / t.prevSales) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 3) return { text: "Level with last week", rag: "amber" };
    if (pct > 0) return { text: `Up ${abs}% on last week`, rag: "green" };
    return { text: `Down ${abs}% on last week`, rag: "red" };
  }
  return null;
}

/** Retrospective sentence for a single category. */
export function reflectionLine(row: CategoryMetric): string {
  const m = momentumPct(row);
  if (m === null) return `${row.label} held steady this week`;
  const abs = Math.abs(Math.round(m));
  if (abs < 3) return `${row.label} stayed in line with your usual`;
  if (m > 0) return `${row.label} ran ${abs}% above your usual week`;
  return `${row.label} fell ${abs}% below your usual`;
}

/** Forward-looking opportunity sentence — no "tonight"/"this week" framing. */
export function opportunityLine(row: CategoryMetric): string {
  const word = row.label.toLowerCase();
  const need = itemsToTarget(row);
  if (need !== null && need > 0 && need <= 10) {
    return `Lifting ${word} by ${need} next week would put you back on target`;
  }
  const m = momentumPct(row);
  if (m !== null && m < 0) {
    return `${row.label} is your biggest opportunity to recover next week`;
  }
  return `${row.label} is the easiest win to chase next week`;
}


