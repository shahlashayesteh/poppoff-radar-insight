// LLS v2 — model configuration and versioning.
// All numeric thresholds for OF, smoothing, clamps, confidence, and RAG.
// Change these only via a new model_version / of_version string.

export const MODEL_VERSION = "lls-v2.0.0";
export const OF_VERSION = "of-v2.0.0";

export const OF = {
  componentWeights: { coi: 0.4, rei: 0.35, ldi: 0.25 },
  clampMin: 0.75,
  clampMax: 1.4,
  smoothing: [
    { min: 0, weight: 0 },
    { min: 5, weight: 0.25 },
    { min: 10, weight: 0.5 },
    { min: 20, weight: 0.75 },
    { min: 40, weight: 1.0 },
  ] as const,
  defaultBaselineWeeks: 8,
  allowedBaselineWeeks: [4, 8, 12] as const,
  insufficientThreshold: 5, // < 5 → System OF = 1.00, Insufficient
};

export const DURATION_TIER = {
  short: { lt: 4 },
  standard: { lt: 7 },
  // long otherwise
};

export const MATCH = {
  toleranceSeconds: 15 * 60,
  minScore: 60,
  minGapVsSecond: 20,
  crossDaypartThreshold: 0.15,
};

export const BENCHMARK_CONFIDENCE = {
  high: {
    minComparablePeriods: 40,
    minWeeks: 6,
    minLaborHours: 160,
    minCovers: 800,
    minAttribOk: 0.9,
    maxLaborSpanFallback: 0.1,
    maxUnresolvedOutliers: 0.05,
  },
  medium: {
    minComparablePeriods: 20,
    minWeeks: 4,
    minLaborHours: 80,
    minCovers: 400,
    minAttribOk: 0.75,
    maxLaborSpanFallback: 0.25,
    maxUnresolvedOutliers: 0.1,
  },
  low: {
    minComparablePeriods: 5,
    minWeeks: 2,
    minLaborHours: 20,
    minCovers: 100,
  },
};

export const RESULT_CONFIDENCE = {
  high: { minShifts: 12, minHours: 40, minCovers: 200, minCompleteness: 0.95, maxCrossDaypart: 0.1 },
  medium: { minShifts: 6, minHours: 20, minCovers: 100, minCompleteness: 0.85, maxCrossDaypart: 0.25 },
  low: { minShifts: 3, minHours: 8 },
};

export const RAG = { greenGap: 0.1, redGap: -0.1 };

export const ATTRIBUTION = {
  reconciledMax: 0.03,
  warningMax: 0.07,
  heldMax: 0.15,
};

export type ConfidenceBand = "insufficient" | "low" | "medium" | "high";
export type RagStatus = "green" | "amber" | "red" | "directional";

export type ConfigSnapshot = {
  model_version: string;
  of_version: string;
  baseline_weeks: number;
  of: typeof OF;
  match: typeof MATCH;
  benchmark_confidence: typeof BENCHMARK_CONFIDENCE;
  result_confidence: typeof RESULT_CONFIDENCE;
  rag: typeof RAG;
  attribution: typeof ATTRIBUTION;
};

export function buildConfigSnapshot(baselineWeeks: number): ConfigSnapshot {
  return {
    model_version: MODEL_VERSION,
    of_version: OF_VERSION,
    baseline_weeks: baselineWeeks,
    of: OF,
    match: MATCH,
    benchmark_confidence: BENCHMARK_CONFIDENCE,
    result_confidence: RESULT_CONFIDENCE,
    rag: RAG,
    attribution: ATTRIBUTION,
  };
}

/** Stable, dependency-free hash for configuration snapshot. */
export function hashConfig(snapshot: ConfigSnapshot, extras: Record<string, unknown> = {}): string {
  const payload = JSON.stringify({ s: snapshot, e: extras }, Object.keys({ ...snapshot, ...extras }).sort());
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, "0");
}
