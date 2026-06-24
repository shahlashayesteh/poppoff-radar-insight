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

export function attachGap(
  servers: ServerMetric[],
  team: TeamBenchmark,
  opts: { recoverabilityFactor?: number } = {},
): ServerWithGap[] {
  const recoverability = opts.recoverabilityFactor ?? DEFAULT_RECOVERABILITY_FACTOR;
  return servers
    .map((s) => {
      const gapAbsRPH = s.adjustedRPH - team.adjustedRPH;
      const gapPct = enginePerformanceGap(s.adjustedRPH, team.adjustedRPH).value ?? 0;
      const band = engineRagBand(gapPct);
      const rankBand: RankBand =
        band === "strong" ? "strong"
        : band === "outperforming" ? "outperforming"
        : band === "tracking" ? "tracking"
        : band === "monitor" ? "watch"
        : band === "priority" ? "priority"
        : "tracking";
      const rank: ServerWithGap["rank"] =
        rankBand === "strong" || rankBand === "outperforming" ? "above"
        : rankBand === "tracking" ? "tracking"
        : "below";
      // FIX F1 — match canonical manager engine: only a conservative share of
      // the modelled gap is realistically recoverable.
      const recoverableWeekly = Math.max(0, -gapAbsRPH) * s.totalAdjustedHours * recoverability;
      return { ...s, gapAbsRPH, gapPct, rank, rankBand, recoverableWeekly };
    })
    .sort((a, b) => b.adjustedRPH - a.adjustedRPH);
}


export function computeRecoverable(
  servers: ServerWithGap[],
  opts: { tradingWeeks?: number } = {},
): {
  weekly: number;
  monthly: number;
  annual: number;
} {
  const tradingWeeks = clampTradingWeeks(opts.tradingWeeks ?? 52);
  const weekly = servers.reduce((a, b) => a + b.recoverableWeekly, 0);
  const annual = weekly * tradingWeeks;
  return {
    weekly,
    annual,
    monthly: annual / 12,
  };
}

export const TRADING_WEEKS_MIN = 44;
export const TRADING_WEEKS_MAX = 52;
export function clampTradingWeeks(n: number): number {
  if (!isFinite(n)) return 52;
  return Math.min(TRADING_WEEKS_MAX, Math.max(TRADING_WEEKS_MIN, Math.round(n)));
}

export type Period = "weekly" | "monthly" | "custom";

export function projectPeriod(
  weeklyRecoverable: number,
  period: Period,
  dataWeeks = 1,
  tradingWeeks = 52,
): { label: string; value: number } {
  const tw = clampTradingWeeks(tradingWeeks);
  switch (period) {
    case "weekly":
      return { label: "per week", value: weeklyRecoverable };
    case "monthly":
      return { label: "per month", value: (weeklyRecoverable * tw) / 12 };
    case "custom":
      return { label: `over ${dataWeeks.toFixed(1)} weeks observed`, value: weeklyRecoverable * dataWeeks };
  }
}
