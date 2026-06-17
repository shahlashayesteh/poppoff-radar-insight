// Historical comparable benchmark + weekly expected sales.
import type { BenchmarkResult, CanonicalShift, HistoricalPeriod, WeeklyBenchmarkResult } from "./types";

export function comparableBenchmark(
  bucket: { day_of_week: number; daypart: string; duration_tier: string },
  baselinePeriods: HistoricalPeriod[],
  effectiveSystemOf: number,
): BenchmarkResult {
  const rows = baselinePeriods.filter(
    (p) =>
      p.day_of_week === bucket.day_of_week &&
      p.daypart === bucket.daypart &&
      p.duration_tier === bucket.duration_tier,
  );
  let comparable_gross = 0;
  let comparable_labor = 0;
  for (const r of rows) {
    comparable_gross += r.gross_sales;
    comparable_labor += r.labor_cost;
  }
  const comparable_adjusted_labor = comparable_labor * effectiveSystemOf;
  return {
    comparable_count: rows.length,
    comparable_gross,
    comparable_labor,
    comparable_adjusted_labor,
    comparable_base_lls: comparable_labor > 0 ? comparable_gross / comparable_labor : null,
    comparable_adjusted_lls:
      comparable_adjusted_labor > 0 ? comparable_gross / comparable_adjusted_labor : null,
  };
}

/** Weighted weekly expected sales: sum over shifts of (adjusted_labor_cost_i × comparable_adjusted_lls_bucket_i). */
export function weeklyExpectedSales(
  shifts: CanonicalShift[],
  perShift: (s: CanonicalShift) => {
    effective_of: number;
    comparable_adjusted_lls: number | null;
  },
): WeeklyBenchmarkResult {
  let expected = 0;
  let adjCost = 0;
  for (const s of shifts) {
    if (s.gross_sales <= 0 || s.hours_worked <= 0 || s.labor_cost <= 0) continue;
    const { effective_of, comparable_adjusted_lls } = perShift(s);
    const shiftAdjLabor = s.labor_cost * effective_of;
    adjCost += shiftAdjLabor;
    if (comparable_adjusted_lls != null) {
      expected += shiftAdjLabor * comparable_adjusted_lls;
    }
  }
  return {
    expected_sales: expected,
    weekly_adjusted_labor_cost: adjCost,
    weekly_comparable_adjusted_lls: adjCost > 0 ? expected / adjCost : null,
  };
}
