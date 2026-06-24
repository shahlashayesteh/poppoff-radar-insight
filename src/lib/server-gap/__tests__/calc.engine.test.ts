/**
 * Regression tests for /calculator/server-gap:
 *   - gap math + RAG/rank thresholds route through canonical engine
 *   - recoverability factor defaults to 0.5 (matches manager LLS engine)
 *   - annualisation honours trading-weeks control (no hard ×52)
 *   - monthly = annual / 12
 *   - 5-band rank surface (strong / outperforming / tracking / watch / priority)
 */
import { describe, it, expect } from "vitest";
import {
  attachGap,
  computeRecoverable,
  projectPeriod,
  DEFAULT_RECOVERABILITY_FACTOR,
  clampTradingWeeks,
  type ServerMetric,
  type TeamBenchmark,
} from "@/lib/server-gap/calc";
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

const team: TeamBenchmark = {
  totalSales: 10000,
  totalHours: 100,
  totalAdjustedHours: 100,
  adjustedRPH: 100,
  rawRPH: 100,
};

describe("server-gap attachGap ⇄ canonical engine", () => {
  it("gapPct equals engine performanceGap()", () => {
    const out = attachGap([mk({ adjustedRPH: 120 }), mk({ key: "s2", adjustedRPH: 80 })], team);
    expect(out[0].gapPct).toBe(performanceGap(120, 100).value);
    expect(out[1].gapPct).toBe(performanceGap(80, 100).value);
  });

  it("rankBand surfaces all 5 canonical bands", () => {
    const out = attachGap(
      [
        mk({ key: "strong",   adjustedRPH: 120 }),  // +20% → strong
        mk({ key: "outperf",  adjustedRPH: 107 }),  // +7%  → outperforming
        mk({ key: "ontrack",  adjustedRPH: 100 }),  // 0%   → tracking
        mk({ key: "watch",    adjustedRPH: 92 }),   // -8%  → watch
        mk({ key: "priority", adjustedRPH: 80 }),   // -20% → priority
      ],
      team,
    );
    const byKey = Object.fromEntries(out.map((s) => [s.key, s]));
    expect(byKey.strong.rankBand).toBe("strong");
    expect(byKey.outperf.rankBand).toBe("outperforming");
    expect(byKey.ontrack.rankBand).toBe("tracking");
    expect(byKey.watch.rankBand).toBe("watch");
    expect(byKey.priority.rankBand).toBe("priority");
    // Engine cross-check
    expect(ragBand(byKey.outperf.gapPct)).toBe("outperforming");
  });
});

describe("F1 — recoverability factor defaults to 0.5", () => {
  it("default factor is the canonical 0.5", () => {
    expect(DEFAULT_RECOVERABILITY_FACTOR).toBe(0.5);
  });

  it("weekly recoverable is half of the legacy 1.0 model (CFO-conservative)", () => {
    // Team avg 100; one below server with 40 adj hours at adj RPH 80 → gap -20/hr.
    // Legacy ×1.0 would yield 800. Canonical ×0.5 yields 400.
    const out = attachGap([mk({ adjustedRPH: 80 })], team);
    const rec = computeRecoverable(out);
    expect(rec.weekly).toBe(400);
  });

  it("explicit factor override flows end-to-end", () => {
    const out = attachGap([mk({ adjustedRPH: 80 })], team, { recoverabilityFactor: 1 });
    const rec = computeRecoverable(out);
    expect(rec.weekly).toBe(800);
  });
});

describe("F6 — trading weeks (no hard ×52)", () => {
  it("annual = weekly × tradingWeeks, monthly = annual / 12", () => {
    const out = attachGap([mk({ adjustedRPH: 80 })], team); // 400/week
    const rec48 = computeRecoverable(out, { tradingWeeks: 48 });
    expect(rec48.weekly).toBe(400);
    expect(rec48.annual).toBe(400 * 48);
    expect(rec48.monthly).toBeCloseTo((400 * 48) / 12, 8);

    const rec52 = computeRecoverable(out, { tradingWeeks: 52 });
    expect(rec52.annual).toBe(400 * 52);
    expect(rec52.monthly).toBeCloseTo((400 * 52) / 12, 8);
  });

  it("clamps trading weeks to 44–52", () => {
    expect(clampTradingWeeks(10)).toBe(44);
    expect(clampTradingWeeks(60)).toBe(52);
    expect(clampTradingWeeks(50)).toBe(50);
  });

  it("projectPeriod monthly honours tradingWeeks", () => {
    const p = projectPeriod(400, "monthly", 1, 48);
    expect(p.value).toBeCloseTo((400 * 48) / 12, 8);
  });
});

describe("F3 — RAG bands (canonical 5-band)", () => {
  it("ragBand thresholds", () => {
    expect(ragBand(0.11)).toBe("strong");
    expect(ragBand(0.10)).toBe("outperforming");
    expect(ragBand(0.06)).toBe("outperforming");
    expect(ragBand(0.05)).toBe("tracking");
    expect(ragBand(-0.05)).toBe("tracking");
    expect(ragBand(-0.06)).toBe("monitor");
    expect(ragBand(-0.10)).toBe("monitor");
    expect(ragBand(-0.11)).toBe("priority");
  });
});
