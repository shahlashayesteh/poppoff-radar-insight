import type { MetricResult } from "./types";
import { nullMetric } from "./types";

export interface RecoverableRow {
  actual_rph: number | null | undefined;
  benchmark_rph: number | null | undefined;
  hours_worked: number | null | undefined;
}

export const DEFAULT_RECOVERABILITY_FACTOR = 0.5;

/**
 * Recoverable Opportunity — MODELLED. Never call it guaranteed.
 *
 * Σ[ max(0, benchmark_rph − actual_rph) × hours_worked ] × recoverability_factor
 */
export function recoverableOpportunity(
  rows: RecoverableRow[],
  recoverabilityFactor: number = DEFAULT_RECOVERABILITY_FACTOR,
): MetricResult<number | null> {
  if (!rows.length) return nullMetric("modelled recoverable opportunity");
  let sum = 0;
  let usable = 0;
  for (const r of rows) {
    if (
      typeof r.actual_rph !== "number" ||
      typeof r.benchmark_rph !== "number" ||
      typeof r.hours_worked !== "number"
    )
      continue;
    if (!isFinite(r.actual_rph) || !isFinite(r.benchmark_rph) || !isFinite(r.hours_worked))
      continue;
    const gap = Math.max(0, r.benchmark_rph - r.actual_rph);
    sum += gap * r.hours_worked;
    usable++;
  }
  if (!usable) return nullMetric("modelled recoverable opportunity — no comparable rows");
  return {
    value: sum * recoverabilityFactor,
    provenance: "estimated",
    formula:
      "Σ[max(0, benchmark_rph − actual_rph) × hours_worked] × recoverability_factor (modelled)",
    sourceFields: ["benchmark_rph", "actual_rph", "hours_worked", "recoverability_factor"],
    notes: [
      `Modelled estimate using recoverability_factor = ${recoverabilityFactor}.`,
      "Directional opportunity — not guaranteed revenue.",
    ],
  };
}
