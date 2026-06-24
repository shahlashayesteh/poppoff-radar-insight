/**
 * Regression test: proves /calculator/server-gap gap math + RAG/rank
 * thresholds route through the canonical metrics engine.
 */
import { describe, it, expect } from "vitest";
import { attachGap, type ServerMetric, type TeamBenchmark } from "@/lib/server-gap/calc";
import { performanceGap, ragBand } from "@/lib/metrics/gap";

const mk = (over: Partial<ServerMetric>): ServerMetric => ({
  key: "s",
  display: "Server",
  shifts: 5,
  totalSales: 5000,
  totalHours: 40,
  totalAdjustedHours: 40,
  rawRPH: 125,
  adjustedRPH: 125,
  avgFactor: 1,
  labourCost: null,
  ...over,
});

describe("server-gap attachGap ⇄ canonical engine", () => {
  it("gapPct equals engine performanceGap()", () => {
    const team: TeamBenchmark = {
      totalSales: 10000, totalHours: 100, totalAdjustedHours: 100, adjustedRPH: 100, rawRPH: 100,
    };
    const out = attachGap([mk({ adjustedRPH: 120 }), mk({ key: "s2", adjustedRPH: 80 })], team);
    expect(out[0].gapPct).toBe(performanceGap(120, 100).value);
    expect(out[1].gapPct).toBe(performanceGap(80, 100).value);
  });

  it("rank labels are the 3-band projection of canonical ragBand()", () => {
    const team: TeamBenchmark = {
      totalSales: 10000, totalHours: 100, totalAdjustedHours: 100, adjustedRPH: 100, rawRPH: 100,
    };
    // +25% → strong → above
    // +0%  → tracking
    // −20% → priority → below
    const out = attachGap(
      [
        mk({ key: "hi", adjustedRPH: 125 }),
        mk({ key: "mid", adjustedRPH: 100 }),
        mk({ key: "lo", adjustedRPH: 80 }),
      ],
      team,
    );
    const byKey = Object.fromEntries(out.map((s) => [s.key, s]));
    expect(ragBand(byKey.hi.gapPct)).toBe("strong");
    expect(byKey.hi.rank).toBe("above");
    expect(byKey.mid.rank).toBe("tracking");
    expect(byKey.lo.rank).toBe("below");
  });
});
