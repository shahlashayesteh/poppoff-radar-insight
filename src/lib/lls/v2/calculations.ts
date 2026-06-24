// Per-shift and weekly weighted LLS v2 calculations.
//
// MIGRATION: math now flows through the canonical metrics engine
// (`src/lib/metrics/`). v2 keeps its own canonical-shift type because of
// extra v2-specific fields (single-sided, needs-review, span hours) but
// every numeric formula — base LLS, adjusted LLS, RPC, weighted Σ/Σ
// aggregation, performance gap — is computed by the engine.
//
// Mapping into the engine:
//   CanonicalShift.gross_sales → engine SalesInput.gross_sales (v2 only
//                                 carries gross; net is derived)
//   CanonicalShift.labor_cost  → engine LaborInput.total_labor_cost
//                                 (basis = "total")
//   effective OF               → engine ShiftRow.opportunity_factor
//                                 (applied at SHIFT level before sum)
import type { CanonicalShift, ShiftCalculation, WeeklyCalculation } from "./types";
import {
  baseLLS as engineBaseLLS,
  adjustedLLS as engineAdjustedLLS,
  aggregate as engineAggregate,
  type ShiftRow as EngineShiftRow,
} from "@/lib/metrics/lls";
import { rph as engineRph, rpc as engineRpc } from "@/lib/metrics/productivity";
import { performanceGap as enginePerformanceGap } from "@/lib/metrics/gap";

function toEngineRow(shift: CanonicalShift, effective_of: number): EngineShiftRow {
  return {
    gross_sales: shift.gross_sales,
    total_labor_cost: shift.labor_cost,
    opportunity_factor: effective_of,
  };
}

export function calcShift(shift: CanonicalShift, system_of: number, override_of: number | null): ShiftCalculation {
  const effective_of = override_of ?? system_of;
  const row = toEngineRow(shift, effective_of);
  const base = engineBaseLLS(row);
  const adj = engineAdjustedLLS(row);
  const rphRes = engineRph({
    gross_sales: shift.gross_sales,
    paid_hours: shift.hours_worked,
  });
  const rpcRes = engineRpc({
    gross_sales: shift.gross_sales,
    covers: shift.covers ?? null,
  });
  const adjusted_labor_cost = shift.labor_cost > 0 ? shift.labor_cost * effective_of : null;
  return {
    shift_id: shift.id,
    rph: rphRes.value,
    rpc: rpcRes.value,
    base_lls: base.value,
    adjusted_labor_cost,
    adjusted_lls: adj.value,
    effective_of,
    system_of,
    override_of,
  };
}

/**
 * Aggregate weekly via the canonical engine.
 * Engine enforces:
 *   - weighted Σ net_sales / Σ(labor_cost × OF) — never avg-of-avgs
 *   - shift-level Opportunity Factor (multiplied into each labour cost
 *     BEFORE summing)
 */
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
  const engineRows: EngineShiftRow[] = validForLls.map((s) => {
    const { system_of, override_of } = ofLookup(s);
    return toEngineRow(s, override_of ?? system_of);
  });
  const agg = engineAggregate(engineRows, { allowMixedLaborBasis: true });

  let hours = 0;
  let covers: number | null = 0;
  let anyMissingCovers = false;
  for (const s of validForLls) {
    hours += s.hours_worked;
    if (s.covers == null) anyMissingCovers = true;
    else covers = (covers ?? 0) + s.covers;
  }
  if (anyMissingCovers) covers = null;

  const gross = agg.totalNetSales; // v2 has no leakage cols → net == gross
  const labor_cost = agg.totalLaborCost;
  const adj_cost = agg.totalAdjustedLaborCost;

  return {
    identity_id,
    venue_id,
    week_start,
    shift_count: agg.rowsIncluded,
    gross_sales: gross,
    covers,
    hours,
    labor_cost,
    adjusted_labor_cost: adj_cost,
    weekly_rph: hours > 0 ? gross / hours : null,
    weekly_rpc: covers && covers > 0 ? gross / covers : null,
    weekly_base_lls: agg.baseLLS.value,
    weekly_adjusted_lls: agg.adjustedLLS.value,
  };
}

/** Performance gap — re-exports the canonical engine implementation. */
export function performanceGap(actualAdjLls: number | null, comparableAdjLls: number | null): number | null {
  return enginePerformanceGap(actualAdjLls, comparableAdjLls).value;
}

export function modelledRevenueOpportunity(weeklyExpectedSales: number, weeklyGrossSales: number): number {
  return Math.max(0, weeklyExpectedSales - weeklyGrossSales);
}
