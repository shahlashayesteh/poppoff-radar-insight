import { hoursWorked, laborCost, type LaborInput } from "./labor";
import { netSales, type SalesInput } from "./sales";
import type { LaborBasis, MetricResult } from "./types";
import { nullMetric } from "./types";

/**
 * Labour Leverage Score (LLS) — canonical engine.
 *
 * Rules enforced here:
 *   - Base LLS       = net_sales / labour_cost
 *   - Adjusted LLS   = base_LLS / opportunity_factor (applied at SHIFT level)
 *   - Team LLS       = SUM(net_sales) / SUM(labour_cost)        — weighted
 *   - Team Adj LLS   = SUM(net_sales) / SUM(labour_cost × OF)   — weighted
 *   - RPC is NEVER multiplied into LLS.
 *   - Avg-of-avg is NEVER used; all aggregates are weighted sums.
 *   - Mixed-basis aggregation is rejected (caller must split).
 */

export interface ShiftRow extends SalesInput, LaborInput {
  opportunity_factor?: number | null; // 1.0 = normal opportunity
}

const isPos = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;
const ofOrOne = (v: unknown): number =>
  typeof v === "number" && isFinite(v) && v > 0 ? v : 1;

export function baseLLS(row: ShiftRow): MetricResult<number | null> {
  const net = netSales(row);
  const lc = laborCost(row);
  if (net.value == null || !isPos(lc.value))
    return nullMetric("net_sales / labor_cost", [...net.sourceFields, ...lc.sourceFields]);
  return {
    value: net.value / lc.value,
    provenance: "derived",
    formula: "net_sales / labor_cost",
    sourceFields: [...net.sourceFields, ...lc.sourceFields],
    basis: `${net.basis} / ${lc.basis}`,
  };
}

/** Adjusted LLS at a SINGLE shift = base_LLS / OF. Never apply OF post-aggregation. */
export function adjustedLLS(row: ShiftRow): MetricResult<number | null> {
  const base = baseLLS(row);
  if (base.value == null) return base;
  const of = ofOrOne(row.opportunity_factor);
  return {
    value: base.value / of,
    provenance: "derived",
    formula: "(net_sales / labor_cost) / opportunity_factor",
    sourceFields: [...base.sourceFields, "opportunity_factor"],
    basis: base.basis,
  };
}

/**
 * Aggregate rows safely.
 * - All rows must resolve to the SAME labour basis OR caller must accept "mixed".
 * - OF is multiplied into labour cost AT EACH SHIFT before summing.
 */
export interface AggregateOptions {
  allowMixedLaborBasis?: boolean;
}

export interface AggregateResult {
  baseLLS: MetricResult<number | null>;
  adjustedLLS: MetricResult<number | null>;
  totalNetSales: number;
  totalLaborCost: number;
  totalAdjustedLaborCost: number;
  laborBasis: LaborBasis | "mixed" | "none";
  rowsIncluded: number;
  rowsSkipped: number;
}

export function aggregate(rows: ShiftRow[], opts: AggregateOptions = {}): AggregateResult {
  let totalNet = 0;
  let totalLc = 0;
  let totalAdjLc = 0;
  let included = 0;
  let skipped = 0;
  const basisSet = new Set<LaborBasis>();

  for (const r of rows) {
    const net = netSales(r);
    const lc = laborCost(r);
    if (net.value == null || !isPos(lc.value)) {
      skipped++;
      continue;
    }
    basisSet.add(lc.basis);
    const of = ofOrOne(r.opportunity_factor);
    totalNet += net.value;
    totalLc += lc.value;
    totalAdjLc += lc.value * of;
    included++;
  }

  const laborBasis: LaborBasis | "mixed" | "none" =
    basisSet.size === 0 ? "none" : basisSet.size === 1 ? [...basisSet][0] : "mixed";

  if (laborBasis === "mixed" && !opts.allowMixedLaborBasis) {
    const mismatch = nullMetric(
      "rejected: mixed labour basis across rows — split aggregation by basis",
    );
    return {
      baseLLS: mismatch,
      adjustedLLS: mismatch,
      totalNetSales: 0,
      totalLaborCost: 0,
      totalAdjustedLaborCost: 0,
      laborBasis,
      rowsIncluded: 0,
      rowsSkipped: rows.length,
    };
  }

  const baseResult: MetricResult<number | null> =
    totalLc > 0
      ? {
          value: totalNet / totalLc,
          provenance: "derived",
          formula: "Σ net_sales / Σ labor_cost (weighted)",
          sourceFields: ["net_sales", "labor_cost"],
          basis: laborBasis,
          notes:
            laborBasis === "mixed" ? ["Mixed labour basis — interpret with caution"] : undefined,
        }
      : nullMetric("Σ net_sales / Σ labor_cost — no usable rows");

  const adjResult: MetricResult<number | null> =
    totalAdjLc > 0
      ? {
          value: totalNet / totalAdjLc,
          provenance: "derived",
          formula: "Σ net_sales / Σ(labor_cost × opportunity_factor)  [shift-level OF]",
          sourceFields: ["net_sales", "labor_cost", "opportunity_factor"],
          basis: laborBasis,
        }
      : nullMetric("Σ net_sales / Σ(labor_cost × OF) — no usable rows");

  return {
    baseLLS: baseResult,
    adjustedLLS: adjResult,
    totalNetSales: totalNet,
    totalLaborCost: totalLc,
    totalAdjustedLaborCost: totalAdjLc,
    laborBasis,
    rowsIncluded: included,
    rowsSkipped: skipped,
  };
}

export const teamBaseLLS = (rows: ShiftRow[], opts?: AggregateOptions) =>
  aggregate(rows, opts).baseLLS;
export const teamAdjustedLLS = (rows: ShiftRow[], opts?: AggregateOptions) =>
  aggregate(rows, opts).adjustedLLS;
export const serverWeeklyBaseLLS = teamBaseLLS;
export const serverWeeklyAdjustedLLS = teamAdjustedLLS;
