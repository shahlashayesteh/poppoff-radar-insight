// Pure pair-scoring + ambiguity check for sales↔labour matching.
// This is the TS implementation referenced by tests; the production matcher
// runs inside lls_v2_run_reconciliation (SQL) for atomic + locked execution.
import { MATCH } from "./config";

export interface SalesCandidate {
  staging_id: string;
  identity_id: string;
  service_date: string;
  sales_employee_shift_start?: number | null; // unix seconds
  sales_first_txn_time?: number | null;
  sales_check_open_time?: number | null;
}

export interface LaborCandidate {
  staging_id: string;
  identity_id: string;
  service_date: string;
  labor_clock_in?: number | null;
  labor_scheduled_start?: number | null;
  daypart?: string | null;
}

const TOL = MATCH.toleranceSeconds;

export function scorePair(sales: SalesCandidate, labor: LaborCandidate, sameDaypart = false, onlyLaborShiftToday = false): number {
  let score = 0;
  // Identity baseline: 100 when matched (this is enforced by the SQL prefilter).
  score += sales.identity_id === labor.identity_id ? 100 : -100;
  if (sales.sales_employee_shift_start != null && labor.labor_clock_in != null &&
      Math.abs(sales.sales_employee_shift_start - labor.labor_clock_in) <= TOL) score += 40;
  if (sales.sales_employee_shift_start != null && labor.labor_scheduled_start != null &&
      Math.abs(sales.sales_employee_shift_start - labor.labor_scheduled_start) <= TOL) score += 30;
  if (sales.sales_first_txn_time != null && labor.labor_clock_in != null &&
      Math.abs(sales.sales_first_txn_time - labor.labor_clock_in) <= TOL) score += 20;
  if (sales.sales_check_open_time != null && labor.labor_clock_in != null &&
      Math.abs(sales.sales_check_open_time - labor.labor_clock_in) <= TOL) score += 15;
  if (sameDaypart) score += 20;
  if (onlyLaborShiftToday) score += 10;
  return score;
}

export interface MatchDecision {
  pick: LaborCandidate | null;
  best_score: number;
  second_score: number;
  status: "matched" | "time_ambiguous" | "unmatched";
  evidence: Array<{ staging_id: string; score: number }>;
}

export function chooseMatch(
  sales: SalesCandidate,
  candidates: Array<{ labor: LaborCandidate; sameDaypart?: boolean; only?: boolean }>,
): MatchDecision {
  if (candidates.length === 0)
    return { pick: null, best_score: 0, second_score: 0, status: "unmatched", evidence: [] };
  const scored = candidates
    .map((c) => ({ labor: c.labor, score: scorePair(sales, c.labor, c.sameDaypart, c.only) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1]?.score ?? 0;
  const evidence = scored.map((s) => ({ staging_id: s.labor.staging_id, score: s.score }));
  if (best.score < MATCH.minScore || (scored.length > 1 && best.score - second < MATCH.minGapVsSecond))
    return { pick: null, best_score: best.score, second_score: second, status: "time_ambiguous", evidence };
  return { pick: best.labor, best_score: best.score, second_score: second, status: "matched", evidence };
}
