// Per-shift and weekly weighted LLS v2 calculations.
import type { CanonicalShift, ShiftCalculation, WeeklyCalculation } from "./types";

function safeDiv(n: number | null | undefined, d: number | null | undefined): number | null {
  if (n == null || d == null || d === 0) return null;
  return n / d;
}

export function calcShift(shift: CanonicalShift, system_of: number, override_of: number | null): ShiftCalculation {
  const effective_of = override_of ?? system_of;
  const adjusted_labor_cost = shift.labor_cost > 0 ? shift.labor_cost * effective_of : null;
  return {
    shift_id: shift.id,
    rph: safeDiv(shift.gross_sales, shift.hours_worked),
    rpc: shift.covers && shift.covers > 0 ? shift.gross_sales / shift.covers : null,
    base_lls: safeDiv(shift.gross_sales, shift.labor_cost),
    adjusted_labor_cost,
    adjusted_lls: safeDiv(shift.gross_sales, adjusted_labor_cost),
    effective_of,
    system_of,
    override_of,
  };
}

/** Aggregate weekly using weighted totals, NOT averages of daily ratios. */
export function calcWeekly(
  identity_id: string,
  venue_id: string,
  week_start: string,
  shifts: CanonicalShift[],
  ofLookup: (s: CanonicalShift) => { system_of: number; override_of: number | null },
): WeeklyCalculation {
  // Only shifts with positive gross, hours, and cost count toward LLS aggregation.
  const validForLls = shifts.filter(
    (s) => s.gross_sales > 0 && s.hours_worked > 0 && s.labor_cost > 0,
  );
  let gross = 0,
    hours = 0,
    labor_cost = 0,
    adj_cost = 0;
  let covers: number | null = 0;
  let anyMissingCovers = false;
  for (const s of validForLls) {
    const { system_of, override_of } = ofLookup(s);
    const eof = override_of ?? system_of;
    gross += s.gross_sales;
    hours += s.hours_worked;
    labor_cost += s.labor_cost;
    adj_cost += s.labor_cost * eof;
    if (s.covers == null) anyMissingCovers = true;
    else covers = (covers ?? 0) + s.covers;
  }
  if (anyMissingCovers) covers = null;
  return {
    identity_id,
    venue_id,
    week_start,
    shift_count: validForLls.length,
    gross_sales: gross,
    covers,
    hours,
    labor_cost,
    adjusted_labor_cost: adj_cost,
    weekly_rph: hours > 0 ? gross / hours : null,
    weekly_rpc: covers && covers > 0 ? gross / covers : null,
    weekly_base_lls: labor_cost > 0 ? gross / labor_cost : null,
    weekly_adjusted_lls: adj_cost > 0 ? gross / adj_cost : null,
  };
}

export function performanceGap(actualAdjLls: number | null, comparableAdjLls: number | null): number | null {
  if (actualAdjLls == null || comparableAdjLls == null || comparableAdjLls === 0) return null;
  return actualAdjLls / comparableAdjLls - 1;
}

export function modelledRevenueOpportunity(weeklyExpectedSales: number, weeklyGrossSales: number): number {
  return Math.max(0, weeklyExpectedSales - weeklyGrossSales);
}
