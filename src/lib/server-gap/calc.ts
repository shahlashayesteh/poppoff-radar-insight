// Pure calculation functions. Weighted totals throughout — never avg of avgs.
//
// MIGRATION: gap math + RAG/rank thresholds delegate to the canonical
// metrics engine in `src/lib/metrics/`. The calculator's productivity
// metric is RPH (revenue per hour) and OF is applied to hours rather than
// to labor_cost (calculator does not always have labor_cost). The Σ/Σ
// weighting and the engine's performance-gap + RAG bands are reused.

import type { MatchedShift } from "./merge";
import { resolveFactorFromTimes, type Band, type FactorResult } from "./opportunity";
import { performanceGap as enginePerformanceGap, ragBand as engineRagBand } from "@/lib/metrics/gap";


export type ShiftMetric = MatchedShift & {
  factor: number;
  band: Band;
  factorDefaulted: boolean;
  factorEstimated: boolean;
  adjustedHours: number;
  adjustedRPH: number;
  factorOverridden?: boolean;
};

export type ServerMetric = {
  key: string;
  display: string;
  shifts: number;
  totalSales: number;
  totalHours: number;
  totalAdjustedHours: number;
  rawRPH: number;
  adjustedRPH: number;
  avgFactor: number;
  labourCost: number | null;
};

export type TeamBenchmark = {
  totalSales: number;
  totalAdjustedHours: number;
  totalHours: number;
  adjustedRPH: number;
  rawRPH: number;
};

export type RankBand = "strong" | "outperforming" | "tracking" | "watch" | "priority";

export type ServerWithGap = ServerMetric & {
  gapAbsRPH: number;
  gapPct: number;
  /** Coarse 3-band UI projection (above/tracking/below) — preserved for legacy cells. */
  rank: "above" | "tracking" | "below";
  /** Canonical 5-band status (engine-derived). */
  rankBand: RankBand;
  recoverableWeekly: number;
};

/** Conservative recoverability factor — matches the canonical manager LLS engine. */
export const DEFAULT_RECOVERABILITY_FACTOR = 0.5;

export function computeShiftMetrics(
  shifts: MatchedShift[],
  overrides: Record<number, number | undefined> = {},
): ShiftMetric[] {
  return shifts.map((s, idx) => {
    const ovr = overrides[idx];
    let f: FactorResult;
    if (typeof ovr === "number" && isFinite(ovr) && ovr > 0) {
      f = { factor: ovr, band: "Normal", defaulted: false, estimated: false };
    } else {
      f = resolveFactorFromTimes(s.date, minToTime(s.startMin), s.endMin == null ? null : minToTime(s.endMin));
    }
    const adjustedHours = s.hours * f.factor;
    const adjustedRPH = adjustedHours > 0 ? s.sales / adjustedHours : 0;
    return {
      ...s,
      factor: f.factor,
      band: f.band,
      factorDefaulted: f.defaulted,
      factorEstimated: f.estimated,
      adjustedHours,
      adjustedRPH,
      factorOverridden: typeof ovr === "number",
    };
  });
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeServerMetrics(shifts: ShiftMetric[]): ServerMetric[] {
  const byKey = new Map<string, ShiftMetric[]>();
  for (const s of shifts) {
    const arr = byKey.get(s.key);
    if (arr) arr.push(s);
    else byKey.set(s.key, [s]);
  }
  const out: ServerMetric[] = [];
  for (const [key, arr] of byKey) {
    const totalSales = arr.reduce((a, b) => a + b.sales, 0);
    const totalHours = arr.reduce((a, b) => a + b.hours, 0);
    const totalAdj = arr.reduce((a, b) => a + b.adjustedHours, 0);
    const labourCosts = arr.map((s) => s.labourCost).filter((v): v is number => v != null);
    const labourCost = labourCosts.length === arr.length
      ? labourCosts.reduce((a, b) => a + b, 0)
      : null;
    // factor weighted by hours
    const weightedFactorNum = arr.reduce((a, b) => a + b.factor * b.hours, 0);
    out.push({
      key,
      display: arr[0].display,
      shifts: arr.length,
      totalSales,
      totalHours,
      totalAdjustedHours: totalAdj,
      rawRPH: totalHours > 0 ? totalSales / totalHours : 0,
      adjustedRPH: totalAdj > 0 ? totalSales / totalAdj : 0,
      avgFactor: totalHours > 0 ? weightedFactorNum / totalHours : 1,
      labourCost,
    });
  }
  return out;
}

export function computeTeamBenchmark(shifts: ShiftMetric[]): TeamBenchmark {
  const totalSales = shifts.reduce((a, b) => a + b.sales, 0);
  const totalAdj = shifts.reduce((a, b) => a + b.adjustedHours, 0);
  const totalHours = shifts.reduce((a, b) => a + b.hours, 0);
  return {
    totalSales,
    totalHours,
    totalAdjustedHours: totalAdj,
    adjustedRPH: totalAdj > 0 ? totalSales / totalAdj : 0,
    rawRPH: totalHours > 0 ? totalSales / totalHours : 0,
  };
}

export function attachGap(servers: ServerMetric[], team: TeamBenchmark): ServerWithGap[] {
  return servers
    .map((s) => {
      const gapAbsRPH = s.adjustedRPH - team.adjustedRPH;
      // Canonical performance gap + RAG bands from the metrics engine.
      const gapPct = enginePerformanceGap(s.adjustedRPH, team.adjustedRPH).value ?? 0;
      // Calculator UI uses a 3-band rank label; project the canonical
      // 4-band engine output: strong→above, tracking→tracking,
      // monitor|priority→below. ±5% threshold preserved.
      const band = engineRagBand(gapPct);
      const rank: ServerWithGap["rank"] =
        band === "strong" ? "above"
        : band === "tracking" ? "tracking"
        : "below";
      const recoverableWeekly = Math.max(0, -gapAbsRPH) * s.totalAdjustedHours;
      return { ...s, gapAbsRPH, gapPct, rank, recoverableWeekly };
    })
    // RANK ONLY BY OPPORTUNITY-ADJUSTED RPH
    .sort((a, b) => b.adjustedRPH - a.adjustedRPH);
}


export function computeRecoverable(servers: ServerWithGap[]): {
  weekly: number;
  monthly: number;
  annual: number;
} {
  const weekly = servers.reduce((a, b) => a + b.recoverableWeekly, 0);
  return {
    weekly,
    monthly: weekly * (52 / 12),
    annual: weekly * 52,
  };
}

export type Period = "weekly" | "monthly" | "custom";

export function projectPeriod(
  weeklyRecoverable: number,
  period: Period,
  dataWeeks = 1,
): { label: string; value: number } {
  switch (period) {
    case "weekly":
      return { label: "per week", value: weeklyRecoverable };
    case "monthly":
      return { label: "per month", value: weeklyRecoverable * (52 / 12) };
    case "custom":
      return { label: `over ${dataWeeks.toFixed(1)} weeks observed`, value: weeklyRecoverable * dataWeeks };
  }
}
