/**
 * Phase 20A — Controlled OF v2 Integration & Manager Preview.
 *
 * Thin adapter that wraps the pure `computeOpportunityFactorV2` engine so
 * manager-facing server functions can return a SAFE preview of what OF v2
 * would say for the selected week WITHOUT mutating any committed shift
 * record. The LLS formula is unchanged. Adjusted LLS remains
 * Base LLS ÷ Opportunity Factor.
 *
 * Hard rules carried over from Phase 20:
 *   - Never silently overwrites stored opportunity factors or LLS values.
 *   - Never feeds contextual / SevenRooms / weather / manager notes into
 *     scoring.
 *   - Always returns version, confidence, basis, inputs used / excluded,
 *     warnings, fallback reason and comparison-level diagnostics.
 *   - Falls back to the caller-supplied v1 Trading Pattern Factor when v2
 *     cannot safely calculate.
 *
 * NEVER import from /server/* routes — OF mechanics are manager intelligence.
 */

import {
  computeOpportunityFactorV2,
  OF_V2_CLAMP_MAX,
  OF_V2_CLAMP_MIN,
  OF_V2_NEUTRAL,
  type OfBasis,
  type OfConfidence,
  type OfContextInputs,
  type OfHistoricalPeriod,
  type OfScoringShift,
} from "@/lib/opportunity-factor-v2";

export type OpportunityFactorVersion = "v1" | "v2_preview" | "v2";

/** Material-difference threshold for preview-vs-v1 comparison. */
export const OF_V2_MATERIAL_DELTA = 0.05;

export interface OpportunityFactorPreview {
  /** Which factor was actually applied to the manager-visible Adjusted LLS. */
  opportunity_factor_version: OpportunityFactorVersion;
  /** The factor the caller is using for Adjusted LLS today (unchanged). */
  opportunity_factor: number;
  /** The v1 Trading Pattern Factor fallback (weighted avg of stored grid). */
  opportunity_factor_v1: number | null;
  /** What OF v2 says for this week — preview only, not persisted. */
  opportunity_factor_v2: number | null;
  /** v2 − v1 in absolute factor terms, when both available. */
  opportunity_factor_delta: number | null;
  /** Whether OF v2 would materially change opportunity assessment. */
  materially_different: boolean;
  confidence: OfConfidence;
  basis: OfBasis;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
  fallback_reason: string | null;
  explanation: string;
  /** 1..4 (4 = venue overall baseline). 0 = fallback / no comparison. */
  comparison_level: number;
  comparable_count: number;
  /** Plain operator explanation, safe to render in the manager UI. */
  operator_explanation: string;
}

/** Minimal historical row shape — only the fields actually needed. */
export interface PreviewHistoryRow {
  shift_date: string;
  week_start: string;
  day_of_week: number;
  daypart: string | null;
  outlet?: string | null;
  gross_sales: number | null;
  net_sales?: number | null;
  covers: number | null;
  checks?: number | null;
  /** Labour cost — used as a labour-hours proxy when hours unavailable. */
  labor_cost: number | null;
  /** Real labour hours, if available (e.g. scheduling-leverage path). */
  hours?: number | null;
  /** Stored OF for the shift — used to derive the v1 fallback factor. */
  opportunity_factor: number | null;
}

export interface BuildOfV2PreviewArgs {
  venueId: string;
  weekStart: string;
  history: PreviewHistoryRow[];
  selectedWeek: PreviewHistoryRow[];
  /** Sales basis the venue is uploading. */
  salesBasis?: "net" | "gross";
  /** True when hours come from rate × cost (estimated). */
  laborHoursEstimated?: boolean;
  /** True when covers came from a booking platform. */
  coversFromBookings?: boolean;
  /** Outlet reliable flag — usually false on the v1 single-outlet schema. */
  outletReliable?: boolean;
  /** Optional contextual inputs — scrubbed in the engine, never used to score. */
  context?: OfContextInputs;
}

function safeSum(rows: PreviewHistoryRow[], pick: (r: PreviewHistoryRow) => number | null): number {
  let s = 0;
  for (const r of rows) {
    const v = pick(r);
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Labour-hours proxy: real hours when present, else labour cost. */
function laborHoursProxy(r: PreviewHistoryRow): number {
  if (typeof r.hours === "number" && Number.isFinite(r.hours) && r.hours > 0) return r.hours;
  return typeof r.labor_cost === "number" && r.labor_cost > 0 ? r.labor_cost : 0;
}

function effectiveSales(r: PreviewHistoryRow, basis: "net" | "gross"): number {
  if (basis === "net" && typeof r.net_sales === "number" && r.net_sales > 0) return r.net_sales;
  return typeof r.gross_sales === "number" && r.gross_sales > 0 ? r.gross_sales : 0;
}

function effectiveCovers(r: PreviewHistoryRow): number {
  if (typeof r.covers === "number" && r.covers > 0) return r.covers;
  if (typeof r.checks === "number" && r.checks > 0) return r.checks;
  return 0;
}

/** Compute weighted v1 OF used in the selected week (labour-weighted). */
function weightedV1Factor(rows: PreviewHistoryRow[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const lc = typeof r.labor_cost === "number" ? r.labor_cost : 0;
    const of = typeof r.opportunity_factor === "number" && r.opportunity_factor > 0
      ? r.opportunity_factor
      : 1;
    if (lc > 0) {
      num += lc * of;
      den += lc;
    }
  }
  if (den <= 0) return null;
  return num / den;
}

/**
 * Build an OF v2 preview for the selected week.
 *
 * - History rows from the venue's last N weeks (excluding selected week).
 * - Selected week is aggregated into a single synthetic scoring shift.
 * - Falls back to v1 (weighted from stored shift OF) when v2 cannot compute.
 * - NEVER persists anything.
 */
export function buildOfV2Preview(args: BuildOfV2PreviewArgs): OpportunityFactorPreview {
  const salesBasis: "net" | "gross" = args.salesBasis ?? "gross";
  const laborHoursEstimated = args.laborHoursEstimated ?? true; // proxy by default

  // 1. v1 fallback — weighted across the selected week's labour cost.
  const v1Factor = weightedV1Factor(args.selectedWeek);

  // 2. Aggregate the selected week into a single OfScoringShift.
  const selSales = safeSum(args.selectedWeek, (r) => effectiveSales(r, salesBasis));
  const selCovers = safeSum(args.selectedWeek, (r) => effectiveCovers(r));
  const selChecks = selCovers; // proxy: checks ≈ covers when checks not captured
  const selHours = safeSum(args.selectedWeek, (r) => laborHoursProxy(r));

  const scoringShift: OfScoringShift = {
    venue_id: args.venueId,
    week_start: args.weekStart,
    // synthetic aggregate — level 4 (venue baseline) will match it
    day_of_week: -1 as unknown as number,
    daypart: "_week_aggregate_",
    outlet_id: null,
    outlet_reliable: !!args.outletReliable,
    sales: selSales,
    sales_basis: salesBasis,
    checks: selChecks,
    covers: selCovers > 0 ? selCovers : null,
    covers_from_bookings: !!args.coversFromBookings,
    labor_hours: selHours,
    labor_hours_estimated: laborHoursEstimated,
    service_hours: selHours,
  };

  // 3. History → one OfHistoricalPeriod per past shift (excluding selected week).
  const history: OfHistoricalPeriod[] = [];
  for (const r of args.history) {
    if (r.week_start === args.weekStart) continue;
    const sales = effectiveSales(r, salesBasis);
    const hours = laborHoursProxy(r);
    if (sales <= 0 || hours <= 0) continue;
    history.push({
      week_start: r.week_start,
      day_of_week: r.day_of_week,
      daypart: r.daypart ?? "_unknown_",
      outlet_id: r.outlet ?? null,
      sales,
      sales_basis: salesBasis,
      checks: typeof r.checks === "number" && r.checks > 0 ? r.checks : effectiveCovers(r),
      covers: typeof r.covers === "number" && r.covers > 0 ? r.covers : null,
      covers_from_bookings: false,
      labor_hours: hours,
      labor_hours_estimated: laborHoursEstimated,
      service_hours: hours,
    });
  }

  const engine = computeOpportunityFactorV2({
    shift: scoringShift,
    history,
    context: args.context,
    v1FallbackFactor: v1Factor ?? OF_V2_NEUTRAL,
  });

  const v2 = engine.opportunity_factor;
  const fellBack = engine.fallback_reason != null;
  const version: OpportunityFactorVersion = fellBack ? "v1" : "v2_preview";
  const applied = v1Factor ?? OF_V2_NEUTRAL; // we DO NOT change committed values
  const delta = v1Factor != null ? v2 - v1Factor : null;
  const materially_different =
    delta != null && Math.abs(delta) >= OF_V2_MATERIAL_DELTA && engine.confidence !== "low";

  // Clamp safety — engine already clamps; belt-and-braces.
  const opportunity_factor = Math.min(OF_V2_CLAMP_MAX, Math.max(OF_V2_CLAMP_MIN, applied));

  const operator_explanation = [
    "Opportunity Factor v2 is based on POS check volume, POS sales volume, labour hours, daypart and historical venue baseline.",
    "Section / SevenRooms / weather / manager-notes data was not used because it is contextual or unverified.",
    fellBack
      ? "Not enough comparable history yet — the v1 Trading Pattern Factor is still in use."
      : `Comparable history found (${engine.comparable_count} periods at level ${engine.comparison_level}).`,
    engine.confidence === "low"
      ? "Confidence is low — preview is shown but no hard deployment recommendation is made."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    opportunity_factor_version: version,
    opportunity_factor,
    opportunity_factor_v1: v1Factor,
    opportunity_factor_v2: v2,
    opportunity_factor_delta: delta,
    materially_different,
    confidence: engine.confidence,
    basis: engine.basis,
    inputs_used: engine.inputs_used,
    inputs_excluded: engine.inputs_excluded,
    warnings: engine.warnings,
    fallback_reason: engine.fallback_reason,
    explanation: engine.explanation,
    comparison_level: engine.comparison_level,
    comparable_count: engine.comparable_count,
    operator_explanation,
  };
}
