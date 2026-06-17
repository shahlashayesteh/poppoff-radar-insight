// v1 vs v2 weekly comparison output (shadow mode).
import type { ConfidenceBand, RagStatus } from "./config";

export type VarianceCode =
  | "historical_benchmark_replaced_same_week_benchmark"
  | "missing_time_preserved"
  | "duplicate_removed_from_canonical"
  | "identity_records_merged"
  | "weighted_opportunity_factor"
  | "weighted_weekly_aggregation"
  | "missing_covers_not_coerced"
  | "single_sided_record_excluded"
  | "attribution_quality_adjustment"
  | "confidence_suppressed_rag";

export interface V1WeeklyView {
  weekly_rpc: number | null;
  base_lls: number | null;
  adjusted_lls: number | null;
  benchmark_adjusted_lls: number | null;
  performance_gap: number | null;
  rag: "green" | "amber" | "red" | null;
}

export interface V2WeeklyView {
  weekly_rpc: number | null;
  base_lls: number | null;
  adjusted_lls: number | null;
  comparable_adjusted_lls: number | null;
  performance_gap: number | null;
  rag: RagStatus;
  benchmark_confidence: ConfidenceBand;
  result_confidence: ConfidenceBand;
  final_confidence: ConfidenceBand;
  expected_sales: number | null;
  modelled_revenue_opportunity: number | null;
}

export interface ComparisonOutput {
  v1: V1WeeklyView;
  v2: V2WeeklyView;
  diff_adjusted_lls: number | null;
  diff_performance_gap: number | null;
  variance_explanations: VarianceCode[];
}

export function buildComparison(v1: V1WeeklyView, v2: V2WeeklyView, ctx: {
  hadSingleSidedExcluded?: boolean;
  hadDuplicatesRemoved?: boolean;
  hadIdentityMerges?: boolean;
  hadMissingCovers?: boolean;
  attribQualityAdjusted?: boolean;
}): ComparisonOutput {
  const variance: VarianceCode[] = ["historical_benchmark_replaced_same_week_benchmark",
    "weighted_opportunity_factor", "weighted_weekly_aggregation"];
  if (ctx.hadMissingCovers) variance.push("missing_covers_not_coerced", "missing_time_preserved");
  if (ctx.hadDuplicatesRemoved) variance.push("duplicate_removed_from_canonical");
  if (ctx.hadIdentityMerges) variance.push("identity_records_merged");
  if (ctx.hadSingleSidedExcluded) variance.push("single_sided_record_excluded");
  if (ctx.attribQualityAdjusted) variance.push("attribution_quality_adjustment");
  if (v2.final_confidence === "low" || v2.final_confidence === "insufficient")
    variance.push("confidence_suppressed_rag");

  const diff_adj =
    v1.adjusted_lls != null && v2.adjusted_lls != null ? v2.adjusted_lls - v1.adjusted_lls : null;
  const diff_gap =
    v1.performance_gap != null && v2.performance_gap != null
      ? v2.performance_gap - v1.performance_gap
      : null;

  return { v1, v2, diff_adjusted_lls: diff_adj, diff_performance_gap: diff_gap, variance_explanations: variance };
}
