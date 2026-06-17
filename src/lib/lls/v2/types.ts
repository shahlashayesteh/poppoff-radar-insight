// LLS v2 — shared types.
import type { ConfidenceBand, RagStatus } from "./config";

export type DurationTier = "short" | "standard" | "long";
export type Daypart = string;

export interface CanonicalShift {
  id: string;
  venue_id: string;
  identity_id: string;
  service_date: string;
  day_of_week: number; // 0-6
  daypart: Daypart;
  duration_tier: DurationTier;
  gross_sales: number;
  net_sales: number | null;
  covers: number | null;
  hours_worked: number;
  labor_cost: number;
  cross_daypart: boolean;
  status: "active" | "incomplete" | "empty";
  single_sided_exception?: boolean;
}

export interface HistoricalPeriod {
  venue_id: string;
  service_date: string;
  day_of_week: number;
  daypart: Daypart;
  duration_tier: DurationTier;
  service_hours: number;
  gross_sales: number;
  covers: number;
  labor_hours: number;
  labor_cost: number;
  attribution_status: "reconciled" | "warning" | "held_for_review" | "blocked" | "no_control";
  duration_source: "pos_first_last" | "configured" | "reservation" | "labor_span_fallback";
  has_unresolved_outliers?: boolean;
  week_start: string;
}

export interface OFComponents {
  coi: number | null;
  rei: number | null;
  ldi: number | null;
  raw_of: number | null;
  smoothed_of: number;
  system_of: number;
  comparable_count: number;
  weights_used: { coi: number; rei: number; ldi: number };
}

export interface ShiftCalculation {
  shift_id: string;
  rph: number | null;
  rpc: number | null;
  base_lls: number | null;
  adjusted_labor_cost: number | null;
  adjusted_lls: number | null;
  effective_of: number;
  system_of: number;
  override_of: number | null;
}

export interface WeeklyCalculation {
  identity_id: string;
  venue_id: string;
  week_start: string;
  shift_count: number;
  gross_sales: number;
  covers: number | null;
  hours: number;
  labor_cost: number;
  adjusted_labor_cost: number;
  weekly_rph: number | null;
  weekly_rpc: number | null;
  weekly_base_lls: number | null;
  weekly_adjusted_lls: number | null;
}

export interface BenchmarkResult {
  comparable_count: number;
  comparable_gross: number;
  comparable_labor: number;
  comparable_adjusted_labor: number;
  comparable_base_lls: number | null;
  comparable_adjusted_lls: number | null;
}

export interface WeeklyBenchmarkResult {
  expected_sales: number;
  weekly_adjusted_labor_cost: number;
  weekly_comparable_adjusted_lls: number | null;
}

export interface ConfidenceDetail {
  benchmark_confidence: ConfidenceBand;
  result_confidence: ConfidenceBand;
  final_confidence: ConfidenceBand;
  rag_status: RagStatus;
}
