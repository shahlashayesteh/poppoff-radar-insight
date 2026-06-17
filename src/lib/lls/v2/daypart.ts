// Daypart computation: dominant + distribution + cross-daypart detection.
// Operates on configured venue daypart windows. Minute-level resolution.
import { MATCH } from "./config";

export interface DaypartWindow { daypart: string; start_minute: number; end_minute: number; }

export interface DaypartDistribution {
  distribution: Record<string, { minutes: number; pct: number }>;
  dominant: string;
  cross_daypart: boolean;
}

export function computeDaypartDistribution(
  startMinute: number,
  endMinute: number,
  windows: DaypartWindow[],
): DaypartDistribution {
  if (endMinute <= startMinute) endMinute += 24 * 60;
  const totals: Record<string, number> = {};
  let total = 0;
  for (let m = startMinute; m < endMinute; m++) {
    const minOfDay = m % (24 * 60);
    for (const w of windows) {
      if (minOfDay >= w.start_minute && minOfDay < w.end_minute) {
        totals[w.daypart] = (totals[w.daypart] ?? 0) + 1;
        total++;
        break;
      }
    }
  }
  if (total === 0) {
    return { distribution: {}, dominant: "unknown", cross_daypart: false };
  }
  let dominant = "";
  let max = -1;
  const distribution: DaypartDistribution["distribution"] = {};
  for (const [k, v] of Object.entries(totals)) {
    distribution[k] = { minutes: v, pct: v / total };
    if (v > max) { max = v; dominant = k; }
  }
  const cross = (1 - distribution[dominant].pct) >= MATCH.crossDaypartThreshold;
  return { distribution, dominant, cross_daypart: cross };
}
