// Scheduling Leverage Matrix — manager-only intelligence engine.
//
// Purpose: decide where each server creates the most MARGINAL commercial
// value (not where they post the highest absolute SPH). Uses the canonical
// LLS / RPC / RPH math from src/lib/metrics — does NOT re-define formulas.
//
// Inputs come from /manager/lls historic shift rows. Hours, outlet, and
// category data are OPTIONAL: when absent, the engine degrades gracefully
// (lowers confidence, drops affected sub-scores to neutral) rather than
// hiding the matrix.
//
// Output is consumed only by the manager UI under /manager/lls — never by
// any /server/* route.

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
  labor_cost: number | null;
  opportunity_factor: number | null;
  category_sales?: Record<string, number | null> | null; // optional category breakdown
  category_target_rate?: Record<string, number | null> | null;
}

export interface LeverageEngineOptions {
  /** Top quartile target uplift floor (default 1.20 = 20% above venue). */
  targetMultiplier?: number;
  /** Minimum comparable shifts before full reliability (default 6). */
  reliabilityShiftFloor?: number;
  /** Minimum comparable hours before full reliability (default 24). */
  reliabilityHoursFloor?: number;
}

// ---------- output ----------

export type RecommendationType =
  | "peak_performer"
  | "slow_shift_lifter"
  | "high_rpc_specialist"
  | "throughput_specialist"
  | "category_specialist"
  | "development_shift"
  | "protect_from_mismatch"
  | "best_overall_leverage"
  | "underused_capability";

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient";

export type CellLabel =
  | "best_fit"
  | "good_fit"
  | "test_monitor"
  | "avoid_for_now"
  | "insufficient_data";

export interface ShiftTypeBaseline {
  key: string;
  outlet: string | null;
  day_of_week: number;
  daypart: string;
  venue_rpc: number | null;
  venue_rph: number | null;
  venue_cph: number | null;
  venue_adjusted_lls: number | null;
  benchmark_adjusted_lls: number | null;
  expected_covers: number | null;
  expected_hours: number | null;
  shift_count: number;
  target_rph: number | null;
  target_rpc: number | null;
  rph_headroom: number;
  rpc_headroom: number;
  opportunity_need: number;
  opportunity_factor_typical: number;
  has_covers: boolean;
  has_hours: boolean;
}

export interface ServerShiftCell {
  server_id: string;
  server_name: string;
  shift_type: string;
  baseline: ShiftTypeBaseline;
  // raw
  server_rpc: number | null;
  server_rph: number | null;
  server_cph: number | null;
  server_adjusted_lls: number | null;
  // projected (shrunk toward venue baseline by reliability)
  projected_rpc: number | null;
  projected_rph: number | null;
  projected_cph: number | null;
  projected_adjusted_lls: number | null;
  // indexes (>1 = above baseline)
  adjusted_lls_index: number;
  rph_index: number;
  rpc_index: number;
  throughput_index: number;
  category_fit: number;
  consistency_score: number;
  // sample
  reliability: number;
  comparable_shifts: number;
  comparable_hours: number;
  current_allocation_share: number;
  // scoring
  fit_score: number;
  rota_test_priority: number;
  confidence: number;
  confidence_band: ConfidenceBand;
  cell_label: CellLabel;
  // modelled
  baseline_sales: number | null;
  projected_sales: number | null;
  modelled_revenue_lift: number | null;
  projected_adjusted_lls_for_shift: number | null;
  marginal_leverage_gain: number | null;
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
  fit_score: number;
  rota_test_priority: number;
}

export interface SchedulingLeverageResult {
  shift_types: ShiftTypeBaseline[];
  servers: { id: string; name: string }[];
  matrix: ServerShiftCell[]; // server × shift_type
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
    matched_for_lls: number;
    distinct_servers: number;
    distinct_shift_types: number;
    has_outlet: boolean;
    has_category: boolean;
    notes: string[];
  };
}

// ---------- helpers ----------

const isPos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ofOrOne = (v: unknown) => (isPos(v) ? (v as number) : 1);

function shiftTypeKey(r: LeverageShiftRow): string {
  const outlet = r.outlet ? r.outlet.trim() : "";
  return `${outlet}|${r.day_of_week}|${r.daypart}`;
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
  let s = 0,
    c = 0;
  for (const r of rows) {
    if (isPos(r.gross_sales) && isPos(r.covers)) {
      s += r.gross_sales as number;
      c += r.covers as number;
    }
  }
  return c > 0 ? s / c : null;
}
function weightedRph(rows: LeverageShiftRow[]): number | null {
  let s = 0,
    h = 0;
  for (const r of rows) {
    if (isPos(r.gross_sales) && isPos(r.hours ?? null)) {
      s += r.gross_sales as number;
      h += r.hours as number;
    }
  }
  return h > 0 ? s / h : null;
}
function weightedCph(rows: LeverageShiftRow[]): number | null {
  let c = 0,
    h = 0;
  for (const r of rows) {
    if (isPos(r.covers) && isPos(r.hours ?? null)) {
      c += r.covers as number;
      h += r.hours as number;
    }
  }
  return h > 0 ? c / h : null;
}
function adjustedLlsFromRows(rows: LeverageShiftRow[]): number | null {
  const agg = engineAggregate(rows.map(toEngineRow), { allowMixedLaborBasis: true });
  return agg.adjustedLLS.value;
}

function topQuartile(values: number[]): number | null {
  const v = values.filter(isPos).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.floor(v.length * 0.75);
  return v[Math.min(idx, v.length - 1)];
}

function stddev(values: number[]): number {
  const v = values.filter(isNum);
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sq = v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
  return Math.sqrt(sq);
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

// ---------- core engine ----------

export function computeSchedulingLeverage(
  rows: LeverageShiftRow[],
  opts: LeverageEngineOptions = {},
): SchedulingLeverageResult {
  const targetMultiplier = opts.targetMultiplier ?? 1.2;
  const shiftFloor = opts.reliabilityShiftFloor ?? 6;
  const hoursFloor = opts.reliabilityHoursFloor ?? 24;

  // ---- data quality summary ----
  const dq = {
    rows_total: rows.length,
    rows_with_covers: rows.filter((r) => isPos(r.covers)).length,
    rows_with_hours: rows.filter((r) => isPos(r.hours ?? null)).length,
    rows_with_labor: rows.filter((r) => isPos(r.labor_cost)).length,
    matched_for_lls: rows.filter((r) => isPos(r.gross_sales) && isPos(r.labor_cost)).length,
    distinct_servers: new Set(rows.map((r) => r.server_id)).size,
    distinct_shift_types: new Set(rows.map(shiftTypeKey)).size,
    has_outlet: rows.some((r) => !!r.outlet),
    has_category: rows.some((r) => r.category_sales && Object.keys(r.category_sales).length > 0),
    notes: [] as string[],
  };
  if (dq.rows_with_hours < dq.rows_total * 0.25)
    dq.notes.push("Hours not provided for most shifts — RPH-based scoring is reduced and confidence lowered.");
  if (dq.rows_with_covers < dq.rows_total * 0.25)
    dq.notes.push("Covers not provided for most shifts — RPC-based scoring is reduced and confidence lowered.");
  if (!dq.has_outlet) dq.notes.push("Outlet not detected — shift types grouped by day-of-week + daypart only.");
  if (!dq.has_category) dq.notes.push("Category sales not detected — category fit set to neutral.");

  // ---- group rows ----
  const byType = new Map<string, LeverageShiftRow[]>();
  for (const r of rows) {
    const k = shiftTypeKey(r);
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(r);
  }

  // venue-wide stats per shift type
  const baselines = new Map<string, ShiftTypeBaseline>();
  const allRphValues: number[] = [];
  const allRpcValues: number[] = [];
  for (const [k, list] of byType) {
    const has_covers = list.some((r) => isPos(r.covers));
    const has_hours = list.some((r) => isPos(r.hours ?? null));
    const venue_rpc = weightedRpc(list);
    const venue_rph = weightedRph(list);
    const venue_cph = weightedCph(list);
    const venue_adj_lls = adjustedLlsFromRows(list);
    const expected_covers = has_covers
      ? list.reduce((a, r) => a + (isPos(r.covers) ? (r.covers as number) : 0), 0) /
        list.filter((r) => isPos(r.covers)).length
      : null;
    const expected_hours = has_hours
      ? list.reduce((a, r) => a + (isPos(r.hours ?? null) ? (r.hours as number) : 0), 0) /
        list.filter((r) => isPos(r.hours ?? null)).length
      : null;
    if (isPos(venue_rph)) allRphValues.push(venue_rph as number);
    if (isPos(venue_rpc)) allRpcValues.push(venue_rpc as number);

    const sample = list[0];
    baselines.set(k, {
      key: k,
      outlet: sample.outlet ?? null,
      day_of_week: sample.day_of_week,
      daypart: sample.daypart,
      venue_rpc,
      venue_rph,
      venue_cph,
      venue_adjusted_lls: venue_adj_lls,
      benchmark_adjusted_lls: venue_adj_lls,
      expected_covers,
      expected_hours,
      shift_count: list.length,
      target_rph: null,
      target_rpc: null,
      rph_headroom: 0,
      rpc_headroom: 0,
      opportunity_need: 0,
      opportunity_factor_typical: ofOrOne(sample.opportunity_factor),
      has_covers,
      has_hours,
    });
  }

  // target = top-quartile across shift types or fallback multiplier × venue
  const tqRph = topQuartile(allRphValues);
  const tqRpc = topQuartile(allRpcValues);
  for (const b of baselines.values()) {
    b.target_rph = tqRph ?? (isPos(b.venue_rph) ? (b.venue_rph as number) * targetMultiplier : null);
    b.target_rpc = tqRpc ?? (isPos(b.venue_rpc) ? (b.venue_rpc as number) * targetMultiplier : null);
    b.rph_headroom =
      isPos(b.target_rph) && isPos(b.venue_rph)
        ? Math.max(0, (b.target_rph as number) - (b.venue_rph as number)) / (b.target_rph as number)
        : 0;
    b.rpc_headroom =
      isPos(b.target_rpc) && isPos(b.venue_rpc)
        ? Math.max(0, (b.target_rpc as number) - (b.venue_rpc as number)) / (b.target_rpc as number)
        : 0;
    b.opportunity_need = 0.5 * b.rph_headroom + 0.5 * b.rpc_headroom;
  }

  // average loaded $/hour fallback (venue-wide)
  const venueLoadedRate = (() => {
    let cost = 0,
      hrs = 0;
    for (const r of rows) {
      if (isPos(r.labor_cost) && isPos(r.hours ?? null)) {
        cost += r.labor_cost as number;
        hrs += r.hours as number;
      }
    }
    return hrs > 0 ? cost / hrs : null;
  })();

  // ---- per-server per-type ----
  const serverIds = Array.from(new Set(rows.map((r) => r.server_id)));
  const serverNames = new Map(rows.map((r) => [r.server_id, r.server_name]));
  const serverTotalShifts = new Map<string, number>();
  for (const id of serverIds) {
    serverTotalShifts.set(id, rows.filter((r) => r.server_id === id).length);
  }

  const matrix: ServerShiftCell[] = [];
  for (const id of serverIds) {
    const serverRows = rows.filter((r) => r.server_id === id);
    for (const [k, baseline] of baselines) {
      const inType = serverRows.filter((r) => shiftTypeKey(r) === k);
      const comparable_shifts = inType.length;
      const comparable_hours = inType.reduce(
        (a, r) => a + (isPos(r.hours ?? null) ? (r.hours as number) : 0),
        0,
      );

      // reliability
      const shiftRel = Math.min(1, comparable_shifts / shiftFloor);
      const hoursRel = baseline.has_hours ? Math.min(1, comparable_hours / hoursFloor) : shiftRel;
      const reliability = 0.6 * shiftRel + 0.4 * hoursRel;

      // raw server metrics
      const server_rpc = weightedRpc(inType);
      const server_rph = weightedRph(inType);
      const server_cph = weightedCph(inType);
      const server_adj_lls = adjustedLlsFromRows(inType);

      // shrink toward venue baseline
      const shrink = (s: number | null, v: number | null): number | null => {
        if (isPos(s) && isPos(v)) return reliability * (s as number) + (1 - reliability) * (v as number);
        if (isPos(v)) return v;
        if (isPos(s)) return s;
        return null;
      };
      const projected_rpc = shrink(server_rpc, baseline.venue_rpc);
      const projected_rph = shrink(server_rph, baseline.venue_rph);
      const projected_cph = shrink(server_cph, baseline.venue_cph);
      const projected_adjusted_lls = shrink(server_adj_lls, baseline.venue_adjusted_lls);

      // indexes (neutral 1.0 when not computable)
      const idx = (p: number | null, b: number | null) =>
        isPos(p) && isPos(b) ? (p as number) / (b as number) : 1;
      const adjusted_lls_index = idx(projected_adjusted_lls, baseline.benchmark_adjusted_lls);
      const rph_index = idx(projected_rph, baseline.venue_rph);
      const rpc_index = idx(projected_rpc, baseline.venue_rpc);
      const throughput_index = idx(projected_cph, baseline.venue_cph);

      // consistency: fraction of shifts above benchmark adjusted LLS - volatility penalty
      let aboveBench = 0;
      const gaps: number[] = [];
      for (const r of inType) {
        const a = adjustedLlsFromRows([r]);
        if (isPos(a) && isPos(baseline.benchmark_adjusted_lls)) {
          const gap = (a as number) / (baseline.benchmark_adjusted_lls as number) - 1;
          gaps.push(gap);
          if (gap > 0) aboveBench++;
        }
      }
      const aboveRate = gaps.length ? aboveBench / gaps.length : 0;
      const volatility = Math.min(1, stddev(gaps) / 0.25);
      let consistency_score = 0.7 * aboveRate + 0.3 * (1 - volatility);
      if (reliability < 1) consistency_score = Math.min(consistency_score, reliability);

      // category fit (neutral when no data)
      const category_fit = 1.0;

      // normalisation: 120% of benchmark = full score
      const norm = (i: number) => clamp(i / 1.2, 0, 1);
      const fit_score =
        100 *
        (norm(adjusted_lls_index) * 0.3 +
          norm(rph_index) * 0.2 +
          norm(rpc_index) * 0.2 +
          norm(throughput_index) * 0.1 +
          norm(category_fit) * 0.1 +
          clamp(consistency_score, 0, 1) * 0.1);

      // current allocation share
      const totalServerShifts = serverTotalShifts.get(id) ?? 0;
      const current_allocation_share =
        totalServerShifts > 0 ? comparable_shifts / totalServerShifts : 0;
      const underused = 1 - current_allocation_share;

      // confidence
      const dataCompleteness = (() => {
        let parts = 0;
        let total = 4;
        if (isPos(server_rpc) || baseline.has_covers) parts++;
        if (isPos(server_rph) || baseline.has_hours) parts++;
        if (isPos(server_adj_lls)) parts++;
        if (baseline.shift_count >= 3) parts++;
        return parts / total;
      })();
      const matchConfidence = 1; // join confidence n/a in v1
      const volatilityConfidence = 1 - volatility;
      const rawConfidence =
        0.35 * reliability +
        0.25 * dataCompleteness +
        0.25 * matchConfidence +
        0.15 * volatilityConfidence;
      // Hard cap: confidence cannot exceed what the sample reliability can
      // legitimately support. A 1-shift sample with otherwise perfect data
      // must still resolve to "low" / "insufficient" — never "high".
      const confidence = Math.min(rawConfidence, 0.4 + 0.6 * reliability);
      const confidence_band = bandConfidence(confidence);

      // rota test priority
      const rota_test_priority =
        fit_score *
        clamp(confidence, 0, 1) *
        (0.6 + 0.4 * clamp(baseline.opportunity_need, 0, 1)) *
        (0.75 + 0.25 * clamp(underused, 0, 1));

      // modelled sales
      const expCovers = baseline.expected_covers;
      const expHours = baseline.expected_hours;
      const baselineFromCovers =
        isPos(expCovers) && isPos(baseline.venue_rpc)
          ? (expCovers as number) * (baseline.venue_rpc as number)
          : null;
      const projectedFromCovers =
        isPos(expCovers) && isPos(projected_rpc)
          ? (expCovers as number) * (projected_rpc as number)
          : null;
      const baselineFromHours =
        isPos(expHours) && isPos(baseline.venue_rph)
          ? (expHours as number) * (baseline.venue_rph as number)
          : null;
      const projectedFromHours =
        isPos(expHours) && isPos(projected_rph)
          ? (expHours as number) * (projected_rph as number)
          : null;
      const baseline_sales =
        baseline.has_covers && baselineFromCovers != null
          ? 0.7 * baselineFromCovers + 0.3 * (baselineFromHours ?? baselineFromCovers)
          : baselineFromHours;
      const projected_sales =
        baseline.has_covers && projectedFromCovers != null
          ? 0.7 * projectedFromCovers + 0.3 * (projectedFromHours ?? projectedFromCovers)
          : projectedFromHours;
      const modelled_revenue_lift =
        isNum(projected_sales) && isNum(baseline_sales)
          ? (projected_sales as number) - (baseline_sales as number)
          : null;

      // projected labour cost & adjusted LLS for the modelled shift
      const serverLoadedRate = (() => {
        let cost = 0,
          hrs = 0;
        for (const r of serverRows) {
          if (isPos(r.labor_cost) && isPos(r.hours ?? null)) {
            cost += r.labor_cost as number;
            hrs += r.hours as number;
          }
        }
        return hrs > 0 ? cost / hrs : venueLoadedRate;
      })();
      const projected_labour_cost =
        isPos(expHours) && isPos(serverLoadedRate)
          ? (expHours as number) * (serverLoadedRate as number)
          : null;
      const of = baseline.opportunity_factor_typical;
      const projected_adjusted_lls_for_shift =
        isPos(projected_sales) && isPos(projected_labour_cost)
          ? (projected_sales as number) / ((projected_labour_cost as number) * of)
          : null;
      const marginal_leverage_gain =
        isPos(projected_adjusted_lls_for_shift) && isPos(baseline.benchmark_adjusted_lls)
          ? (projected_adjusted_lls_for_shift as number) /
              (baseline.benchmark_adjusted_lls as number) -
            1
          : null;

      // cell label
      let cell_label: CellLabel;
      if (confidence < 0.4) cell_label = "insufficient_data";
      else if (fit_score >= 80 && rota_test_priority >= 50) cell_label = "best_fit";
      else if (fit_score >= 65) cell_label = "good_fit";
      else if (fit_score >= 50) cell_label = "test_monitor";
      else cell_label = "avoid_for_now";

      const reasons: string[] = [];
      if (rpc_index >= 1.1) reasons.push(`RPC ${(rpc_index * 100 - 100).toFixed(0)}% above venue`);
      if (rph_index >= 1.1) reasons.push(`RPH ${(rph_index * 100 - 100).toFixed(0)}% above venue`);
      if (adjusted_lls_index >= 1.1) reasons.push(`Adj. LLS strong vs. benchmark`);
      if (baseline.opportunity_need >= 0.15) reasons.push(`Shift has headroom to lift`);
      if (current_allocation_share < 0.05 && fit_score >= 65) reasons.push(`Underused capability`);

      const warnings: string[] = [];
      if (reliability < 0.5) warnings.push("Low sample — projection shrunk to venue baseline");
      if (!baseline.has_hours) warnings.push("Hours not provided — RPH metrics estimated");
      if (!baseline.has_covers) warnings.push("Covers not provided — RPC metrics estimated");

      matrix.push({
        server_id: id,
        server_name: serverNames.get(id) ?? id,
        shift_type: k,
        baseline,
        server_rpc,
        server_rph,
        server_cph,
        server_adjusted_lls: server_adj_lls,
        projected_rpc,
        projected_rph,
        projected_cph,
        projected_adjusted_lls,
        adjusted_lls_index,
        rph_index,
        rpc_index,
        throughput_index,
        category_fit,
        consistency_score,
        reliability,
        comparable_shifts,
        comparable_hours,
        current_allocation_share,
        fit_score,
        rota_test_priority,
        confidence,
        confidence_band,
        cell_label,
        baseline_sales,
        projected_sales,
        modelled_revenue_lift,
        projected_adjusted_lls_for_shift,
        marginal_leverage_gain,
        reasons,
        warnings,
      });
    }
  }

  // ---- recommendations ----
  const recommendations: ServerRecommendation[] = [];
  const reasonFor = (cell: ServerShiftCell): string => {
    if (cell.reasons.length) return cell.reasons.join(" · ");
    return `Fit ${cell.fit_score.toFixed(0)} vs venue benchmark; rota-test priority ${cell.rota_test_priority.toFixed(0)}.`;
  };
  const suggestedTestFor = (cell: ServerShiftCell): string => {
    const label = humanShiftLabel(cell.baseline);
    return `Schedule 1–2 ${label} shifts over the next 2 weeks and compare RPC and adjusted LLS against the venue baseline.`;
  };
  const currentPatternFor = (id: string): string => {
    const counts = new Map<string, number>();
    for (const r of rows.filter((r) => r.server_id === id)) {
      const k = shiftTypeKey(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (!top.length) return "No shifts on record";
    return top
      .map(([k, n]) => {
        const b = baselines.get(k)!;
        return `${humanShiftLabel(b)} ×${n}`;
      })
      .join(", ");
  };
  const toRec = (
    type: RecommendationType,
    cell: ServerShiftCell,
    why?: string,
    test?: string,
  ): ServerRecommendation => ({
    server_id: cell.server_id,
    server_name: cell.server_name,
    recommendation_type: type,
    best_fit_shift: humanShiftLabel(cell.baseline),
    current_pattern: currentPatternFor(cell.server_id),
    why: why ?? reasonFor(cell),
    suggested_rota_test: test ?? suggestedTestFor(cell),
    modelled_opportunity: cell.modelled_revenue_lift,
    confidence: cell.confidence_band,
    fit_score: cell.fit_score,
    rota_test_priority: cell.rota_test_priority,
  });

  for (const id of serverIds) {
    const cells = matrix.filter((c) => c.server_id === id && c.confidence_band !== "insufficient");
    if (!cells.length) continue;

    // best peak performer (high OF / busy)
    const peakCells = cells.filter(
      (c) =>
        (c.baseline.opportunity_factor_typical > 1.1 ||
          (c.baseline.expected_covers != null && c.baseline.expected_covers > 0)) &&
        c.fit_score >= 70 &&
        c.throughput_index >= 1.05 &&
        c.consistency_score >= 0.5,
    );
    const peak = peakCells.sort((a, b) => b.fit_score - a.fit_score)[0];
    if (peak)
      recommendations.push(
        toRec(
          "peak_performer",
          peak,
          `${peak.server_name} holds performance under pressure — Adj. LLS index ${peak.adjusted_lls_index.toFixed(2)}, throughput ${(peak.throughput_index * 100 - 100).toFixed(0)}% above venue.`,
        ),
      );

    // slow shift lifter — OF low / headroom high / RPC or RPH above baseline
    const slowCells = cells.filter(
      (c) =>
        c.baseline.opportunity_need >= 0.15 &&
        (c.rpc_index >= 1.1 || c.rph_index >= 1.1) &&
        c.rota_test_priority >=
          (cells.map((x) => x.rota_test_priority).sort((a, b) => b - a)[0] ?? 0) * 0.8,
    );
    const lifter = slowCells.sort((a, b) => b.rota_test_priority - a.rota_test_priority)[0];
    if (lifter)
      recommendations.push(
        toRec(
          "slow_shift_lifter",
          lifter,
          `${lifter.server_name} creates the biggest improvement on a lower-opportunity shift — projected RPC lift on ${humanShiftLabel(lifter.baseline)}, where venue baseline is weaker.`,
        ),
      );

    // high RPC specialist
    const rpcCells = cells.filter(
      (c) =>
        c.rpc_index >= 1.1 && c.adjusted_lls_index >= 1.0 && c.confidence_band !== "low",
    );
    const rpcStar = rpcCells.sort((a, b) => b.rpc_index - a.rpc_index)[0];
    if (rpcStar)
      recommendations.push(
        toRec(
          "high_rpc_specialist",
          rpcStar,
          `Strong spend-per-guest builder — RPC ${(rpcStar.rpc_index * 100 - 100).toFixed(0)}% above venue on ${humanShiftLabel(rpcStar.baseline)}.`,
        ),
      );

    // throughput specialist
    const tpCells = cells.filter(
      (c) => c.throughput_index >= 1.1 && c.rph_index >= 1.05 && c.rpc_index >= 0.9,
    );
    const tpStar = tpCells.sort((a, b) => b.throughput_index - a.throughput_index)[0];
    if (tpStar)
      recommendations.push(
        toRec(
          "throughput_specialist",
          tpStar,
          `Handles volume efficiently — covers-per-hour ${(tpStar.throughput_index * 100 - 100).toFixed(0)}% above venue.`,
        ),
      );

    // development shift
    const devCells = cells.filter(
      (c) =>
        c.adjusted_lls_index < 0.9 &&
        c.confidence_band !== "low" &&
        c.baseline.opportunity_factor_typical <= 1.0,
    );
    const dev = devCells.sort((a, b) => a.fit_score - b.fit_score)[0];
    if (dev)
      recommendations.push(
        toRec(
          "development_shift",
          dev,
          `Lower-pressure shift with less downside risk — pair with a strong RPC server before testing peak periods.`,
        ),
      );

    // protect from mismatch
    const allMyCells = matrix.filter((c) => c.server_id === id);
    const strongOverall = cells.some((c) => c.fit_score >= 70);
    const mismatch = allMyCells.find(
      (c) => strongOverall && c.fit_score < 50 && c.current_allocation_share >= 0.25,
    );
    if (mismatch)
      recommendations.push(
        toRec(
          "protect_from_mismatch",
          mismatch,
          `Currently heavily scheduled on ${humanShiftLabel(mismatch.baseline)} where their fit is low (${mismatch.fit_score.toFixed(0)}). The mismatch may be the deployment, not the server.`,
          `Reduce ${humanShiftLabel(mismatch.baseline)} allocation and test on shifts with higher projected fit.`,
        ),
      );
  }

  // ---- highlights — best across all servers ----
  const pickBest = (
    pool: ServerRecommendation[],
    type: RecommendationType,
    rank: (r: ServerRecommendation) => number,
  ): ServerRecommendation | null => {
    const filtered = pool.filter((r) => r.recommendation_type === type);
    if (!filtered.length) return null;
    return filtered.sort((a, b) => rank(b) - rank(a))[0];
  };

  const bestOverallCell =
    matrix
      .filter((c) => c.confidence_band !== "insufficient")
      .sort((a, b) => b.fit_score - a.fit_score)[0] ?? null;
  const best_overall_leverage =
    bestOverallCell != null
      ? toRec(
          "best_overall_leverage",
          bestOverallCell,
          `Highest overall fit (${bestOverallCell.fit_score.toFixed(0)}/100) — projected Adj. LLS index ${bestOverallCell.adjusted_lls_index.toFixed(2)} vs benchmark.`,
        )
      : null;

  const underusedCell =
    matrix
      .filter(
        (c) =>
          c.confidence_band !== "insufficient" &&
          c.current_allocation_share < 0.1 &&
          c.fit_score >= 65,
      )
      .sort((a, b) => b.rota_test_priority - a.rota_test_priority)[0] ?? null;
  const most_underused =
    underusedCell != null
      ? toRec(
          "underused_capability",
          underusedCell,
          `Strong projected fit (${underusedCell.fit_score.toFixed(0)}) on ${humanShiftLabel(underusedCell.baseline)} but currently scheduled there only ${(underusedCell.current_allocation_share * 100).toFixed(0)}% of the time.`,
        )
      : null;

  const coachingCell =
    matrix
      .filter(
        (c) =>
          c.confidence_band !== "insufficient" &&
          c.adjusted_lls_index < 0.9 &&
          c.current_allocation_share >= 0.15,
      )
      .sort((a, b) => a.adjusted_lls_index - b.adjusted_lls_index)[0] ?? null;
  const biggest_coaching_opportunity =
    coachingCell != null
      ? toRec(
          "development_shift",
          coachingCell,
          `Currently scheduled on ${humanShiftLabel(coachingCell.baseline)} but Adj. LLS index ${coachingCell.adjusted_lls_index.toFixed(2)} — coachable gap vs. benchmark.`,
        )
      : null;

  const highlights = {
    best_overall_leverage,
    best_slow_shift_lifter: pickBest(recommendations, "slow_shift_lifter", (r) => r.rota_test_priority),
    best_peak_performer: pickBest(recommendations, "peak_performer", (r) => r.fit_score),
    best_rpc_builder: pickBest(recommendations, "high_rpc_specialist", (r) => r.fit_score),
    best_throughput: pickBest(recommendations, "throughput_specialist", (r) => r.fit_score),
    most_underused,
    biggest_coaching_opportunity,
  };

  return {
    shift_types: Array.from(baselines.values()).sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return a.daypart.localeCompare(b.daypart);
    }),
    servers: serverIds.map((id) => ({ id, name: serverNames.get(id) ?? id })),
    matrix,
    highlights,
    recommendations,
    data_quality: dq,
  };
}

export const __test_only = { shiftTypeKey, humanShiftLabel, topQuartile };
