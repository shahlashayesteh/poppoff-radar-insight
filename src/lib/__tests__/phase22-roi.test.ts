// Phase 22 — Enterprise ROI tests.
//
// Covers:
//   - ROI calculation engine math (pure functions)
//   - Confidence rules respond to data quality signals
//   - Server function structure: entitlement + venue access + read-only
//   - Server routes do not import ROI internals
//   - Adjusted LLS uses applied v1 (no OF v2 switch)
//   - Export summary contains "modelled" language, not "guaranteed"
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildRoiReport,
  buildExportSummary,
  computePeriodMetrics,
  computeMovement,
  computeRoi,
  defaultAssumptions,
  evaluateConfidence,
  summariseDataQuality,
  type RoiShiftRow,
} from "@/lib/roi/calculations";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function mkRow(over: Partial<RoiShiftRow> = {}): RoiShiftRow {
  return {
    shift_date: "2025-01-01",
    gross_sales: 1000,
    labor_cost: 100,
    opportunity_factor: 1,
    covers_served: 50,
    sales_basis: "net",
    labor_basis: "wages_only",
    reliability_class: "measured",
    identity_match_method: "id",
    identity_match_confidence: 1,
    real_hours: 10,
    ...over,
  };
}

describe("Phase 22 — ROI calculation engine", () => {
  it("computes RPC, RPH, base LLS and adjusted LLS correctly", () => {
    const m = computePeriodMetrics([
      mkRow({ gross_sales: 2000, covers_served: 100, labor_cost: 200, real_hours: 20, opportunity_factor: 1 }),
    ]);
    expect(m.totalSales).toBe(2000);
    expect(m.totalCovers).toBe(100);
    expect(m.rpc).toBe(20);
    expect(m.rph).toBe(100);
    expect(m.baseLls).toBe(10);
    expect(m.adjustedLls).toBe(10);
  });

  it("RPC movement and Base LLS movement compute correctly", () => {
    const baseline = computePeriodMetrics([mkRow({ gross_sales: 1000, covers_served: 50, labor_cost: 100 })]);
    const current = computePeriodMetrics([mkRow({ gross_sales: 800, covers_served: 50, labor_cost: 100 })]);
    const mv = computeMovement(baseline, current);
    expect(mv.rpcPct).toBeCloseTo(-20, 1);
    expect(mv.baseLlsDelta).toBeCloseTo(-2, 2);
  });

  it("RPH movement is null when hours are missing in one period", () => {
    const baseline = computePeriodMetrics([mkRow({ real_hours: 10 })]);
    const current = computePeriodMetrics([mkRow({ real_hours: null })]);
    expect(computeMovement(baseline, current).rphPct).toBeNull();
  });

  it("Adjusted LLS movement uses applied v1 OF — not OF v2", () => {
    const baseline = computePeriodMetrics([mkRow({ opportunity_factor: 1 })]);
    const current = computePeriodMetrics([mkRow({ opportunity_factor: 0.8 })]);
    // applied v1 OF=0.8 → adjusted = base / 0.8 = higher than base
    expect(current.adjustedLls!).toBeGreaterThan(current.baseLls!);
  });

  it("Modelled recoverable revenue is zero when current meets baseline", () => {
    const mv = computeMovement(
      computePeriodMetrics([mkRow({ gross_sales: 1000, covers_served: 50 })]),
      computePeriodMetrics([mkRow({ gross_sales: 1100, covers_served: 50 })]),
    );
    const roi = computeRoi(mv, defaultAssumptions({ weeksInPeriod: 4 }));
    expect(roi.modelledRecoverableRevenue).toBe(0);
  });

  it("Modelled recoverable revenue uses recoverabilityFactor × gap × covers", () => {
    const mv = computeMovement(
      computePeriodMetrics([mkRow({ gross_sales: 2000, covers_served: 100 })]), // RPC 20
      computePeriodMetrics([mkRow({ gross_sales: 1500, covers_served: 100 })]), // RPC 15
    );
    const roi = computeRoi(mv, defaultAssumptions({ recoverabilityFactor: 0.3, weeksInPeriod: 4 }));
    // gap=5, covers=100, factor=0.3 → 150
    expect(roi.modelledRecoverableRevenue).toBe(150);
  });
});

describe("Phase 22 — Confidence + data quality", () => {
  it("Gross-used-as-net reduces confidence", () => {
    const hi = evaluateConfidence(
      summariseDataQuality(Array.from({ length: 40 }, () => mkRow({ sales_basis: "net" }))),
      { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any,
    );
    const lo = evaluateConfidence(
      summariseDataQuality(Array.from({ length: 40 }, () => mkRow({ sales_basis: "gross" }))),
      { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any,
    );
    expect(lo.score).toBeLessThan(hi.score);
    expect(lo.reductions.join(" ")).toMatch(/Gross sales used as net/i);
  });

  it("Unknown labour basis reduces confidence", () => {
    const dq = summariseDataQuality(Array.from({ length: 40 }, () => mkRow({ labor_basis: "unknown" })));
    const c = evaluateConfidence(dq, { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any);
    expect(c.reductions.join(" ")).toMatch(/labour basis/i);
  });

  it("Ambiguous identity reduces confidence", () => {
    const dq = summariseDataQuality(
      Array.from({ length: 40 }, () => mkRow({ identity_match_method: "ambiguous", identity_match_confidence: 0.3 })),
    );
    const c = evaluateConfidence(dq, { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any);
    expect(c.reductions.join(" ")).toMatch(/identity/i);
  });

  it("Missing hours reduces confidence", () => {
    const dq = summariseDataQuality(Array.from({ length: 40 }, () => mkRow({ real_hours: null })));
    const c = evaluateConfidence(dq, { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any);
    expect(dq.hoursMissing).toBe(true);
    expect(c.reductions.join(" ")).toMatch(/hours/i);
  });

  it("Contextual class is excluded count, not scored as measured", () => {
    const dq = summariseDataQuality([mkRow({ reliability_class: "contextual" })]);
    expect(dq.contextualInputsExcluded).toBe(1);
    expect(dq.measuredInputs).toBe(0);
  });

  it("Small sample size flags low confidence", () => {
    const dq = summariseDataQuality([mkRow()]);
    const c = evaluateConfidence(dq, { baseline: { rpc: 20 } as any, current: { rpc: 18 } as any } as any);
    expect(c.reductions.join(" ")).toMatch(/sample size/i);
  });
});

describe("Phase 22 — Export summary language", () => {
  it("uses 'modelled' language and never says 'guaranteed'", () => {
    const report = buildRoiReport({
      baselineRows: Array.from({ length: 30 }, () => mkRow({ gross_sales: 2000, covers_served: 100 })),
      currentRows: Array.from({ length: 30 }, () => mkRow({ gross_sales: 1500, covers_served: 100 })),
    });
    const sum = buildExportSummary(report, { venueName: "Acme", periodLabel: "Q1" });
    expect(sum).toMatch(/modelled improvement opportunity/i);
    expect(sum).toMatch(/NOT guaranteed revenue/);
    expect(sum.toLowerCase()).not.toMatch(/guaranteed (uplift|lost) revenue/);
    expect(sum).toMatch(/Confidence:/);
    expect(sum).toMatch(/applied v1/i);
  });

  it("buildRoiReport carries OF v2 metadata as preview-only", () => {
    const r = buildRoiReport({ baselineRows: [mkRow()], currentRows: [mkRow()] });
    expect(r.ofV2.referencedAsPreviewOnly).toBe(true);
    expect(r.ofV2.appliedFactorVersion).toBe("v1");
  });

  it("Payback period reflects implementation + subscription assumptions", () => {
    const r = buildRoiReport({
      baselineRows: Array.from({ length: 30 }, () => mkRow({ gross_sales: 2000, covers_served: 100 })),
      currentRows: Array.from({ length: 30 }, () => mkRow({ gross_sales: 1500, covers_served: 100 })),
      assumptions: { weeksInPeriod: 4, monthlySubscriptionCost: 100, implementationCost: 200 },
    });
    expect(r.roi.paybackMonths).not.toBeNull();
    expect(r.roi.assumptions.monthlySubscriptionCost).toBe(100);
    expect(r.roi.assumptions.implementationCost).toBe(200);
  });
});

describe("Phase 22 — server function safety", () => {
  const src = read("src/lib/roi.functions.ts");

  it("requires paid manager entitlement", () => {
    expect(src).toMatch(/requirePaidManagerEntitlement\(/);
  });

  it("asserts venue access on every handler", () => {
    const handlers = src.match(/\.handler\(async/g) ?? [];
    const calls = src.match(/assertVenueAccess\(/g) ?? [];
    expect(handlers.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeGreaterThanOrEqual(handlers.length);
  });

  it("is read-only — no mutating Supabase calls", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("scopes shifts/shifts_v2 reads by venue_id (venues table is scoped by id)", () => {
    expect(src).toMatch(/\.from\("shifts"\)[\s\S]{0,200}\.eq\("venue_id"/);
    expect(src).toMatch(/\.from\("shifts_v2"\)[\s\S]{0,200}\.eq\("venue_id"/);
  });

  it("uses requireSupabaseAuth middleware", () => {
    expect(src).toMatch(/requireSupabaseAuth/);
  });
});

describe("Phase 22 — server routes do not import ROI internals", () => {
  const files = readdirSync(join(ROOT, "src/routes")).filter(
    (f) => f.startsWith("server.") && f.endsWith(".tsx"),
  );
  for (const f of files) {
    it(`${f} clean of ROI module`, () => {
      const src = read(join("src/routes", f));
      expect(src).not.toMatch(/roi\.functions/);
      expect(src).not.toMatch(/roi\/calculations/);
      expect(src).not.toMatch(/modelledRecoverableRevenue/);
      expect(src).not.toMatch(/paybackMonths/);
      expect(src).not.toMatch(/labor_basis/);
      expect(src).not.toMatch(/Adjusted LLS/);
    });
  }
});

describe("Phase 22 — manager ROI route exists and is paid-gated", () => {
  const src = read("src/routes/manager.roi.tsx");
  it("renders PaidManagerGate", () => {
    expect(src).toMatch(/PaidManagerGate/);
  });
  it("uses active venue hook (multi-site safe)", () => {
    expect(src).toMatch(/useActiveVenue/);
  });
  it("calls verify endpoint at the network boundary", () => {
    expect(src).toMatch(/useVerifyPaidManagerAccess/);
  });
  it("renders modelled language, not 'guaranteed'", () => {
    expect(src).toMatch(/[Mm]odelled/);
    expect(src.toLowerCase()).not.toMatch(/guaranteed lost revenue/);
    expect(src.toLowerCase()).not.toMatch(/guaranteed uplift/);
  });
});
