/**
 * Regression test: proves LLS v2 calculations route through the canonical
 * metrics engine for base LLS, adjusted LLS (shift-level OF), weighted
 * weekly aggregation, and performance-gap math.
 */
import { describe, it, expect } from "vitest";
import { calcShift, calcWeekly, performanceGap } from "@/lib/lls/v2/calculations";
import { baseLLS, adjustedLLS, aggregate } from "@/lib/metrics/lls";
import { performanceGap as enginePerformanceGap } from "@/lib/metrics/gap";
import type { CanonicalShift } from "@/lib/lls/v2/types";

const mkShift = (over: Partial<CanonicalShift>): CanonicalShift =>
  ({
    id: "x",
    venue_id: "v",
    identity_id: "i",
    service_date: "2026-06-22",
    gross_sales: 1000,
    labor_cost: 100,
    hours_worked: 8,
    covers: 30,
    is_active: true,
    is_single_sided: false,
    needs_review: false,
    cross_daypart: false,
    ...over,
  }) as CanonicalShift;

describe("lls v2 ⇄ canonical engine", () => {
  it("calcShift base/adjusted LLS = engine baseLLS/adjustedLLS", () => {
    const s = mkShift({ gross_sales: 1200, labor_cost: 120 });
    const out = calcShift(s, 1.1, null);
    const base = baseLLS({ gross_sales: 1200, total_labor_cost: 120, opportunity_factor: 1.1 });
    const adj = adjustedLLS({ gross_sales: 1200, total_labor_cost: 120, opportunity_factor: 1.1 });
    expect(out.base_lls).toBe(base.value);
    expect(out.adjusted_lls).toBe(adj.value);
  });

  it("calcWeekly weekly_adjusted_lls = engine aggregate", () => {
    const shifts = [
      mkShift({ id: "1", gross_sales: 1200, labor_cost: 120 }),
      mkShift({ id: "2", gross_sales: 900, labor_cost: 100 }),
      mkShift({ id: "3", gross_sales: 1500, labor_cost: 130 }),
    ];
    const wk = calcWeekly("i", "v", "2026-06-22", shifts, () => ({
      system_of: 1.1,
      override_of: null,
    }));
    const expected = aggregate(
      shifts.map((s) => ({
        gross_sales: s.gross_sales,
        total_labor_cost: s.labor_cost,
        opportunity_factor: 1.1,
      })),
      { allowMixedLaborBasis: true },
    );
    expect(wk.weekly_adjusted_lls).toBe(expected.adjustedLLS.value);
    expect(wk.weekly_base_lls).toBe(expected.baseLLS.value);
  });

  it("performanceGap delegates to engine performanceGap", () => {
    expect(performanceGap(12, 10)).toBe(enginePerformanceGap(12, 10).value);
    expect(performanceGap(null, 10)).toBe(enginePerformanceGap(null, 10).value);
  });
});
