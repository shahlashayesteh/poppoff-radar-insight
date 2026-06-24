/**
 * Canonical engine-derived RAG verdict for a server's performance summary.
 *
 * Manager surfaces (manager.team, manager.server.$id) used to show a 0–100
 * "overall score" pill driven by legacy weights. That verdict could disagree
 * with the canonical LLS-style gap on /manager/lls for the same server.
 *
 * This helper aggregates a server's category rows into a single performance
 * gap = (Σ sales − Σ expectedSales) / Σ expectedSales, then maps it to the
 * canonical RAG bands defined in `./gap.ts`:
 *   strong    >  +10%
 *   tracking  ±5%
 *   monitor   −5%  .. −10%
 *   priority  < −10%
 *
 * Uses ONLY category rows that have a finite, positive `expectedSales`, so
 * categories with no benchmark do not silently pull the verdict to zero.
 */
import type { ServerPerformance } from "@/lib/performance-engine";
import { ragBand, ragLabel } from "./gap";
import type { RagBand } from "./types";

export interface EngineRagVerdict {
  band: RagBand;
  label: string;
  gapPct: number | null; // ratio, e.g. 0.07 = +7%
  tone: string;          // CSS colour token
  evaluatedCategories: number;
}

function toneForBand(b: RagBand): string {
  switch (b) {
    case "strong":   return "var(--brand-green)";
    case "tracking": return "var(--brand-green)";
    case "monitor":  return "var(--brand-orange)";
    case "priority": return "var(--opportunity)";
    default:         return "var(--muted-foreground)";
  }
}

export function engineRagFromPerf(
  perf: ServerPerformance | null | undefined,
): EngineRagVerdict {
  const rows = perf?.rows ?? [];
  let sumSales = 0;
  let sumExpected = 0;
  let n = 0;
  for (const r of rows) {
    const exp = r.expectedSales;
    if (typeof exp !== "number" || !isFinite(exp) || exp <= 0) continue;
    sumSales += Number(r.sales) || 0;
    sumExpected += exp;
    n += 1;
  }
  const gap = sumExpected > 0 ? sumSales / sumExpected - 1 : null;
  const band = ragBand(gap);
  return {
    band,
    label: ragLabel[band],
    gapPct: gap,
    tone: toneForBand(band),
    evaluatedCategories: n,
  };
}
