// Benchmark + Result confidence, final confidence (min), and RAG mapping.
import { BENCHMARK_CONFIDENCE, RAG, RESULT_CONFIDENCE, type ConfidenceBand, type RagStatus } from "./config";

const ORDER: ConfidenceBand[] = ["insufficient", "low", "medium", "high"];
export function lowerBand(a: ConfidenceBand, b: ConfidenceBand): ConfidenceBand {
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
}

export interface BenchmarkConfidenceInputs {
  comparable_periods: number;
  weeks_represented: number;
  historical_labor_hours: number;
  historical_covers: number;
  attribution_ok_pct: number;
  labor_span_fallback_pct: number;
  unresolved_outliers_pct: number;
}

export function benchmarkConfidence(i: BenchmarkConfidenceInputs): ConfidenceBand {
  const H = BENCHMARK_CONFIDENCE.high;
  const meetsHigh =
    i.comparable_periods >= H.minComparablePeriods &&
    i.weeks_represented >= H.minWeeks &&
    i.historical_labor_hours >= H.minLaborHours &&
    i.historical_covers >= H.minCovers &&
    i.attribution_ok_pct >= H.minAttribOk &&
    i.labor_span_fallback_pct <= H.maxLaborSpanFallback &&
    i.unresolved_outliers_pct <= H.maxUnresolvedOutliers;
  if (meetsHigh) return "high";
  const M = BENCHMARK_CONFIDENCE.medium;
  const meetsMedium =
    i.comparable_periods >= M.minComparablePeriods &&
    i.weeks_represented >= M.minWeeks &&
    i.historical_labor_hours >= M.minLaborHours &&
    i.historical_covers >= M.minCovers &&
    i.attribution_ok_pct >= M.minAttribOk &&
    i.labor_span_fallback_pct <= M.maxLaborSpanFallback &&
    i.unresolved_outliers_pct <= M.maxUnresolvedOutliers;
  if (meetsMedium) return "medium";
  const L = BENCHMARK_CONFIDENCE.low;
  const meetsLow =
    i.comparable_periods >= L.minComparablePeriods &&
    i.weeks_represented >= L.minWeeks &&
    i.historical_labor_hours >= L.minLaborHours &&
    i.historical_covers >= L.minCovers;
  return meetsLow ? "low" : "insufficient";
}

export interface ResultConfidenceInputs {
  valid_shifts: number;
  labor_hours: number;
  covers: number;
  completeness_pct: number;
  unresolved_identity_conflict: boolean;
  unresolved_duplicate: boolean;
  cross_daypart_pct: number;
  has_single_sided_exception: boolean;
}

export function resultConfidence(i: ResultConfidenceInputs): ConfidenceBand {
  if (i.unresolved_identity_conflict) return "insufficient";
  const H = RESULT_CONFIDENCE.high;
  const meetsHigh =
    !i.has_single_sided_exception &&
    !i.unresolved_duplicate &&
    i.valid_shifts >= H.minShifts &&
    i.labor_hours >= H.minHours &&
    i.covers >= H.minCovers &&
    i.completeness_pct >= H.minCompleteness &&
    i.cross_daypart_pct <= H.maxCrossDaypart;
  if (meetsHigh) return "high";
  const M = RESULT_CONFIDENCE.medium;
  const meetsMedium =
    i.valid_shifts >= M.minShifts &&
    i.labor_hours >= M.minHours &&
    i.covers >= M.minCovers &&
    i.completeness_pct >= M.minCompleteness &&
    i.cross_daypart_pct <= M.maxCrossDaypart;
  if (meetsMedium) return "medium";
  const L = RESULT_CONFIDENCE.low;
  return i.valid_shifts >= L.minShifts && i.labor_hours >= L.minHours ? "low" : "insufficient";
}

export function ragStatus(
  performance_gap: number | null,
  final_confidence: ConfidenceBand,
): RagStatus {
  if (performance_gap == null) return "directional";
  if (final_confidence === "insufficient" || final_confidence === "low") return "directional";
  if (performance_gap >= RAG.greenGap) return "green";
  if (performance_gap <= RAG.redGap) return "red";
  return "amber";
}
