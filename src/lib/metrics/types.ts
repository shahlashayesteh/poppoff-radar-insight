/**
 * Canonical metric types for PoppOff.
 *
 * Every metric returned by the engine carries:
 *  - value        — the numeric result (or null when not computable)
 *  - basis        — what underlying field/method was used
 *  - provenance   — whether the input was uploaded / derived / estimated / defaulted
 *  - formula      — human-readable formula string (for tooltips)
 *  - sourceFields — list of source column names used
 *  - notes        — optional caveats (e.g. "approximate", "scheduled est.")
 *
 * Manager UI MUST display basis + provenance via <BasisBadge> / <MetricTooltip>.
 * Server UI MUST NOT import these badges or expose labour/LLS values.
 */

export type Provenance = "uploaded" | "derived" | "estimated" | "defaulted";

export type SalesBasis =
  | "net_sales_source" // uploaded net sales column
  | "net_sales_derived" // gross − discounts − comps − voids − refunds
  | "gross_sales_source"
  | "unknown";

export type LaborBasis =
  | "fully_loaded" // fully_loaded_labor_cost
  | "total" // total_labor_cost
  | "wage_plus_oncost" // gross wage + employer on-cost
  | "wage_only" // gross wage only
  | "rate_times_hours" // hourly_rate × paid_hours
  | "none";

export type HoursBasis =
  | "paid" // paid_hours
  | "actual" // actual_hours
  | "clock_derived" // clock_out − clock_in − unpaid_breaks
  | "scheduled" // scheduled_hours (label "scheduled est.")
  | "none";

export type RagBand =
  | "strong" // > +10% vs benchmark
  | "tracking" // ±5%
  | "monitor" // −5% .. −10%
  | "priority" // < −10%
  | "insufficient_data";

export interface MetricResult<T = number | null> {
  value: T;
  basis?: SalesBasis | LaborBasis | HoursBasis | string;
  provenance: Provenance;
  formula: string;
  sourceFields: string[];
  notes?: string[];
}

export const nullMetric = (
  formula: string,
  sourceFields: string[] = [],
  note?: string,
): MetricResult<null> => ({
  value: null,
  provenance: "defaulted",
  formula,
  sourceFields,
  notes: note ? [note] : undefined,
});
