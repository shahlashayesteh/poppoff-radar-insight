import type { MetricResult } from "./types";
import { nullMetric } from "./types";

/** Trend % = current / previous − 1 */
export function trendPct(
  current: number | null | undefined,
  previous: number | null | undefined,
): MetricResult<number | null> {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !isFinite(current) ||
    !isFinite(previous) ||
    previous === 0
  ) {
    return nullMetric("current / previous − 1");
  }
  return {
    value: current / previous - 1,
    provenance: "derived",
    formula: "current / previous − 1",
    sourceFields: ["current", "previous"],
  };
}
