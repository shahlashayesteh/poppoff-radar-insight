// Phase 22 — Enterprise ROI calculation engine.
//
// Pure functions only. No Supabase, no I/O, no React. Server functions and
// tests both consume these helpers.
//
// Hard rules:
//   - We never claim "guaranteed lost revenue", "guaranteed uplift" or
//     similar — the engine returns values labelled `modelled_*` and the UI
//     wraps them in modelled-language copy.
//   - Adjusted LLS is always computed via the canonical metrics/lls
//     `aggregate()` helper (shift-level OF v1). This module does NOT switch
//     to OF v2.
//   - Confidence is a tri-state: high | medium | low.
//   - All inputs must be passed in — the engine itself never reads the
//     database, so it can never silently fabricate missing data.

import { aggregate, type ShiftRow as MetricsShiftRow } from "@/lib/metrics/lls";

// ---------- types ----------

export interface RoiShiftRow extends MetricsShiftRow {
  shift_date: string;
  covers_served?: number | null;
  // Optional real-hours signal from shifts_v2 if available.
  real_hours?: number | null;
  // Provenance flags lifted from the shifts table.
  sales_basis?: string | null;
  labor_basis?: string | null;
  reliability_class?: string | null;
  identity_match_method?: string | null;
  identity_match_confidence?: number | null;
}

export interface PeriodMetrics {
  shifts: number;
  totalSales: number;
  totalCovers: number;
  totalLaborCost: number;
  totalHours: number | null; // null when no real hours available
  rpc: number | null;        // Σ sales / Σ covers
  rph: number | null;        // Σ sales / Σ hours (null when no hours)
  baseLls: number | null;    // canonical engine
  adjustedLls: number | null; // canonical engine, applied v1 OF
  laborBasis: string;        // "wages_only" | "wages_with_oncosts" | "mixed" | "none"
}

export interface PeriodMovement {
  baseline: PeriodMetrics;
  current: PeriodMetrics;
  salesPct: number | null;
  rpcPct: number | null;
  rphPct: number | null;
  baseLlsDelta: number | null;
  adjustedLlsDelta: number | null;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DataQualitySummary {
  measuredInputs: number;
  derivedInputs: number;
  estimatedInputs: number;
  contextualInputsExcluded: number;
  blockedOrUntrustedInputs: number;
  grossUsedAsNetWarnings: number;
  unknownLaborBasisWarnings: number;
  identityAmbiguityWarnings: number;
  sampleSizeShifts: number;
  coversMissing: boolean;
  hoursMissing: boolean;
}

export interface ConfidenceBreakdown {
  level: ConfidenceLevel;
  score: number;               // 0..100, transparent
  reasons: string[];
  reductions: string[];
}

export interface RoiAssumptions {
  recoverabilityFactor: number;        // 0..1 (default 0.30 conservative)
  monthlySubscriptionCost: number;     // currency
  implementationCost: number;          // currency
  weeksInPeriod: number;               // for monthly conversion
}

export interface RoiOutput {
  // All amounts are MODELLED. Never call these "guaranteed" anywhere.
  modelledRecoverableRevenue: number;        // for the current period
  monthlyModelledRecoverableRevenue: number; // normalised to one month
  netModelledValue: number;                  // monthly RR − sub − amortised implementation
  paybackMonths: number | null;              // null when RR <= 0
  // The transparent inputs.
  rpcGap: number;                            // baseline.RPC − current.RPC (positive = gap)
  coversUsed: number;
  assumptions: RoiAssumptions;
}

export interface RoiReport {
  movement: PeriodMovement;
  roi: RoiOutput;
  dataQuality: DataQualitySummary;
  confidence: ConfidenceBreakdown;
  // OF v2 stays preview-only — only carry metadata, never apply it.
  ofV2: {
    referencedAsPreviewOnly: true;
    appliedFactorVersion: "v1";
  };
}

// ---------- core ----------

export function computePeriodMetrics(rows: RoiShiftRow[]): PeriodMetrics {
  const agg = aggregate(rows, { allowMixedLaborBasis: true });
  let covers = 0;
  let sales = 0;
  let hours = 0;
  let anyHours = false;
  for (const r of rows) {
    covers += r.covers_served ?? 0;
    sales += r.gross_sales ?? r.net_sales ?? 0;
    if (r.real_hours != null && r.real_hours > 0) {
      hours += r.real_hours;
      anyHours = true;
    }
  }
  return {
    shifts: agg.rowsIncluded + agg.rowsSkipped,
    totalSales: sales,
    totalCovers: covers,
    totalLaborCost: agg.totalLaborCost,
    totalHours: anyHours ? hours : null,
    rpc: covers > 0 ? sales / covers : null,
    rph: anyHours && hours > 0 ? sales / hours : null,
    baseLls: agg.baseLLS.value ?? null,
    adjustedLls: agg.adjustedLLS.value ?? null,
    laborBasis: agg.laborBasis,
  };
}

function pctMove(prev: number | null, cur: number | null): number | null {
  if (prev == null || cur == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function delta(prev: number | null, cur: number | null): number | null {
  if (prev == null || cur == null) return null;
  return cur - prev;
}

export function computeMovement(
  baseline: PeriodMetrics,
  current: PeriodMetrics,
): PeriodMovement {
  return {
    baseline,
    current,
    salesPct: pctMove(baseline.totalSales || null, current.totalSales),
    rpcPct: pctMove(baseline.rpc, current.rpc),
    rphPct: pctMove(baseline.rph, current.rph),
    baseLlsDelta: delta(baseline.baseLls, current.baseLls),
    adjustedLlsDelta: delta(baseline.adjustedLls, current.adjustedLls),
  };
}

export function defaultAssumptions(overrides: Partial<RoiAssumptions> = {}): RoiAssumptions {
  return {
    recoverabilityFactor: 0.30,
    monthlySubscriptionCost: 199,
    implementationCost: 0,
    weeksInPeriod: 4,
    ...overrides,
  };
}

/**
 * Modelled recoverable revenue (NOT guaranteed):
 *   gapPerCover = max(0, baseline.RPC − current.RPC)
 *   modelledRR  = gapPerCover × current.covers × recoverabilityFactor
 *
 * If current already meets/exceeds baseline RPC, modelled RR is 0 — we never
 * project upside above the operator's own measured best.
 */
export function computeRoi(
  movement: PeriodMovement,
  assumptions: RoiAssumptions,
): RoiOutput {
  const baseRpc = movement.baseline.rpc ?? 0;
  const curRpc = movement.current.rpc ?? 0;
  const gap = Math.max(0, baseRpc - curRpc);
  const covers = movement.current.totalCovers;
  const recoverable = gap * covers * assumptions.recoverabilityFactor;
  const weeks = assumptions.weeksInPeriod > 0 ? assumptions.weeksInPeriod : 4;
  const monthly = recoverable * (52 / 12) / weeks;
  const netMonthly =
    monthly - assumptions.monthlySubscriptionCost - assumptions.implementationCost / 12;
  const payback =
    monthly > assumptions.monthlySubscriptionCost
      ? (assumptions.implementationCost + assumptions.monthlySubscriptionCost) /
        (monthly - assumptions.monthlySubscriptionCost + assumptions.monthlySubscriptionCost) // == implementation+sub / monthly
      : null;
  return {
    modelledRecoverableRevenue: recoverable,
    monthlyModelledRecoverableRevenue: monthly,
    netModelledValue: netMonthly,
    paybackMonths: payback,
    rpcGap: gap,
    coversUsed: covers,
    assumptions,
  };
}

// ---------- data quality + confidence ----------

const RELIABILITY_BUCKETS = new Set(["measured", "derived", "estimated", "contextual", "untrusted"]);

export function summariseDataQuality(rows: RoiShiftRow[]): DataQualitySummary {
  let measured = 0;
  let derived = 0;
  let estimated = 0;
  let contextual = 0;
  let blocked = 0;
  let grossAsNet = 0;
  let unknownLabor = 0;
  let ambiguousIdentity = 0;
  let coversMissing = false;
  let hoursMissing = true;
  for (const r of rows) {
    const cls = (r.reliability_class ?? "").toLowerCase();
    if (cls === "measured") measured++;
    else if (cls === "derived") derived++;
    else if (cls === "estimated") estimated++;
    else if (cls === "contextual") contextual++;
    else if (cls === "untrusted" || cls === "blocked") blocked++;
    else if (RELIABILITY_BUCKETS.has(cls)) {
      // unknown but in registry — ignore
    }
    const sb = (r.sales_basis ?? "").toLowerCase();
    if (sb === "gross") grossAsNet++;
    const lb = (r.labor_basis ?? "").toLowerCase();
    if (!lb || lb === "unknown") unknownLabor++;
    const method = (r.identity_match_method ?? "").toLowerCase();
    const conf = r.identity_match_confidence ?? 0;
    if (method === "ambiguous" || (method === "name" && conf < 0.8)) ambiguousIdentity++;
    if (r.covers_served == null) coversMissing = true;
    if (r.real_hours != null && r.real_hours > 0) hoursMissing = false;
  }
  return {
    measuredInputs: measured,
    derivedInputs: derived,
    estimatedInputs: estimated,
    contextualInputsExcluded: contextual,
    blockedOrUntrustedInputs: blocked,
    grossUsedAsNetWarnings: grossAsNet,
    unknownLaborBasisWarnings: unknownLabor,
    identityAmbiguityWarnings: ambiguousIdentity,
    sampleSizeShifts: rows.length,
    coversMissing,
    hoursMissing,
  };
}

export function evaluateConfidence(
  dq: DataQualitySummary,
  movement: PeriodMovement,
): ConfidenceBreakdown {
  let score = 100;
  const reasons: string[] = [];
  const reductions: string[] = [];

  // Sample size
  if (dq.sampleSizeShifts < 20) { score -= 25; reductions.push("Small sample size (<20 shifts)"); }
  else if (dq.sampleSizeShifts < 60) { score -= 10; reductions.push("Modest sample size (<60 shifts)"); }
  else reasons.push("Sample size is sufficient");

  // Sales basis
  if (dq.grossUsedAsNetWarnings > 0) {
    score -= Math.min(20, 5 + Math.floor((dq.grossUsedAsNetWarnings / Math.max(1, dq.sampleSizeShifts)) * 30));
    reductions.push("Gross sales used as net for some shifts");
  } else {
    reasons.push("Net sales available for all shifts");
  }

  // Labour basis
  if (dq.unknownLaborBasisWarnings > 0) {
    score -= Math.min(15, 5 + Math.floor((dq.unknownLaborBasisWarnings / Math.max(1, dq.sampleSizeShifts)) * 20));
    reductions.push("Unknown labour basis on some shifts");
  } else {
    reasons.push("Labour basis is known");
  }

  // Identity
  if (dq.identityAmbiguityWarnings > 0) {
    score -= Math.min(20, 5 + dq.identityAmbiguityWarnings);
    reductions.push("Ambiguous employee identity matches present");
  } else {
    reasons.push("Employee identities resolved");
  }

  // Provenance/reliability mix
  const totalClassified =
    dq.measuredInputs + dq.derivedInputs + dq.estimatedInputs + dq.blockedOrUntrustedInputs;
  if (totalClassified === 0) {
    score -= 10;
    reductions.push("No reliability classification on shifts (pre-Phase 18A data)");
  } else {
    const measuredRatio = dq.measuredInputs / totalClassified;
    if (measuredRatio < 0.5) {
      score -= 10;
      reductions.push("Less than half of inputs are measured");
    } else {
      reasons.push("Majority of inputs are measured");
    }
  }
  if (dq.blockedOrUntrustedInputs > 0) {
    score -= 10;
    reductions.push("Untrusted inputs present and excluded from scoring");
  }

  // Missing inputs
  if (dq.coversMissing) { score -= 10; reductions.push("Covers missing on some shifts"); }
  if (dq.hoursMissing) { score -= 10; reductions.push("Real labour hours not available (cost proxy only)"); }

  // Baseline plausibility
  if (movement.baseline.rpc == null || movement.current.rpc == null) {
    score -= 20;
    reductions.push("RPC could not be computed for one of the periods");
  }

  score = Math.max(0, Math.min(100, score));
  const level: ConfidenceLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { level, score, reasons, reductions };
}

// ---------- top-level orchestrator ----------

export function buildRoiReport(input: {
  baselineRows: RoiShiftRow[];
  currentRows: RoiShiftRow[];
  assumptions?: Partial<RoiAssumptions>;
}): RoiReport {
  const baseline = computePeriodMetrics(input.baselineRows);
  const current = computePeriodMetrics(input.currentRows);
  const movement = computeMovement(baseline, current);
  const assumptions = defaultAssumptions(input.assumptions);
  const roi = computeRoi(movement, assumptions);
  const dq = summariseDataQuality(input.currentRows);
  const confidence = evaluateConfidence(dq, movement);
  return {
    movement,
    roi,
    dataQuality: dq,
    confidence,
    ofV2: { referencedAsPreviewOnly: true, appliedFactorVersion: "v1" },
  };
}

// ---------- export-ready copy ----------

export function buildExportSummary(report: RoiReport, opts: { venueName: string; periodLabel: string; }): string {
  const fmt = (n: number) => `£${Math.round(n).toLocaleString()}`;
  const lines: string[] = [];
  lines.push(`PoppOff modelled improvement opportunity — ${opts.venueName} (${opts.periodLabel})`);
  lines.push("");
  lines.push(
    `Based on measured POS sales, labour cost and ${report.dataQuality.identityAmbiguityWarnings === 0 ? "verified" : "partially verified"} employee matching, ` +
    `PoppOff identified a modelled improvement opportunity of ${fmt(report.roi.modelledRecoverableRevenue)} for the selected period ` +
    `(~${fmt(report.roi.monthlyModelledRecoverableRevenue)}/month at the selected recoverability factor of ${(report.roi.assumptions.recoverabilityFactor * 100).toFixed(0)}%).`,
  );
  lines.push("");
  lines.push(`This is a modelled opportunity, NOT guaranteed revenue.`);
  lines.push(
    `Confidence: ${report.confidence.level.toUpperCase()} (${report.confidence.score}/100). ` +
    (report.confidence.reductions.length
      ? `Reductions: ${report.confidence.reductions.join("; ")}.`
      : `No major data quality concerns.`),
  );
  if (report.dataQuality.grossUsedAsNetWarnings > 0) {
    lines.push(`Note: gross sales used as net for ${report.dataQuality.grossUsedAsNetWarnings} shifts — re-import with net to tighten estimate.`);
  }
  if (report.dataQuality.hoursMissing) {
    lines.push(`Note: real labour hours not available — RPH was not computed.`);
  }
  lines.push("");
  lines.push(`Adjusted LLS shown uses the applied v1 opportunity factor. OF v2 is preview only and was not applied.`);
  return lines.join("\n");
}
