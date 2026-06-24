import { describe, it, expect } from "vitest";
import { engineRagFromPerf } from "../server-rag";

function mkRow(sales: number, expected: number | null) {
  return {
    key: "k", label: "L", sales, prevSales: 0, fourWeekAvgSales: 0,
    deltaWoW: null, deltaVs4wk: null, current: 0, target: 0, gap: 0,
    expectedSales: expected, score: 0, statusLabel: "Tracking",
    quantity: 0, quantitySource: "real" as const,
    opportunityCount: 0, venueBaselineConversion: null,
    avgUnitPrice: null, revenueInfluence: 0, eliteTier: 0,
  } as any;
}

describe("engineRagFromPerf — canonical RAG bands", () => {
  it("returns insufficient_data when no expected sales", () => {
    const v = engineRagFromPerf({ rows: [mkRow(100, null)] } as any);
    expect(v.band).toBe("insufficient_data");
    expect(v.gapPct).toBeNull();
  });
  it("strong when > +10%", () => {
    const v = engineRagFromPerf({ rows: [mkRow(120, 100)] } as any);
    expect(v.band).toBe("strong");
  });
  it("tracking within ±5%", () => {
    expect(engineRagFromPerf({ rows: [mkRow(103, 100)] } as any).band).toBe("tracking");
    expect(engineRagFromPerf({ rows: [mkRow(96, 100)] } as any).band).toBe("tracking");
  });
  it("monitor between -5% and -10%", () => {
    expect(engineRagFromPerf({ rows: [mkRow(92, 100)] } as any).band).toBe("monitor");
  });
  it("priority below -10%", () => {
    expect(engineRagFromPerf({ rows: [mkRow(85, 100)] } as any).band).toBe("priority");
  });
  it("aggregates weighted across rows (Σ/Σ, not avg of avgs)", () => {
    // Row A: 200/100 = +100%, Row B: 50/200 = -75% → Σ250 / Σ300 = -16.7% (priority)
    const v = engineRagFromPerf({ rows: [mkRow(200, 100), mkRow(50, 200)] } as any);
    expect(v.band).toBe("priority");
    expect(v.gapPct!).toBeCloseTo(250 / 300 - 1, 4);
  });
});
