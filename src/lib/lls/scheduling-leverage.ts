// Scheduling Leverage Matrix — manager-only rota decision intelligence.
//
// Goal: for every (server × outlet × day × daypart), decide where placing
// that server creates the most MARGINAL commercial value vs. the current
// rota baseline — gated by what is operationally realistic given the
// server's observed working pattern and outlet eligibility.
//
// Outlets are kept strictly separate. Cross-outlet recommendations are
// blocked unless (a) the server has shifts in that outlet, (b) manager
// has marked them cross-outlet eligible, or (c) the employee master flags
// them as cross-outlet eligible.
//
// Used only by /manager/lls. No imports from this file are allowed in any
// /server/* route.

import { aggregate as engineAggregate, type ShiftRow as EngineShiftRow } from "@/lib/metrics/lls";

// ---------- inputs ----------

export interface LeverageShiftRow {
  server_id: string;
  server_name: string;
  shift_date: string; // ISO yyyy-mm-dd
  day_of_week: number; // 0=Mon … 6=Sun
  daypart: string;
  outlet?: string | null;
  gross_sales: number | null;
  net_sales?: number | null;
  covers: number | null;
  hours?: number | null;
  checks?: number | null;
  labor_cost: number | null;
  opportunity_factor: number | null;
  category_sales?: Record<string, number | null> | null;
  category_target_rate?: Record<string, number | null> | null;
  match_confidence?: number | null; // 0..1 imported join confidence
  /** Optional clock window for unique-shift identification. */
  shift_start?: string | null;
  shift_end?: string | null;
}

export type OutletBasis =
  | "uploaded"
  | "inferred_from_filename"
  | "venue_fallback"
  | "missing";

export interface LeverageEngineOptions {
  targetMultiplier?: number;
  reliabilityShiftFloor?: number; // default 6
  reliabilityHoursFloor?: number; // default 24
  reliabilityCheckFloor?: number; // default 80
  /** Servers explicitly allowed to be recommended cross-outlet (manager / HR). */
  crossOutletEligibility?: Record<string, boolean>;
  /** Outlet inferred from upload file name when rows have no outlet column. */
  outletInferredFromFile?: string | null;
  /** Outlet provenance label — drives the data-used strip. */
  outletBasis?: OutletBasis;
  /** Optional contracted shifts/week per server (overrides observed P75 cap). */
  contractedShiftsPerWeek?: Record<string, number>;
  contractedHoursPerWeek?: Record<string, number>;
  /** Maximum recommendations returned in the actionable table. */
  maxRecommendations?: number;
  /** Period metadata for the rows passed in (echoed back in the result). */
  period?: { start: string; end: string; weeks: number };
  /** Whether the scorecard's selected week has any matched shifts. */
  selectedWeekHasShifts?: boolean;
  /** Selected week start (ISO yyyy-mm-dd) for the contextual notice. */
  selectedWeekStart?: string;
}

// ---------- outputs ----------

export type RecommendationType =
  | "best_overall_leverage"
  | "slow_shift_lifter"
  | "peak_performer"
  | "high_rpc_specialist"
  | "throughput_specialist"
  | "underused_capability"
  | "development_shift"
  | "protect_from_mismatch";

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient";

export type CellLabel =
  | "best_fit"
  | "good_fit"
  | "test_monitor"
  | "requires_availability"
  | "avoid_for_now"
  | "not_eligible"
  | "insufficient_data";

export type MatrixScope =
  | "outlet_scoped"
  | "single_outlet_inferred"
  | "daypart_only";

export type WorkingPattern =
  | "likely_part_time"
  | "likely_full_time"
  | "variable"
  | "unknown";

export interface ShiftTypeBaseline {
  key: string;
  outlet: string | null;
  day_of_week: number;
  daypart: string;
  // venue / outlet baseline
  baseline_rpc: number | null;
  baseline_rph: number | null;
  baseline_cph: number | null;
  baseline_adjusted_lls: number | null;
  // expected workload
  expected_covers: number | null;
  expected_hours: number | null;
  expected_checks: number | null;
  shift_count: number;
  // current deployment (weighted across servers currently working this shift)
  current_deployment_rpc: number | null;
  current_deployment_rph: number | null;
  current_deployment_adjusted_lls: number | null;
  current_baseline_sales: number | null;
  // headroom (top-quartile target vs current deployment)
  target_rpc: number | null;
  target_rph: number | null;
  target_adjusted_lls: number | null;
  rpc_headroom: number;
  rph_headroom: number;
  lls_headroom: number;
  opportunity_need: number;
  opportunity_factor_typical: number;
  // category baselines (rate per cover)
  category_baseline_rate: Record<string, number>;
  category_target_rate: Record<string, number>;
  // data quality flags for this shift type
  has_covers: boolean;
  has_hours: boolean;
  has_checks: boolean;
}

export interface ServerWorkingPattern {
  server_id: string;
  active_weeks: number;
  total_shifts: number;             // unique shifts (deduped)
  total_worked_days: number;        // unique calendar days worked
  avg_shifts_per_week: number;
  p75_shifts_per_week: number;
  max_shifts_per_week: number;
  avg_worked_days_per_week: number;
  avg_hours_per_week: number;
  p75_hours_per_week: number;
  max_hours_per_week: number;
  usual_days: number[];
  usual_dayparts: string[];
  usual_outlets: string[];
  pattern: WorkingPattern;
  pattern_label: string;
  has_contracted_hours: boolean;
}

export interface ServerShiftCell {
  server_id: string;
  server_name: string;
  shift_type: string;
  baseline: ShiftTypeBaseline;
  // raw weighted server metrics in this shift type
  server_rpc: number | null;
  server_rph: number | null;
  server_cph: number | null;
  server_adjusted_lls: number | null;
  // projected (shrunk toward outlet profile and shift baseline)
  projected_rpc: number | null;
  projected_rph: number | null;
  projected_cph: number | null;
  projected_adjusted_lls: number | null;
  // specialist indexes (>1 = above current deployment / baseline)
  rpc_index: number;
  rph_index: number;
  throughput_index: number;
  adjusted_lls_index: number;
  category_fit: number;
  category_fit_status: "neutral_no_data" | "computed";
  consistency_score: number;
  // sample
  reliability: number;
  comparable_shifts: number;
  comparable_hours: number;
  comparable_checks: number;
  current_allocation_share: number;
  // modelled
  projected_sales: number | null;
  current_baseline_sales: number | null;
  modelled_marginal_lift: number | null;
  projected_labour_cost: number | null;
  projected_adjusted_lls_for_shift: number | null;
  marginal_leverage_gain: number | null;
  // feasibility
  outlet_eligibility: number;
  outlet_eligibility_reason: string;
  day_pattern_fit: number;
  daypart_pattern_fit: number;
  weekly_capacity_fit: number;
  hours_capacity_fit: number;
  rest_burnout_fit: number;
  schedule_feasibility: number;
  // scoring
  marginal_deployment_value: number;
  development_priority: number;
  confidence: number;
  confidence_band: ConfidenceBand;
  rota_test_priority: number;
  positive_lift_gate: 0 | 1;
  cell_label: CellLabel;
  reasons: string[];
  warnings: string[];
}

export interface ServerRecommendation {
  server_id: string;
  server_name: string;
  recommendation_type: RecommendationType;
  best_fit_shift: string;
  current_pattern: string;
  why: string;
  suggested_rota_test: string;
  modelled_opportunity: number | null;
  confidence: ConfidenceBand;
  marginal_deployment_value: number;
  rota_test_priority: number;
  schedule_feasibility: number;
  requires_confirmation: boolean;
}

export interface SchedulingLeverageResult {
  matrix_scope: MatrixScope;
  outlet_inferred_from_file: string | null;
  shift_types: ShiftTypeBaseline[];
  servers: { id: string; name: string; pattern: ServerWorkingPattern }[];
  matrix: ServerShiftCell[];
  highlights: {
    best_overall_leverage: ServerRecommendation | null;
    best_slow_shift_lifter: ServerRecommendation | null;
    best_peak_performer: ServerRecommendation | null;
    best_rpc_builder: ServerRecommendation | null;
    best_throughput: ServerRecommendation | null;
    most_underused: ServerRecommendation | null;
    biggest_coaching_opportunity: ServerRecommendation | null;
  };
  recommendations: ServerRecommendation[];
  data_quality: {
    rows_total: number;
    rows_with_covers: number;
    rows_with_hours: number;
    rows_with_labor: number;
    rows_with_checks: number;
    matched_for_lls: number;
    distinct_servers: number;
    distinct_outlets: number;
    distinct_shift_types: number;
    has_outlet: boolean;
    has_category: boolean;
    has_checks: boolean;
    cross_outlet_recommendations_enabled: boolean;
    notes: string[];
  };
}

// ---------- helpers ----------

const isPos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ofOrOne = (v: unknown) => (isPos(v) ? (v as number) : 1);

function shiftTypeKey(outlet: string | null, dow: number, daypart: string): string {
  return `${outlet ?? ""}|${dow}|${daypart}`;
}

function toEngineRow(r: LeverageShiftRow): EngineShiftRow {
  return {
    gross_sales: r.gross_sales ?? null,
    net_sales: r.net_sales ?? null,
    total_labor_cost: r.labor_cost ?? null,
    opportunity_factor: r.opportunity_factor ?? 1,
  };
}

function weightedRpc(rows: LeverageShiftRow[]): number | null {
  let s = 0, c = 0;
  for (const r of rows) if (isPos(r.gross_sales) && isPos(r.covers)) { s += r.gross_sales!; c += r.covers!; }
  return c > 0 ? s / c : null;
}
function weightedRph(rows: LeverageShiftRow[]): number | null {
  let s = 0, h = 0;
  for (const r of rows) if (isPos(r.gross_sales) && isPos(r.hours ?? null)) { s += r.gross_sales!; h += r.hours!; }
  return h > 0 ? s / h : null;
}
function weightedCph(rows: LeverageShiftRow[]): number | null {
  let c = 0, h = 0;
  for (const r of rows) if (isPos(r.covers) && isPos(r.hours ?? null)) { c += r.covers!; h += r.hours!; }
  return h > 0 ? c / h : null;
}
function adjustedLlsFromRows(rows: LeverageShiftRow[]): number | null {
  if (!rows.length) return null;
  const agg = engineAggregate(rows.map(toEngineRow), { allowMixedLaborBasis: true });
  return agg.adjustedLLS.value;
}

function percentile(values: number[], q: number): number | null {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.floor(v.length * q);
  return v[Math.min(idx, v.length - 1)];
}
function median(values: number[]): number | null {
  return percentile(values, 0.5);
}
function topQuartile(values: number[]): number | null {
  return percentile(values, 0.75);
}
function stddev(values: number[]): number {
  const v = values.filter(isNum);
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

function bandConfidence(c: number): ConfidenceBand {
  if (c >= 0.8) return "high";
  if (c >= 0.6) return "medium";
  if (c >= 0.4) return "low";
  return "insufficient";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function humanShiftLabel(b: ShiftTypeBaseline): string {
  const day = DAY_NAMES[b.day_of_week] ?? `Day ${b.day_of_week}`;
  const head = b.outlet ? `${b.outlet} ${day}` : day;
  return `${head} ${b.daypart}`;
}

// ISO week key for week-bucketing observed pattern.
function isoWeekKey(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  if (isNaN(d.getTime())) return dateIso;
  // Thursday in current week decides the year.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------- working pattern ----------

function computeWorkingPattern(
  serverId: string,
  rows: LeverageShiftRow[],
  opts: LeverageEngineOptions,
): ServerWorkingPattern {
  const mine = rows.filter((r) => r.server_id === serverId);
  const byWeek = new Map<string, LeverageShiftRow[]>();
  for (const r of mine) {
    const k = isoWeekKey(r.shift_date);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(r);
  }
  const weeklyShifts = [...byWeek.values()].map((w) => w.length);
  const weeklyHours = [...byWeek.values()].map((w) =>
    w.reduce((a, r) => a + (isPos(r.hours ?? null) ? r.hours! : 0), 0),
  );

  const dayCounts = new Map<number, number>();
  const dayPartCounts = new Map<string, number>();
  const outletCounts = new Map<string, number>();
  for (const r of mine) {
    dayCounts.set(r.day_of_week, (dayCounts.get(r.day_of_week) ?? 0) + 1);
    dayPartCounts.set(r.daypart, (dayPartCounts.get(r.daypart) ?? 0) + 1);
    if (r.outlet) outletCounts.set(r.outlet, (outletCounts.get(r.outlet) ?? 0) + 1);
  }

  const active_weeks = byWeek.size;
  const total_shifts = mine.length;
  const avg_shifts_per_week = active_weeks > 0 ? total_shifts / active_weeks : 0;
  const p75_shifts_per_week = percentile(weeklyShifts, 0.75) ?? 0;
  const max_shifts_per_week = weeklyShifts.length ? Math.max(...weeklyShifts) : 0;
  const totalHrs = weeklyHours.reduce((a, b) => a + b, 0);
  const avg_hours_per_week = active_weeks > 0 ? totalHrs / active_weeks : 0;
  const p75_hours_per_week = percentile(weeklyHours, 0.75) ?? 0;
  const max_hours_per_week = weeklyHours.length ? Math.max(...weeklyHours) : 0;

  // "Usual" = day/daypart/outlet that the server worked in ≥30% of active weeks.
  const weeksByDay = new Map<number, Set<string>>();
  const weeksByDp = new Map<string, Set<string>>();
  for (const [wk, list] of byWeek) {
    for (const r of list) {
      if (!weeksByDay.has(r.day_of_week)) weeksByDay.set(r.day_of_week, new Set());
      weeksByDay.get(r.day_of_week)!.add(wk);
      if (!weeksByDp.has(r.daypart)) weeksByDp.set(r.daypart, new Set());
      weeksByDp.get(r.daypart)!.add(wk);
    }
  }
  const usual_days: number[] = [];
  for (const [d, set] of weeksByDay) {
    if (active_weeks > 0 && set.size / active_weeks >= 0.3) usual_days.push(d);
  }
  const usual_dayparts: string[] = [];
  for (const [dp, set] of weeksByDp) {
    if (active_weeks > 0 && set.size / active_weeks >= 0.3) usual_dayparts.push(dp);
  }
  const usual_outlets = Array.from(outletCounts.keys());

  // Classification — based on observed pattern, NOT contract.
  let pattern: WorkingPattern;
  let label: string;
  const contracted = opts.contractedShiftsPerWeek?.[serverId];
  const contractedH = opts.contractedHoursPerWeek?.[serverId];
  if (active_weeks < 2) {
    pattern = "unknown";
    label = "Observed pattern: insufficient history";
  } else {
    const variation = max_shifts_per_week - Math.max(1, p75_shifts_per_week);
    if (p75_shifts_per_week >= 5 || p75_hours_per_week >= 35) {
      pattern = "likely_full_time";
      label = `Observed pattern: likely full-time (${avg_shifts_per_week.toFixed(1)} shifts/wk)`;
    } else if (p75_shifts_per_week <= 3 || p75_hours_per_week < 28) {
      pattern = "likely_part_time";
      label = `Observed pattern: likely part-time (~${Math.round(avg_shifts_per_week)} shifts/wk)`;
    } else if (variation >= 2) {
      pattern = "variable";
      label = `Observed pattern: variable (${avg_shifts_per_week.toFixed(1)} shifts/wk avg)`;
    } else {
      pattern = "variable";
      label = `Observed pattern: ~${avg_shifts_per_week.toFixed(1)} shifts/wk`;
    }
  }
  if (contracted != null) label = `Contracted ${contracted} shifts/wk` + (contractedH ? ` (${contractedH}h)` : "");

  return {
    server_id: serverId,
    active_weeks,
    total_shifts,
    avg_shifts_per_week,
    p75_shifts_per_week,
    max_shifts_per_week,
    avg_hours_per_week,
    p75_hours_per_week,
    max_hours_per_week,
    usual_days,
    usual_dayparts,
    usual_outlets,
    pattern,
    pattern_label: label,
    has_contracted_hours: contracted != null || contractedH != null,
  };
}

// ---------- core engine ----------

export function computeSchedulingLeverage(
  rowsIn: LeverageShiftRow[],
  opts: LeverageEngineOptions = {},
): SchedulingLeverageResult {
  const shiftFloor = opts.reliabilityShiftFloor ?? 6;
  const hoursFloor = opts.reliabilityHoursFloor ?? 24;
  const checkFloor = opts.reliabilityCheckFloor ?? 80;
  const maxRecs = opts.maxRecommendations ?? 8;

  // ---- outlet inference / scope ----
  const anyOutletInRows = rowsIn.some((r) => !!r.outlet);
  let outlet_inferred_from_file: string | null = null;
  let rows: LeverageShiftRow[] = rowsIn;
  let matrix_scope: MatrixScope;
  if (anyOutletInRows) {
    matrix_scope = "outlet_scoped";
  } else if (opts.outletInferredFromFile && opts.outletInferredFromFile.trim()) {
    outlet_inferred_from_file = opts.outletInferredFromFile.trim();
    rows = rowsIn.map((r) => ({ ...r, outlet: outlet_inferred_from_file }));
    matrix_scope = "single_outlet_inferred";
  } else {
    matrix_scope = "daypart_only";
  }

  // ---- data quality ----
  const dq = {
    rows_total: rows.length,
    rows_with_covers: rows.filter((r) => isPos(r.covers)).length,
    rows_with_hours: rows.filter((r) => isPos(r.hours ?? null)).length,
    rows_with_labor: rows.filter((r) => isPos(r.labor_cost)).length,
    rows_with_checks: rows.filter((r) => isPos(r.checks ?? null)).length,
    matched_for_lls: rows.filter((r) => isPos(r.gross_sales) && isPos(r.labor_cost)).length,
    distinct_servers: new Set(rows.map((r) => r.server_id)).size,
    distinct_outlets: new Set(rows.map((r) => r.outlet).filter(Boolean)).size,
    distinct_shift_types: new Set(rows.map((r) => shiftTypeKey(r.outlet ?? null, r.day_of_week, r.daypart))).size,
    has_outlet: matrix_scope !== "daypart_only",
    has_category: rows.some((r) => r.category_sales && Object.keys(r.category_sales).length > 0),
    has_checks: rows.some((r) => isPos(r.checks ?? null)),
    cross_outlet_recommendations_enabled: !!opts.crossOutletEligibility && Object.values(opts.crossOutletEligibility).some(Boolean),
    notes: [] as string[],
  };
  if (matrix_scope === "single_outlet_inferred") {
    dq.notes.push(`Outlet inferred from file name (${outlet_inferred_from_file}). Matrix is scoped to that outlet only.`);
  } else if (matrix_scope === "daypart_only") {
    dq.notes.push("Outlet data unavailable. Matrix uses day of week and daypart only.");
  }
  if (!dq.has_category) dq.notes.push("Category sales unavailable. Category fit treated as neutral.");
  if (!dq.has_checks) dq.notes.push("Guest checks unavailable — reliability based on shifts + hours only.");
  if (dq.rows_with_hours < dq.rows_total * 0.25) dq.notes.push("Hours missing on most rows — RPH and labour-adjusted metrics reduced; confidence lowered.");
  if (dq.rows_with_covers < dq.rows_total * 0.25) dq.notes.push("Covers missing on most rows — RPC metrics reduced; confidence lowered.");

  // ---- group by shift type ----
  const byType = new Map<string, LeverageShiftRow[]>();
  for (const r of rows) {
    const k = shiftTypeKey(r.outlet ?? null, r.day_of_week, r.daypart);
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(r);
  }

  // venue-wide loaded $/h for fallback
  const venueLoadedRate = (() => {
    let cost = 0, hrs = 0;
    for (const r of rows) if (isPos(r.labor_cost) && isPos(r.hours ?? null)) { cost += r.labor_cost!; hrs += r.hours!; }
    return hrs > 0 ? cost / hrs : null;
  })();

  // per-outlet loaded $/h
  const outletLoadedRate = new Map<string | null, number | null>();
  for (const r of rows) {
    const o = r.outlet ?? null;
    if (!outletLoadedRate.has(o)) {
      let c = 0, h = 0;
      for (const rr of rows) if ((rr.outlet ?? null) === o && isPos(rr.labor_cost) && isPos(rr.hours ?? null)) { c += rr.labor_cost!; h += rr.hours!; }
      outletLoadedRate.set(o, h > 0 ? c / h : venueLoadedRate);
    }
  }

  // ---- baselines per shift type ----
  const baselines = new Map<string, ShiftTypeBaseline>();
  for (const [k, list] of byType) {
    const has_covers = list.some((r) => isPos(r.covers));
    const has_hours = list.some((r) => isPos(r.hours ?? null));
    const has_checks = list.some((r) => isPos(r.checks ?? null));
    const baseline_rpc = weightedRpc(list);
    const baseline_rph = weightedRph(list);
    const baseline_cph = weightedCph(list);
    const baseline_lls = adjustedLlsFromRows(list);
    const expected_covers = has_covers
      ? list.reduce((a, r) => a + (isPos(r.covers) ? r.covers! : 0), 0) / list.filter((r) => isPos(r.covers)).length
      : null;
    const expected_hours = has_hours
      ? list.reduce((a, r) => a + (isPos(r.hours ?? null) ? r.hours! : 0), 0) / list.filter((r) => isPos(r.hours ?? null)).length
      : null;
    const expected_checks = has_checks
      ? list.reduce((a, r) => a + (isPos(r.checks ?? null) ? r.checks! : 0), 0) / list.filter((r) => isPos(r.checks ?? null)).length
      : null;

    // current deployment = same as baseline at the venue level for these rows
    // (we don't yet know the *next-week* roster — we use historical mix).
    const current_deployment_rpc = baseline_rpc;
    const current_deployment_rph = baseline_rph;
    const current_deployment_adjusted_lls = baseline_lls;
    const current_baseline_sales =
      isPos(expected_covers) && isPos(current_deployment_rpc)
        ? expected_covers! * current_deployment_rpc!
        : isPos(expected_hours) && isPos(current_deployment_rph)
          ? expected_hours! * current_deployment_rph!
          : null;

    // category baselines (per cover)
    const category_baseline_rate: Record<string, number> = {};
    const category_target_rate: Record<string, number> = {};
    if (expected_covers && expected_covers > 0) {
      const catTotals: Record<string, number> = {};
      const catTargets: Record<string, number> = {};
      let covSum = 0;
      for (const r of list) {
        if (!r.category_sales || !isPos(r.covers)) continue;
        covSum += r.covers!;
        for (const [cat, val] of Object.entries(r.category_sales)) {
          if (val != null && Number.isFinite(val)) catTotals[cat] = (catTotals[cat] ?? 0) + (val as number);
        }
        if (r.category_target_rate) {
          for (const [cat, t] of Object.entries(r.category_target_rate)) {
            if (t != null && Number.isFinite(t)) catTargets[cat] = Math.max(catTargets[cat] ?? 0, t as number);
          }
        }
      }
      if (covSum > 0) {
        for (const [cat, total] of Object.entries(catTotals)) category_baseline_rate[cat] = total / covSum;
        for (const [cat, t] of Object.entries(catTargets)) category_target_rate[cat] = t;
      }
    }

    const sample = list[0];
    baselines.set(k, {
      key: k,
      outlet: sample.outlet ?? null,
      day_of_week: sample.day_of_week,
      daypart: sample.daypart,
      baseline_rpc, baseline_rph, baseline_cph, baseline_adjusted_lls: baseline_lls,
      expected_covers, expected_hours, expected_checks,
      shift_count: list.length,
      current_deployment_rpc, current_deployment_rph, current_deployment_adjusted_lls,
      current_baseline_sales,
      target_rpc: null, target_rph: null, target_adjusted_lls: null,
      rpc_headroom: 0, rph_headroom: 0, lls_headroom: 0, opportunity_need: 0,
      opportunity_factor_typical: ofOrOne(sample.opportunity_factor),
      category_baseline_rate,
      category_target_rate,
      has_covers, has_hours, has_checks,
    });
  }

  // top-quartile targets — computed within the same outlet only
  const byOutletKeys = new Map<string | null, ShiftTypeBaseline[]>();
  for (const b of baselines.values()) {
    if (!byOutletKeys.has(b.outlet)) byOutletKeys.set(b.outlet, []);
    byOutletKeys.get(b.outlet)!.push(b);
  }
  for (const [, list] of byOutletKeys) {
    const tqRpc = topQuartile(list.map((b) => b.baseline_rpc).filter(isPos) as number[]);
    const tqRph = topQuartile(list.map((b) => b.baseline_rph).filter(isPos) as number[]);
    const tqLls = topQuartile(list.map((b) => b.baseline_adjusted_lls).filter(isPos) as number[]);
    for (const b of list) {
      b.target_rpc = tqRpc ?? (isPos(b.baseline_rpc) ? b.baseline_rpc! * 1.2 : null);
      b.target_rph = tqRph ?? (isPos(b.baseline_rph) ? b.baseline_rph! * 1.2 : null);
      b.target_adjusted_lls = tqLls ?? (isPos(b.baseline_adjusted_lls) ? b.baseline_adjusted_lls! * 1.2 : null);
      b.rpc_headroom = isPos(b.target_rpc) && isPos(b.current_deployment_rpc)
        ? Math.max(0, b.target_rpc! - b.current_deployment_rpc!) / b.target_rpc!
        : 0;
      b.rph_headroom = isPos(b.target_rph) && isPos(b.current_deployment_rph)
        ? Math.max(0, b.target_rph! - b.current_deployment_rph!) / b.target_rph!
        : 0;
      b.lls_headroom = isPos(b.target_adjusted_lls) && isPos(b.current_deployment_adjusted_lls)
        ? Math.max(0, b.target_adjusted_lls! - b.current_deployment_adjusted_lls!) / b.target_adjusted_lls!
        : 0;
      b.opportunity_need = 0.4 * b.rpc_headroom + 0.35 * b.rph_headroom + 0.25 * b.lls_headroom;
    }
  }

  // ---- per-server profile ----
  const serverIds = Array.from(new Set(rows.map((r) => r.server_id)));
  const serverNames = new Map(rows.map((r) => [r.server_id, r.server_name]));
  const serverTotalShifts = new Map<string, number>(serverIds.map((id) => [id, rows.filter((r) => r.server_id === id).length]));

  // per (server, outlet) skill profile
  const serverOutletProfile = new Map<string, { rpc: number | null; rph: number | null; cph: number | null; lls: number | null }>();
  for (const id of serverIds) {
    const outletsHere = new Set<string | null>();
    for (const r of rows) if (r.server_id === id) outletsHere.add(r.outlet ?? null);
    for (const o of outletsHere) {
      const my = rows.filter((r) => r.server_id === id && (r.outlet ?? null) === o);
      serverOutletProfile.set(`${id}|${o ?? ""}`, {
        rpc: weightedRpc(my),
        rph: weightedRph(my),
        cph: weightedCph(my),
        lls: adjustedLlsFromRows(my),
      });
    }
  }

  // working pattern for each server
  const patterns = new Map<string, ServerWorkingPattern>();
  for (const id of serverIds) patterns.set(id, computeWorkingPattern(id, rows, opts));

  // ---- matrix construction ----
  const matrix: ServerShiftCell[] = [];
  const crossOutletAny = (id: string) => !!opts.crossOutletEligibility?.[id];

  for (const id of serverIds) {
    const myRows = rows.filter((r) => r.server_id === id);
    const totalServerShifts = serverTotalShifts.get(id) ?? 0;
    const pat = patterns.get(id)!;

    for (const [k, baseline] of baselines) {
      const inType = myRows.filter((r) => shiftTypeKey(r.outlet ?? null, r.day_of_week, r.daypart) === k);
      const comparable_shifts = inType.length;
      const comparable_hours = inType.reduce((a, r) => a + (isPos(r.hours ?? null) ? r.hours! : 0), 0);
      const comparable_checks = inType.reduce((a, r) => a + (isPos(r.checks ?? null) ? r.checks! : 0), 0);

      // reliability
      const sRel = Math.min(1, comparable_shifts / shiftFloor);
      const hRel = baseline.has_hours ? Math.min(1, comparable_hours / hoursFloor) : sRel;
      const cRel = baseline.has_checks ? Math.min(1, comparable_checks / checkFloor) : 0;
      const reliability = baseline.has_checks
        ? 0.5 * sRel + 0.3 * hRel + 0.2 * cRel
        : 0.6 * sRel + 0.4 * hRel;

      // server raw shift-type metrics
      const server_rpc = weightedRpc(inType);
      const server_rph = weightedRph(inType);
      const server_cph = weightedCph(inType);
      const server_adj_lls = adjustedLlsFromRows(inType);

      // outlet-level profile fallback
      const op = serverOutletProfile.get(`${id}|${baseline.outlet ?? ""}`) ?? { rpc: null, rph: null, cph: null, lls: null };

      // shrink: reliability × shift-type metric + (1-reliability) × (0.6×outlet profile + 0.4×outlet shift baseline)
      const shrink = (shiftVal: number | null, outletVal: number | null, baseVal: number | null): number | null => {
        const blendBase = isPos(outletVal) && isPos(baseVal)
          ? 0.6 * outletVal! + 0.4 * baseVal!
          : isPos(outletVal) ? outletVal : baseVal;
        if (!isPos(blendBase) && !isPos(shiftVal)) return null;
        if (!isPos(shiftVal)) return blendBase ?? null;
        if (!isPos(blendBase)) return shiftVal;
        return reliability * shiftVal! + (1 - reliability) * blendBase!;
      };
      const projected_rpc = shrink(server_rpc, op.rpc, baseline.baseline_rpc);
      const projected_rph = shrink(server_rph, op.rph, baseline.baseline_rph);
      const projected_cph = shrink(server_cph, op.cph, baseline.baseline_cph);
      const projected_adjusted_lls = shrink(server_adj_lls, op.lls, baseline.baseline_adjusted_lls);

      // indexes (vs current deployment for RPC/RPH, vs baseline for throughput/LLS)
      const idx = (p: number | null, b: number | null) => (isPos(p) && isPos(b) ? p! / b! : 1);
      const rpc_index = idx(projected_rpc, baseline.current_deployment_rpc);
      const rph_index = idx(projected_rph, baseline.current_deployment_rph);
      const throughput_index = idx(projected_cph, baseline.baseline_cph);
      const adjusted_lls_index = idx(projected_adjusted_lls, baseline.baseline_adjusted_lls);

      // category fit
      let category_fit = 1.0;
      let category_fit_status: "neutral_no_data" | "computed" = "neutral_no_data";
      const catKeys = Object.keys(baseline.category_baseline_rate);
      if (catKeys.length && expectedCoversPositive(baseline.expected_covers)) {
        // server category rate by outlet
        const serverOutletRows = rows.filter((r) => r.server_id === id && (r.outlet ?? null) === baseline.outlet);
        let serverCovers = 0;
        for (const r of serverOutletRows) if (isPos(r.covers)) serverCovers += r.covers!;
        if (serverCovers > 0) {
          let sumW = 0, sumWS = 0;
          for (const cat of catKeys) {
            const baseRate = baseline.category_baseline_rate[cat] ?? 0;
            const targetRate = baseline.category_target_rate[cat] ?? baseRate * 1.15;
            const opportunity = targetRate > 0 ? Math.max(0, targetRate - baseRate) / targetRate : 0;
            if (opportunity <= 0) continue;
            let serverCatSales = 0;
            for (const r of serverOutletRows) {
              const v = r.category_sales?.[cat];
              if (v != null && Number.isFinite(v)) serverCatSales += v as number;
            }
            const serverRate = serverCatSales / serverCovers;
            const strength = baseRate > 0 ? serverRate / baseRate : 1;
            sumW += opportunity;
            sumWS += opportunity * strength;
          }
          if (sumW > 0) {
            category_fit = sumWS / sumW;
            category_fit_status = "computed";
          }
        }
      }

      // consistency
      let above = 0; const gaps: number[] = [];
      for (const r of inType) {
        const a = adjustedLlsFromRows([r]);
        if (isPos(a) && isPos(baseline.baseline_adjusted_lls)) {
          const g = a! / baseline.baseline_adjusted_lls! - 1;
          gaps.push(g);
          if (g > 0) above++;
        }
      }
      const aboveRate = gaps.length ? above / gaps.length : 0;
      const volatility = Math.min(1, stddev(gaps) / 0.25);
      let consistency_score = 0.7 * aboveRate + 0.3 * (1 - volatility);
      if (reliability < 1) consistency_score = Math.min(consistency_score, reliability);

      // current allocation share
      const current_allocation_share = totalServerShifts > 0 ? comparable_shifts / totalServerShifts : 0;
      const underused = 1 - current_allocation_share;

      // confidence
      const dataCompleteness =
        ((baseline.has_covers ? 1 : 0) + (baseline.has_hours ? 1 : 0) + (baseline.has_checks ? 1 : 0) + (isPos(server_adj_lls) ? 1 : 0)) / 4;
      const matchConfidence = (() => {
        const vals = inType.map((r) => r.match_confidence).filter((v): v is number => v != null && Number.isFinite(v));
        if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
        return inType.length ? 0.75 : 0.5;
      })();
      const volatilityConfidence = 1 - volatility;
      const recencyConfidence = (() => {
        if (!inType.length) return 0.4;
        const latest = inType.map((r) => new Date(r.shift_date + "T00:00:00").getTime()).filter((n) => !Number.isNaN(n));
        if (!latest.length) return 0.5;
        const ageDays = (Date.now() - Math.max(...latest)) / 86400000;
        if (ageDays < 21) return 1;
        if (ageDays < 56) return 0.8;
        if (ageDays < 84) return 0.6;
        return 0.4;
      })();
      const rawConfidence =
        0.30 * reliability +
        0.25 * dataCompleteness +
        0.20 * matchConfidence +
        0.15 * volatilityConfidence +
        0.10 * recencyConfidence;
      // sample-size cap
      let cap = 1;
      if (comparable_shifts < 2) cap = 0.45;
      else if (comparable_shifts < 4) cap = 0.65;
      else if (comparable_shifts < 6 || comparable_hours < 24) cap = 0.85;
      const confidence = Math.min(rawConfidence, cap);
      const confidence_band = bandConfidence(confidence);

      // modelled sales
      const expCov = baseline.expected_covers, expHr = baseline.expected_hours;
      const projFromCov = isPos(expCov) && isPos(projected_rpc) ? expCov! * projected_rpc! : null;
      const projFromHr = isPos(expHr) && isPos(projected_rph) ? expHr! * projected_rph! : null;
      const projected_sales = projFromCov != null && baseline.has_covers
        ? 0.65 * projFromCov + 0.35 * (projFromHr ?? projFromCov)
        : projFromHr;
      const current_baseline_sales = baseline.current_baseline_sales;
      const modelled_marginal_lift =
        isNum(projected_sales) && isNum(current_baseline_sales)
          ? (projected_sales as number) - (current_baseline_sales as number)
          : null;

      // labour-adjusted projection
      const serverLoadedRate = (() => {
        let cost = 0, hrs = 0;
        for (const r of myRows) if (isPos(r.labor_cost) && isPos(r.hours ?? null)) { cost += r.labor_cost!; hrs += r.hours!; }
        return hrs > 0 ? cost / hrs : (outletLoadedRate.get(baseline.outlet) ?? venueLoadedRate);
      })();
      const projected_labour_cost = isPos(expHr) && isPos(serverLoadedRate) ? expHr! * serverLoadedRate! : null;
      const of = baseline.opportunity_factor_typical;
      const projected_adjusted_lls_for_shift =
        isPos(projected_sales) && isPos(projected_labour_cost)
          ? (projected_sales as number) / ((projected_labour_cost as number) * of)
          : null;
      const marginal_leverage_gain =
        isPos(projected_adjusted_lls_for_shift) && isPos(baseline.baseline_adjusted_lls)
          ? projected_adjusted_lls_for_shift! / baseline.baseline_adjusted_lls! - 1
          : null;

      // feasibility ----------
      const hasOutletHistory = baseline.outlet
        ? pat.usual_outlets.includes(baseline.outlet) || rows.some((r) => r.server_id === id && r.outlet === baseline.outlet)
        : true;
      let outlet_eligibility = 1;
      let outlet_eligibility_reason = "Outlet history confirmed";
      if (baseline.outlet) {
        if (hasOutletHistory) { outlet_eligibility = 1; outlet_eligibility_reason = "Outlet history confirmed"; }
        else if (crossOutletAny(id)) { outlet_eligibility = 0.7; outlet_eligibility_reason = "Cross-outlet eligible (no history yet)"; }
        else { outlet_eligibility = 0; outlet_eligibility_reason = `No history in ${baseline.outlet} and not marked cross-outlet eligible`; }
      }

      const dayCount = myRows.filter((r) => r.day_of_week === baseline.day_of_week).length;
      const dayShare = pat.active_weeks > 0 ? dayCount / pat.active_weeks : 0;
      const day_pattern_fit = pat.active_weeks === 0
        ? 0.5
        : dayShare >= 0.3 ? 1 : dayShare >= 0.15 ? 0.7 : dayShare >= 0.05 ? 0.4 : (dayCount > 0 ? 0.3 : 0);

      const dpCount = myRows.filter((r) => r.daypart === baseline.daypart).length;
      const dpShare = pat.active_weeks > 0 ? dpCount / pat.active_weeks : 0;
      const daypart_pattern_fit = pat.active_weeks === 0
        ? 0.5
        : dpShare >= 0.3 ? 1 : dpShare >= 0.15 ? 0.7 : dpShare >= 0.05 ? 0.4 : (dpCount > 0 ? 0.3 : 0);

      // Adding one test shift should stay within observed weekly pattern.
      const proposedShiftsPerWeek = (pat.avg_shifts_per_week || 0) + 1;
      const contractedCap = opts.contractedShiftsPerWeek?.[id];
      const weeklyCap = contractedCap ?? pat.p75_shifts_per_week;
      const maxCap = contractedCap ?? pat.max_shifts_per_week;
      let weekly_capacity_fit: number;
      if (pat.active_weeks === 0) weekly_capacity_fit = 0.5;
      else if (proposedShiftsPerWeek <= Math.max(1, weeklyCap)) weekly_capacity_fit = 1;
      else if (proposedShiftsPerWeek <= Math.max(1, maxCap)) weekly_capacity_fit = 0.7;
      else weekly_capacity_fit = 0.25;

      const proposedHoursPerWeek = (pat.avg_hours_per_week || 0) + (expHr ?? 8);
      const hoursCap = opts.contractedHoursPerWeek?.[id] ?? pat.p75_hours_per_week;
      const hoursMaxCap = opts.contractedHoursPerWeek?.[id] ?? pat.max_hours_per_week;
      let hours_capacity_fit: number;
      if (pat.active_weeks === 0 || hoursCap <= 0) hours_capacity_fit = 0.5;
      else if (proposedHoursPerWeek <= hoursCap) hours_capacity_fit = 1;
      else if (proposedHoursPerWeek <= Math.max(hoursCap, hoursMaxCap)) hours_capacity_fit = 0.7;
      else hours_capacity_fit = 0.25;

      const rest_burnout_fit = 0.9; // proxy — actual rest data unavailable

      const schedule_feasibility =
        0.25 * outlet_eligibility +
        0.20 * day_pattern_fit +
        0.20 * daypart_pattern_fit +
        0.20 * weekly_capacity_fit +
        0.10 * hours_capacity_fit +
        0.05 * rest_burnout_fit;

      // ---- marginal deployment value ----
      const norm = (i: number) => clamp(i / 1.2, 0, 1);
      // lift component will be normalised against the positive-lift p75 across all eligible cells later
      const lift_raw = modelled_marginal_lift ?? 0;

      // marginal deployment value (final scaling applied after we know p75 lift)
      // store raw components and finalise in pass 2.
      const cell: ServerShiftCell = {
        server_id: id,
        server_name: serverNames.get(id) ?? id,
        shift_type: k,
        baseline,
        server_rpc, server_rph, server_cph, server_adjusted_lls: server_adj_lls,
        projected_rpc, projected_rph, projected_cph, projected_adjusted_lls,
        rpc_index, rph_index, throughput_index, adjusted_lls_index,
        category_fit, category_fit_status,
        consistency_score,
        reliability, comparable_shifts, comparable_hours, comparable_checks,
        current_allocation_share,
        projected_sales, current_baseline_sales, modelled_marginal_lift,
        projected_labour_cost, projected_adjusted_lls_for_shift, marginal_leverage_gain,
        outlet_eligibility, outlet_eligibility_reason,
        day_pattern_fit, daypart_pattern_fit, weekly_capacity_fit, hours_capacity_fit, rest_burnout_fit,
        schedule_feasibility,
        marginal_deployment_value: 0,
        development_priority: 0,
        confidence,
        confidence_band,
        rota_test_priority: 0,
        positive_lift_gate: lift_raw > 0 ? 1 : 0,
        cell_label: "insufficient_data",
        reasons: [],
        warnings: [],
      };
      void underused;
      matrix.push(cell);
    }
  }

  // ---- finalise MDV / RotaPriority using cross-cell percentiles ----
  const positiveLifts = matrix.map((c) => c.modelled_marginal_lift).filter((v): v is number => v != null && v > 0);
  const p75Lift = percentile(positiveLifts, 0.75) ?? 1;

  for (const cell of matrix) {
    const b = cell.baseline;
    const norm = (i: number) => clamp(i / 1.2, 0, 1);
    const lift = cell.modelled_marginal_lift ?? 0;
    const liftComponent = lift > 0 ? clamp(lift / Math.max(p75Lift, 1), 0, 1) : 0;
    const mdv = 100 * (
      0.20 * norm(cell.adjusted_lls_index) +
      0.18 * liftComponent +
      0.15 * norm(cell.rph_index) +
      0.15 * norm(cell.rpc_index) +
      0.10 * clamp(b.opportunity_need, 0, 1) +
      0.08 * norm(cell.throughput_index) +
      0.07 * norm(cell.category_fit) +
      0.07 * clamp(cell.consistency_score, 0, 1)
    );
    cell.marginal_deployment_value = mdv;

    const underused = 1 - cell.current_allocation_share;
    cell.rota_test_priority = mdv
      * clamp(cell.confidence, 0, 1)
      * clamp(cell.schedule_feasibility, 0, 1)
      * (0.7 + 0.3 * clamp(underused, 0, 1))
      * cell.positive_lift_gate;

    // dev priority: low LLS performance, lower-pressure shift
    const lowerPressureFit = 1 - clamp((b.opportunity_factor_typical - 0.8) / 0.6, 0, 1);
    cell.development_priority = (1 - clamp(cell.adjusted_lls_index / 1.2, 0, 1))
      * clamp(cell.confidence, 0, 1)
      * lowerPressureFit
      * 100;

    // reasons + warnings
    if (cell.rpc_index >= 1.10) cell.reasons.push(`RPC ${((cell.rpc_index - 1) * 100).toFixed(0)}% above current deployment`);
    if (cell.rph_index >= 1.10) cell.reasons.push(`RPH ${((cell.rph_index - 1) * 100).toFixed(0)}% above current deployment`);
    if (cell.adjusted_lls_index >= 1.10) cell.reasons.push(`Adj. LLS strong vs benchmark`);
    if (b.opportunity_need >= 0.15) cell.reasons.push(`Shift has commercial headroom (${(b.opportunity_need * 100).toFixed(0)}%)`);
    if (cell.current_allocation_share < 0.05 && cell.marginal_deployment_value >= 60) cell.reasons.push("Currently underused on this shift type");
    if (lift > 0) cell.reasons.push(`Modelled lift +$${lift.toFixed(0)} vs current rota baseline`);

    if (cell.reliability < 0.5) cell.warnings.push("Low sample — projection shrunk to outlet baseline");
    if (!b.has_hours) cell.warnings.push("Hours not provided — RPH metrics estimated");
    if (!b.has_covers) cell.warnings.push("Covers not provided — RPC metrics estimated");
    if (cell.outlet_eligibility === 0) cell.warnings.push(`Not eligible: no history in ${b.outlet}`);
    if (cell.outlet_eligibility > 0 && cell.outlet_eligibility < 1) cell.warnings.push("Outlet eligibility from cross-outlet flag only (no history)");
    if (cell.weekly_capacity_fit < 1) cell.warnings.push("Exceeds observed weekly shift pattern — confirm availability");
  }

  // ---- per-column ranking for cell labels ----
  const byCol = new Map<string, ServerShiftCell[]>();
  for (const c of matrix) {
    if (!byCol.has(c.shift_type)) byCol.set(c.shift_type, []);
    byCol.get(c.shift_type)!.push(c);
  }
  const colRank = new Map<string, Map<string, number>>(); // shift_type -> server_id -> rank percentile (1=best)
  for (const [k, list] of byCol) {
    const sorted = [...list].sort((a, b) => b.rota_test_priority - a.rota_test_priority);
    const m = new Map<string, number>();
    sorted.forEach((c, i) => m.set(c.server_id, 1 - i / Math.max(1, sorted.length - 1)));
    colRank.set(k, m);
  }
  // per-server top shift types
  const byServerTop = new Map<string, Set<string>>();
  for (const id of serverIds) {
    const mine = matrix.filter((c) => c.server_id === id && c.positive_lift_gate === 1 && c.confidence >= 0.4)
      .sort((a, b) => b.rota_test_priority - a.rota_test_priority);
    byServerTop.set(id, new Set(mine.slice(0, 3).map((c) => c.shift_type)));
  }

  // cell labels
  for (const cell of matrix) {
    const rankPct = colRank.get(cell.shift_type)?.get(cell.server_id) ?? 0;
    const top3ForServer = byServerTop.get(cell.server_id)?.has(cell.shift_type) ?? false;
    const lift = cell.modelled_marginal_lift ?? 0;

    if (cell.outlet_eligibility === 0) { cell.cell_label = "not_eligible"; continue; }
    if (cell.confidence < 0.4) { cell.cell_label = "insufficient_data"; continue; }
    if (lift < 0) { cell.cell_label = "avoid_for_now"; continue; }
    if (cell.schedule_feasibility < 0.4) { cell.cell_label = "requires_availability"; continue; }

    const bestEligible =
      lift > 0 &&
      cell.confidence >= 0.6 &&
      cell.schedule_feasibility >= 0.6 &&
      cell.marginal_deployment_value >= 70 &&
      rankPct >= 0.85 &&
      top3ForServer;
    const goodEligible =
      lift > 0 &&
      cell.confidence >= 0.5 &&
      cell.schedule_feasibility >= 0.5 &&
      cell.marginal_deployment_value >= 55 &&
      rankPct >= 0.6;

    if (bestEligible) cell.cell_label = "best_fit";
    else if (goodEligible) cell.cell_label = "good_fit";
    else if (cell.schedule_feasibility < 0.6) cell.cell_label = "requires_availability";
    else if (lift > 0 && cell.confidence >= 0.4) cell.cell_label = "test_monitor";
    else cell.cell_label = "test_monitor";
  }

  // Hard contrast rule: per column, cap best+good at 25% of cells.
  for (const [, list] of byCol) {
    const promoted = list.filter((c) => c.cell_label === "best_fit" || c.cell_label === "good_fit")
      .sort((a, b) => b.rota_test_priority - a.rota_test_priority);
    const cap = Math.max(1, Math.floor(list.length * 0.25));
    for (let i = cap; i < promoted.length; i++) promoted[i].cell_label = "test_monitor";
  }

  // ---- recommendations ----
  const recs: ServerRecommendation[] = [];
  const currentPatternFor = (id: string): string => {
    const counts = new Map<string, number>();
    for (const r of rows.filter((r) => r.server_id === id)) {
      const k = shiftTypeKey(r.outlet ?? null, r.day_of_week, r.daypart);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (!top.length) return "No shifts on record";
    return top.map(([k, n]) => `${humanShiftLabel(baselines.get(k)!)} ×${n}`).join(", ");
  };
  const suggestedTestFor = (cell: ServerShiftCell): string => {
    const pat = patterns.get(cell.server_id)!;
    const label = humanShiftLabel(cell.baseline);
    if (cell.weekly_capacity_fit < 1 && pat.pattern === "likely_part_time") {
      return `${cell.server_name} usually works ~${pat.avg_shifts_per_week.toFixed(1)} shifts/wk. Swap one current shift into ${label} for 2 weeks rather than adding an extra day.`;
    }
    if (cell.weekly_capacity_fit < 0.7) {
      return `Requires manager confirmation — exceeds observed rota pattern. If available, test 1 ${label} shift over 2 weeks.`;
    }
    if (pat.pattern === "likely_part_time") {
      return `Within current ${pat.avg_shifts_per_week.toFixed(0)}-shift pattern: swap one shift into ${label} and compare vs current rota baseline.`;
    }
    return `Schedule 1–2 ${label} shifts over the next 2 weeks; compare RPC and Adj. LLS against current rota baseline.`;
  };
  const requires_confirmation = (cell: ServerShiftCell) =>
    cell.schedule_feasibility < 0.6 || cell.weekly_capacity_fit < 1 || cell.outlet_eligibility < 1;
  const toRec = (type: RecommendationType, cell: ServerShiftCell, why: string): ServerRecommendation => ({
    server_id: cell.server_id,
    server_name: cell.server_name,
    recommendation_type: type,
    best_fit_shift: humanShiftLabel(cell.baseline),
    current_pattern: currentPatternFor(cell.server_id),
    why,
    suggested_rota_test: suggestedTestFor(cell),
    modelled_opportunity: cell.modelled_marginal_lift,
    confidence: cell.confidence_band,
    marginal_deployment_value: cell.marginal_deployment_value,
    rota_test_priority: cell.rota_test_priority,
    schedule_feasibility: cell.schedule_feasibility,
    requires_confirmation: requires_confirmation(cell),
  });

  // gates for revenue-style recommendations
  const revenueEligible = (c: ServerShiftCell) =>
    c.positive_lift_gate === 1 &&
    c.confidence >= 0.5 &&
    c.schedule_feasibility >= 0.5 &&
    c.outlet_eligibility > 0;

  // Best overall leverage
  const bestOverallCell = matrix.filter(revenueEligible).sort((a, b) => b.rota_test_priority - a.rota_test_priority)[0];
  if (bestOverallCell)
    recs.push(toRec("best_overall_leverage", bestOverallCell,
      `Best overall labour-leverage opportunity — MDV ${bestOverallCell.marginal_deployment_value.toFixed(0)}, modelled lift +$${(bestOverallCell.modelled_marginal_lift ?? 0).toFixed(0)} vs current rota.`));

  // Slow shift lifter
  const slowOpps = matrix.filter((c) =>
    revenueEligible(c) &&
    (c.baseline.opportunity_factor_typical < 1.0 ||
      (c.baseline.expected_covers != null && c.baseline.expected_covers <= (median(Array.from(baselines.values()).map((b) => b.expected_covers ?? 0)) ?? 0))) &&
    c.baseline.opportunity_need >= 0.15 &&
    (c.rpc_index >= 1.10 || c.rph_index >= 1.10),
  ).sort((a, b) => b.rota_test_priority - a.rota_test_priority);
  if (slowOpps[0]) recs.push(toRec("slow_shift_lifter", slowOpps[0],
    `${slowOpps[0].server_name} creates the biggest improvement on a lower-opportunity shift — projected lift on ${humanShiftLabel(slowOpps[0].baseline)} where current rota underperforms its potential.`));

  // Peak performer
  const peakOpps = matrix.filter((c) =>
    revenueEligible(c) &&
    (c.baseline.opportunity_factor_typical > 1.1 ||
      (c.baseline.expected_covers != null && c.baseline.expected_covers >= (topQuartile(Array.from(baselines.values()).map((b) => b.expected_covers ?? 0)) ?? Infinity))) &&
    c.throughput_index > 1.05 &&
    c.adjusted_lls_index >= 1.0 &&
    c.consistency_score >= 0.5,
  ).sort((a, b) => b.marginal_deployment_value - a.marginal_deployment_value);
  if (peakOpps[0]) recs.push(toRec("peak_performer", peakOpps[0],
    `Holds throughput and Adj. LLS under pressure — throughput ${((peakOpps[0].throughput_index - 1) * 100).toFixed(0)}% above baseline on ${humanShiftLabel(peakOpps[0].baseline)}.`));

  // RPC builder
  const rpcOpps = matrix.filter((c) => revenueEligible(c) && c.rpc_index >= 1.10).sort((a, b) => b.rpc_index - a.rpc_index);
  if (rpcOpps[0]) recs.push(toRec("high_rpc_specialist", rpcOpps[0],
    `Strong spend-per-guest builder — projected RPC ${((rpcOpps[0].rpc_index - 1) * 100).toFixed(0)}% above current deployment on ${humanShiftLabel(rpcOpps[0].baseline)}.`));

  // Throughput specialist
  const tpOpps = matrix.filter((c) => revenueEligible(c) && c.throughput_index >= 1.10 && c.rph_index >= 1.05).sort((a, b) => b.throughput_index - a.throughput_index);
  if (tpOpps[0]) recs.push(toRec("throughput_specialist", tpOpps[0],
    `Handles volume efficiently — projected covers-per-hour ${((tpOpps[0].throughput_index - 1) * 100).toFixed(0)}% above baseline.`));

  // Underused capability
  const underOpps = matrix.filter((c) =>
    revenueEligible(c) && c.marginal_deployment_value >= 65 && c.current_allocation_share < 0.1,
  ).sort((a, b) => b.rota_test_priority - a.rota_test_priority);
  if (underOpps[0]) recs.push(toRec("underused_capability", underOpps[0],
    `Strong projected fit on ${humanShiftLabel(underOpps[0].baseline)} (MDV ${underOpps[0].marginal_deployment_value.toFixed(0)}) but currently scheduled there only ${(underOpps[0].current_allocation_share * 100).toFixed(0)}% of the time.`));

  // Development / coaching
  const coachCells = matrix.filter((c) =>
    c.confidence >= 0.5 &&
    c.outlet_eligibility > 0 &&
    c.adjusted_lls_index < 0.9 &&
    c.current_allocation_share >= 0.15,
  ).sort((a, b) => a.adjusted_lls_index - b.adjusted_lls_index);
  if (coachCells[0]) recs.push(toRec("development_shift", coachCells[0],
    `Coaching opportunity — currently scheduled on ${humanShiftLabel(coachCells[0].baseline)} but Adj. LLS index ${coachCells[0].adjusted_lls_index.toFixed(2)} vs benchmark. Lower-downside coaching shift; not a revenue recommendation.`));

  // Protect from mismatch
  for (const id of serverIds) {
    const mine = matrix.filter((c) => c.server_id === id);
    const strongElsewhere = mine.some((c) => revenueEligible(c) && c.marginal_deployment_value >= 65);
    const mismatch = mine.find((c) =>
      strongElsewhere && (c.modelled_marginal_lift ?? 0) < 0 && c.current_allocation_share >= 0.25,
    );
    if (mismatch) {
      recs.push(toRec("protect_from_mismatch", mismatch,
        `${mismatch.server_name} performs well elsewhere but is heavily scheduled on ${humanShiftLabel(mismatch.baseline)} where modelled lift is negative. The mismatch may be the deployment, not the server.`));
      break; // one is enough
    }
  }

  // De-dup per server (keep highest rota_test_priority)
  const dedup: ServerRecommendation[] = [];
  const seen = new Set<string>();
  const sortedRecs = recs.sort((a, b) => b.rota_test_priority - a.rota_test_priority);
  for (const r of sortedRecs) {
    const k = `${r.server_id}|${r.recommendation_type}|${r.best_fit_shift}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
    if (dedup.length >= maxRecs) break;
  }

  // ---- highlights (one per slot, allow same server) ----
  const pickHighlight = (type: RecommendationType) =>
    recs.find((r) => r.recommendation_type === type) ?? null;
  const highlights = {
    best_overall_leverage: pickHighlight("best_overall_leverage"),
    best_slow_shift_lifter: pickHighlight("slow_shift_lifter"),
    best_peak_performer: pickHighlight("peak_performer"),
    best_rpc_builder: pickHighlight("high_rpc_specialist"),
    best_throughput: pickHighlight("throughput_specialist"),
    most_underused: pickHighlight("underused_capability"),
    biggest_coaching_opportunity: pickHighlight("development_shift"),
  };

  return {
    matrix_scope,
    outlet_inferred_from_file,
    shift_types: Array.from(baselines.values()).sort((a, b) => {
      const oa = a.outlet ?? "", ob = b.outlet ?? "";
      if (oa !== ob) return oa.localeCompare(ob);
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return a.daypart.localeCompare(b.daypart);
    }),
    servers: serverIds.map((id) => ({ id, name: serverNames.get(id) ?? id, pattern: patterns.get(id)! })),
    matrix,
    highlights,
    recommendations: dedup,
    data_quality: dq,
  };
}

function expectedCoversPositive(v: number | null): boolean {
  return v != null && Number.isFinite(v) && v > 0;
}

export const __test_only = { shiftTypeKey, humanShiftLabel, topQuartile, percentile, isoWeekKey };
