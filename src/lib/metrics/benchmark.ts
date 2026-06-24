import { aggregate, type ShiftRow } from "./lls";
import type { LaborBasis, MetricResult } from "./types";

/**
 * Venue Benchmark — MUST be computed on the same labour basis as the metric
 * it is being compared against. Mixed-basis comparisons are rejected by
 * the engine because they silently inflate or deflate the gap.
 *
 * Preferred: weighted adjusted LLS for comparable scope (outlet/daypart/role/period).
 * Fallback : weighted adjusted LLS for the selected period.
 *
 * The caller provides the comparable scope by pre-filtering `rows`.
 */
export interface BenchmarkOptions {
  /** Required basis the benchmark must match (defensive). */
  expectedBasis: LaborBasis;
  /** "base" or "adjusted" — defaults to adjusted. */
  mode?: "base" | "adjusted";
}

export function venueBenchmark(
  rows: ShiftRow[],
  opts: BenchmarkOptions,
): MetricResult<number | null> {
  const agg = aggregate(rows);
  if (agg.laborBasis !== opts.expectedBasis && agg.laborBasis !== "none") {
    return {
      value: null,
      provenance: "defaulted",
      formula: `benchmark rejected: expected ${opts.expectedBasis}, got ${agg.laborBasis}`,
      sourceFields: [],
      basis: agg.laborBasis,
      notes: [
        `Basis mismatch — refusing to compare ${opts.expectedBasis} metric against ${agg.laborBasis} benchmark.`,
      ],
    };
  }
  const result = opts.mode === "base" ? agg.baseLLS : agg.adjustedLLS;
  return {
    ...result,
    formula:
      opts.mode === "base"
        ? "venue benchmark = Σ net_sales / Σ labor_cost (weighted)"
        : "venue benchmark = Σ net_sales / Σ(labor_cost × OF) (weighted, shift-level OF)",
  };
}
