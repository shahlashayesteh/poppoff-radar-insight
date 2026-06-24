import type { MetricResult, RagBand } from "./types";
import { nullMetric } from "./types";

/**
 * Performance Gap = (server_score / benchmark) − 1
 * Returned as a ratio (e.g. 0.07 = +7%).
 */
export function performanceGap(
  serverScore: number | null | undefined,
  benchmark: number | null | undefined,
): MetricResult<number | null> {
  if (
    typeof serverScore !== "number" ||
    !isFinite(serverScore) ||
    typeof benchmark !== "number" ||
    !isFinite(benchmark) ||
    benchmark <= 0
  ) {
    return nullMetric("(server_score / benchmark) − 1");
  }
  return {
    value: serverScore / benchmark - 1,
    provenance: "derived",
    formula: "(server_score / benchmark) − 1",
    sourceFields: ["server_score", "benchmark"],
  };
}

/**
 * Canonical RAG bands. Use everywhere.
 *   strong         >  +10%
 *   outperforming  +5% .. +10%
 *   tracking       ±5%
 *   monitor        −5%  .. −10%   (a.k.a. "watch")
 *   priority       < −10%
 */
export function ragBand(gap: number | null | undefined): RagBand {
  if (typeof gap !== "number" || !isFinite(gap)) return "insufficient_data";
  if (gap > 0.1) return "strong";
  if (gap > 0.05) return "outperforming";
  if (gap >= -0.05) return "tracking";
  if (gap >= -0.1) return "monitor";
  return "priority";
}

export const ragLabel: Record<RagBand, string> = {
  strong: "Strong performer",
  outperforming: "Outperforming",
  tracking: "On track",
  monitor: "Watch",
  priority: "Priority review",
  insufficient_data: "Insufficient data",
};
