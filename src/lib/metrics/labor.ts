import type { LaborBasis, HoursBasis, MetricResult } from "./types";

export interface LaborInput {
  fully_loaded_labor_cost?: number | null;
  total_labor_cost?: number | null;
  gross_wage_cost?: number | null;
  employer_on_cost?: number | null;
  wage_cost?: number | null;
  hourly_rate?: number | null;
  paid_hours?: number | null;
  actual_hours?: number | null;
  clock_in?: string | null;
  clock_out?: string | null;
  unpaid_break_minutes?: number | null;
  scheduled_hours?: number | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/**
 * Labour Cost — canonical hierarchy:
 *   1. fully_loaded_labor_cost      (basis: fully_loaded, uploaded)
 *   2. total_labor_cost             (basis: total, uploaded)
 *   3. gross_wage_cost + employer_on_cost  (basis: wage_plus_oncost, derived)
 *   4. gross_wage_cost / wage_cost  (basis: wage_only, uploaded)  — LABEL "wage only"
 *   5. hourly_rate × paid_hours     (basis: rate_times_hours, derived) — LABEL "derived"
 *
 * Provenance + basis are preserved so the manager UI can show a badge.
 * Never silently promote one field into another.
 */
export function laborCost(
  input: LaborInput,
): MetricResult<number | null> & { basis: LaborBasis } {
  if (isNum(input.fully_loaded_labor_cost)) {
    return {
      value: input.fully_loaded_labor_cost,
      basis: "fully_loaded",
      provenance: "uploaded",
      formula: "fully_loaded_labor_cost (source field)",
      sourceFields: ["fully_loaded_labor_cost"],
    };
  }
  if (isNum(input.total_labor_cost)) {
    return {
      value: input.total_labor_cost,
      basis: "total",
      provenance: "uploaded",
      formula: "total_labor_cost (source field)",
      sourceFields: ["total_labor_cost"],
    };
  }
  if (isNum(input.gross_wage_cost) && isNum(input.employer_on_cost)) {
    return {
      value: input.gross_wage_cost + input.employer_on_cost,
      basis: "wage_plus_oncost",
      provenance: "derived",
      formula: "gross_wage_cost + employer_on_cost",
      sourceFields: ["gross_wage_cost", "employer_on_cost"],
    };
  }
  const wage = isNum(input.gross_wage_cost) ? input.gross_wage_cost : input.wage_cost;
  if (isNum(wage)) {
    return {
      value: wage,
      basis: "wage_only",
      provenance: "uploaded",
      formula: "gross wage cost only (no on-cost data)",
      sourceFields: [isNum(input.gross_wage_cost) ? "gross_wage_cost" : "wage_cost"],
      notes: ["Wage cost only — excludes employer on-costs"],
    };
  }
  const hours = hoursWorked(input).value;
  if (isNum(input.hourly_rate) && isNum(hours)) {
    return {
      value: input.hourly_rate * hours,
      basis: "rate_times_hours",
      provenance: "derived",
      formula: "hourly_rate × hours_worked",
      sourceFields: ["hourly_rate", "paid_hours"],
      notes: ["Derived labour cost — no cost column uploaded"],
    };
  }
  return {
    value: null,
    basis: "none",
    provenance: "defaulted",
    formula: "labour cost unavailable",
    sourceFields: [],
  };
}

/**
 * Hours Worked — canonical hierarchy:
 *   1. paid_hours
 *   2. actual_hours
 *   3. clock_out − clock_in − unpaid_breaks
 *   4. scheduled_hours  (LABEL "scheduled est.")
 */
export function hoursWorked(
  input: LaborInput,
): MetricResult<number | null> & { basis: HoursBasis } {
  if (isNum(input.paid_hours)) {
    return {
      value: input.paid_hours,
      basis: "paid",
      provenance: "uploaded",
      formula: "paid_hours (source field)",
      sourceFields: ["paid_hours"],
    };
  }
  if (isNum(input.actual_hours)) {
    return {
      value: input.actual_hours,
      basis: "actual",
      provenance: "uploaded",
      formula: "actual_hours (source field)",
      sourceFields: ["actual_hours"],
    };
  }
  if (input.clock_in && input.clock_out) {
    const inMs = Date.parse(input.clock_in);
    const outMs = Date.parse(input.clock_out);
    if (isFinite(inMs) && isFinite(outMs) && outMs > inMs) {
      const breakMin = isNum(input.unpaid_break_minutes) ? input.unpaid_break_minutes : 0;
      const value = (outMs - inMs) / 3_600_000 - breakMin / 60;
      if (value > 0) {
        return {
          value,
          basis: "clock_derived",
          provenance: "derived",
          formula: "(clock_out − clock_in) − unpaid_break_minutes",
          sourceFields: ["clock_in", "clock_out", "unpaid_break_minutes"],
        };
      }
    }
  }
  if (isNum(input.scheduled_hours)) {
    return {
      value: input.scheduled_hours,
      basis: "scheduled",
      provenance: "estimated",
      formula: "scheduled_hours (estimate — actuals unavailable)",
      sourceFields: ["scheduled_hours"],
      notes: ["Scheduled estimate — not actual worked hours"],
    };
  }
  return {
    value: null,
    basis: "none",
    provenance: "defaulted",
    formula: "hours unavailable",
    sourceFields: [],
  };
}
