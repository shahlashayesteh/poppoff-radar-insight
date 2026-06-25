/**
 * Phase 20A — Controlled OF v2 Integration & Manager Preview.
 * Phase 20B — Granularity & Data-Quality Hardening.
 *
 * Thin adapter that wraps the pure `computeOpportunityFactorV2` engine so
 * manager-facing server functions can return a SAFE preview of what OF v2
 * would say for the selected week WITHOUT mutating any committed shift
 * record. The LLS formula is unchanged. Adjusted LLS remains
 * Base LLS ÷ Opportunity Factor.
 *
 * Phase 20B adds:
 *   - per-daypart and per-day-of-week preview buckets (decision-grade
 *     when hours are measured, preview-only when hours are proxied).
 *   - explicit hours-source metadata (paid/clock/labour-export/proxy/missing)
 *     so the UI can never display a labour-cost-proxy result as "measured".
 *   - decision-grade guardrails — low-confidence buckets are labelled
 *     "preview only" and `can_drive_hard_recommendation` is false.
 *
 * Hard rules carried over from Phase 20 / 20A:
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

/**
 * Phase 20B — Hours-source classification.
 *
 *   paid_hours          — measured, strongest
 *   clock_hours         — measured, strong
 *   labour_export_hours — measured, strong
 *   labour_cost_proxy   — ESTIMATED — confidence downgraded, warning attached
 *   missing_hours       — cannot score, no hard recommendation
 */
export type HoursSource =
  | "paid_hours"
  | "clock_hours"
  | "labour_export_hours"
  | "labour_cost_proxy"
  | "missing_hours";

/**
 * Phase 20B — Decision-grade label.
 *
 *   manager_analysis      — high confidence + measured hours
 *   manager_review        — medium confidence OR mixed quality
 *   preview_only          — low confidence OR labour-cost proxy
 *   not_for_decision      — missing hours or hard fallback
 */
export type DecisionGrade =
  | "manager_analysis"
  | "manager_review"
  | "preview_only"
  | "not_for_decision";

export interface OpportunityFactorPreviewBucket {
  /** Bucket key (e.g. "Mon", "Tue" or "lunch", "dinner"). */
  key: string;
  /** Bucket axis. */
  axis: "day_of_week" | "daypart";
  opportunity_factor_v2: number | null;
  opportunity_factor_v1: number | null;
  opportunity_factor_delta: number | null;
  confidence: OfConfidence;
  basis: OfBasis;
  hours_source: HoursSource;
  decision_grade: DecisionGrade;
  /** True only when high-confidence + measured hours. */
  can_drive_hard_recommendation: boolean;
  comparable_count: number;
  fallback_reason: string | null;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
}

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
  /** Phase 20B — explicit hours-source classification. */
  hours_source: HoursSource;
  /** Phase 20B — decision-grade label. */
  decision_grade: DecisionGrade;
  /** Phase 20B — hard guardrail. */
  can_drive_hard_recommendation: boolean;
  /** Phase 20B — per-axis preview buckets. */
  buckets: {
    by_daypart: OpportunityFactorPreviewBucket[];
    by_day_of_week: OpportunityFactorPreviewBucket[];
  };
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
  /** Phase 20B — explicit hours from labour-export rows. */
  paid_hours?: number | null;
  /** Phase 20B — explicit hours from POS / clock spans. */
  clock_hours?: number | null;
  /** Phase 20B — explicit hours from labour-export file. */
  labour_export_hours?: number | null;
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
  /**
   * Deprecated: caller-asserted estimation flag. Phase 20B derives the
   * hours-source automatically from row contents and downgrades from there.
   * Kept for back-compat — still respected if caller sets it true.
   */
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

/** Phase 20B — pick the strongest hours value per row, in priority order. */
function rowHoursAndSource(r: PreviewHistoryRow): { hours: number; source: HoursSource } {
  const paid = typeof r.paid_hours === "number" && r.paid_hours > 0 ? r.paid_hours : 0;
  if (paid > 0) return { hours: paid, source: "paid_hours" };
  const clock = typeof r.clock_hours === "number" && r.clock_hours > 0 ? r.clock_hours : 0;
  if (clock > 0) return { hours: clock, source: "clock_hours" };
  const exp = typeof r.labour_export_hours === "number" && r.labour_export_hours > 0
    ? r.labour_export_hours : 0;
  if (exp > 0) return { hours: exp, source: "labour_export_hours" };
  const generic = typeof r.hours === "number" && r.hours > 0 ? r.hours : 0;
  if (generic > 0) return { hours: generic, source: "clock_hours" };
  const cost = typeof r.labor_cost === "number" && r.labor_cost > 0 ? r.labor_cost : 0;
  if (cost > 0) return { hours: cost, source: "labour_cost_proxy" };
  return { hours: 0, source: "missing_hours" };
}

/**
 * Phase 20B — classify the dominant hours-source across a set of rows.
 *
 * Priority (strongest wins when ANY row has it):
 *   paid_hours > clock_hours > labour_export_hours > labour_cost_proxy
 *
 * If every row is missing hours → "missing_hours".
 */
export function classifyHoursSource(rows: PreviewHistoryRow[]): HoursSource {
  let hasPaid = false, hasClock = false, hasExport = false, hasProxy = false, hasAny = false;
  for (const r of rows) {
    const { source, hours } = rowHoursAndSource(r);
    if (hours > 0) hasAny = true;
    if (source === "paid_hours") hasPaid = true;
    else if (source === "clock_hours") hasClock = true;
    else if (source === "labour_export_hours") hasExport = true;
    else if (source === "labour_cost_proxy") hasProxy = true;
  }
  if (hasPaid) return "paid_hours";
  if (hasClock) return "clock_hours";
  if (hasExport) return "labour_export_hours";
  if (hasProxy) return "labour_cost_proxy";
  return hasAny ? "labour_cost_proxy" : "missing_hours";
}

/** True only when hours come from a measured source (not a proxy / missing). */
export function isMeasuredHoursSource(s: HoursSource): boolean {
  return s === "paid_hours" || s === "clock_hours" || s === "labour_export_hours";
}

/**
 * Phase 20B — decision-grade derivation.
 *
 * Guardrails:
 *   - missing hours OR hard fallback        → "not_for_decision"
 *   - labour-cost proxy OR low confidence   → "preview_only"
 *   - high confidence + measured hours      → "manager_analysis"
 *   - otherwise                             → "manager_review"
 *
 * `can_drive_hard_recommendation` requires manager_analysis.
 */
export function deriveDecisionGrade(args: {
  confidence: OfConfidence;
  hoursSource: HoursSource;
  fellBack: boolean;
}): { decision_grade: DecisionGrade; can_drive_hard_recommendation: boolean } {
  if (args.hoursSource === "missing_hours" || args.fellBack) {
    return { decision_grade: "not_for_decision", can_drive_hard_recommendation: false };
  }
  if (args.confidence === "low" || args.hoursSource === "labour_cost_proxy") {
    return { decision_grade: "preview_only", can_drive_hard_recommendation: false };
  }
  if (args.confidence === "high" && isMeasuredHoursSource(args.hoursSource)) {
    return { decision_grade: "manager_analysis", can_drive_hard_recommendation: true };
  }
  return { decision_grade: "manager_review", can_drive_hard_recommendation: false };
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

/** Day-of-week short label (ISO Mon=1..Sun=7 or JS Sun=0..Sat=6 — caller-defined). */
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dowLabel(d: number): string {
  if (d < 0) return "?";
  return DOW_LABELS[d % 7] ?? String(d);
}

interface BucketDescriptor {
  axis: "day_of_week" | "daypart";
  key: string;
  selRows: PreviewHistoryRow[];
  histRows: PreviewHistoryRow[];
}

/** Build a single bucket result by running the v2 engine on a sub-slice. */
function buildBucket(
  desc: BucketDescriptor,
  base: BuildOfV2PreviewArgs,
  salesBasis: "net" | "gross",
  callerLaborHoursEstimated: boolean,
): OpportunityFactorPreviewBucket {
  const hoursSource = classifyHoursSource([...desc.selRows, ...desc.histRows]);
  const selHours = safeSum(desc.selRows, (r) => rowHoursAndSource(r).hours);
  const selSales = safeSum(desc.selRows, (r) => effectiveSales(r, salesBasis));
  const selCovers = safeSum(desc.selRows, (r) => effectiveCovers(r));
  const v1 = weightedV1Factor(desc.selRows);

  const scoringShift: OfScoringShift = {
    venue_id: base.venueId,
    week_start: base.weekStart,
    day_of_week: desc.axis === "day_of_week"
      ? Number(desc.key) || (desc.selRows[0]?.day_of_week ?? -1)
      : (desc.selRows[0]?.day_of_week ?? -1),
    daypart: desc.axis === "daypart" ? desc.key : (desc.selRows[0]?.daypart ?? "_bucket_"),
    outlet_id: null,
    outlet_reliable: !!base.outletReliable,
    sales: selSales,
    sales_basis: salesBasis,
    checks: selCovers,
    covers: selCovers > 0 ? selCovers : null,
    covers_from_bookings: !!base.coversFromBookings,
    labor_hours: selHours,
    labor_hours_estimated: callerLaborHoursEstimated || hoursSource === "labour_cost_proxy",
    service_hours: selHours,
  };

  const histEngine: OfHistoricalPeriod[] = [];
  for (const r of desc.histRows) {
    const sales = effectiveSales(r, salesBasis);
    const { hours } = rowHoursAndSource(r);
    if (sales <= 0 || hours <= 0) continue;
    histEngine.push({
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
      labor_hours_estimated: hoursSource === "labour_cost_proxy",
      service_hours: hours,
    });
  }

  const engine = computeOpportunityFactorV2({
    shift: scoringShift,
    history: histEngine,
    context: base.context,
    v1FallbackFactor: v1 ?? OF_V2_NEUTRAL,
  });
  const fellBack = engine.fallback_reason != null;
  const v2 = fellBack ? null : engine.opportunity_factor;
  const delta = v2 != null && v1 != null ? v2 - v1 : null;
  const { decision_grade, can_drive_hard_recommendation } = deriveDecisionGrade({
    confidence: engine.confidence,
    hoursSource,
    fellBack,
  });

  const warnings = [...engine.warnings];
  if (hoursSource === "labour_cost_proxy") {
    warnings.push(
      "Hours are estimated from labour cost — preview only, not decision-grade.",
    );
  } else if (hoursSource === "missing_hours") {
    warnings.push(
      "Hours missing — no hard recommendation can be made from this bucket.",
    );
  }

  return {
    key: desc.key,
    axis: desc.axis,
    opportunity_factor_v2: v2,
    opportunity_factor_v1: v1,
    opportunity_factor_delta: delta,
    confidence: engine.confidence,
    basis: engine.basis,
    hours_source: hoursSource,
    decision_grade,
    can_drive_hard_recommendation,
    comparable_count: engine.comparable_count,
    fallback_reason: engine.fallback_reason,
    inputs_used: engine.inputs_used,
    inputs_excluded: engine.inputs_excluded,
    warnings,
  };
}

/**
 * Build an OF v2 preview for the selected week.
 *
 * - History rows from the venue's last N weeks (excluding selected week).
 * - Selected week is aggregated into a single synthetic scoring shift.
 * - Falls back to v1 (weighted from stored shift OF) when v2 cannot compute.
 * - Phase 20B: also returns per-daypart and per-day-of-week preview buckets,
 *   hours-source classification, and decision-grade guardrails.
 * - NEVER persists anything.
 */
export function buildOfV2Preview(args: BuildOfV2PreviewArgs): OpportunityFactorPreview {
  const salesBasis: "net" | "gross" = args.salesBasis ?? "gross";
  const callerLaborEstimated = args.laborHoursEstimated ?? false;

  // 1. v1 fallback — weighted across the selected week's labour cost.
  const v1Factor = weightedV1Factor(args.selectedWeek);

  // 2. Hours-source classification across the whole window.
  const overallHoursSource = classifyHoursSource([...args.selectedWeek, ...args.history]);
  const hoursAreEstimated =
    callerLaborEstimated || overallHoursSource === "labour_cost_proxy";

  // 3. Aggregate the selected week into a single OfScoringShift.
  const selSales = safeSum(args.selectedWeek, (r) => effectiveSales(r, salesBasis));
  const selCovers = safeSum(args.selectedWeek, (r) => effectiveCovers(r));
  const selChecks = selCovers; // proxy: checks ≈ covers when checks not captured
  const selHours = safeSum(args.selectedWeek, (r) => rowHoursAndSource(r).hours);

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
    labor_hours_estimated: hoursAreEstimated,
    service_hours: selHours,
  };

  // 4. History → one OfHistoricalPeriod per past shift (excluding selected week).
  const history: OfHistoricalPeriod[] = [];
  for (const r of args.history) {
    if (r.week_start === args.weekStart) continue;
    const sales = effectiveSales(r, salesBasis);
    const { hours } = rowHoursAndSource(r);
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
      labor_hours_estimated: hoursAreEstimated,
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

  // Phase 20B — overall decision-grade.
  const { decision_grade, can_drive_hard_recommendation } = deriveDecisionGrade({
    confidence: engine.confidence,
    hoursSource: overallHoursSource,
    fellBack,
  });

  const extraWarnings: string[] = [];
  if (overallHoursSource === "labour_cost_proxy") {
    extraWarnings.push(
      "Hours are estimated from labour cost — preview only, not decision-grade.",
    );
  } else if (overallHoursSource === "missing_hours") {
    extraWarnings.push(
      "Hours missing — no hard recommendation can be made.",
    );
  }

  // Phase 20B — per-axis preview buckets.
  const dpKeys = Array.from(
    new Set(args.selectedWeek.map((r) => (r.daypart ?? "").trim()).filter(Boolean)),
  );
  const by_daypart: OpportunityFactorPreviewBucket[] = dpKeys.map((dp) =>
    buildBucket(
      {
        axis: "daypart",
        key: dp,
        selRows: args.selectedWeek.filter((r) => (r.daypart ?? "") === dp),
        histRows: args.history.filter(
          (r) => r.week_start !== args.weekStart && (r.daypart ?? "") === dp,
        ),
      },
      args,
      salesBasis,
      callerLaborEstimated,
    ),
  );

  const dowKeys = Array.from(new Set(args.selectedWeek.map((r) => r.day_of_week))).sort(
    (a, b) => a - b,
  );
  const by_day_of_week: OpportunityFactorPreviewBucket[] = dowKeys.map((d) =>
    buildBucket(
      {
        axis: "day_of_week",
        key: dowLabel(d),
        selRows: args.selectedWeek.filter((r) => r.day_of_week === d),
        histRows: args.history.filter(
          (r) => r.week_start !== args.weekStart && r.day_of_week === d,
        ),
      },
      args,
      salesBasis,
      callerLaborEstimated,
    ),
  );

  const operator_explanation = [
    "Opportunity Factor v2 is based on POS check volume, POS sales volume, labour hours, daypart and historical venue baseline.",
    overallHoursSource === "labour_cost_proxy"
      ? "Hours are estimated from labour cost, so this is preview-only."
      : overallHoursSource === "missing_hours"
        ? "Hours are missing — no hard recommendation is made."
        : `Hours are measured from ${overallHoursSource.replace(/_/g, " ")}.`,
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
    warnings: [...engine.warnings, ...extraWarnings],
    fallback_reason: engine.fallback_reason,
    explanation: engine.explanation,
    comparison_level: engine.comparison_level,
    comparable_count: engine.comparable_count,
    operator_explanation,
    hours_source: overallHoursSource,
    decision_grade,
    can_drive_hard_recommendation,
    buckets: { by_daypart, by_day_of_week },
  };
}
