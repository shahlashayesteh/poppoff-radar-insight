// Shift Match Planner — engine tests.
import { describe, it, expect } from "vitest";
import {
  buildShiftMatchPlan,
  normaliseReplacementLift,
  type HistoricalShift,
} from "@/lib/scheduling/shift-match-planner";

function shift(over: Partial<HistoricalShift>): HistoricalShift {
  return {
    shiftDate: "2024-01-01",
    dayOfWeek: 1,
    daypart: "Dinner",
    serverId: "s1",
    serverName: "Alex",
    grossSales: 1000,
    netSales: 900,
    laborCost: 200,
    realHours: 8,
    coversServed: 40,
    opportunityFactor: 1.0,
    salesBasis: "net",
    laborBasis: "fully_loaded",
    reliabilityClass: "measured",
    identityMethod: "exact_employee_id",
    identityConfidence: 1,
    outletVerified: true,
    sectionContextOnly: false,
    crossOutletEligible: false,
    ...over,
  };
}

describe("normaliseReplacementLift", () => {
  it("returns null for null/NaN", () => {
    expect(normaliseReplacementLift(null)).toBeNull();
    expect(normaliseReplacementLift(NaN)).toBeNull();
  });
  it("clamps to [0, 100] and centers at 50", () => {
    expect(normaliseReplacementLift(0)).toBe(50);
    expect(normaliseReplacementLift(-200)).toBe(0);
    expect(normaliseReplacementLift(200)).toBe(100);
    expect(normaliseReplacementLift(20)).toBe(70);
  });
});

describe("buildShiftMatchPlan", () => {
  it("returns insufficient-data state when history is too thin", () => {
    const plan = buildShiftMatchPlan({
      shifts: [shift({})],
      dayparts: ["Dinner"],
    });
    expect(plan.dataReadiness.sufficient).toBe(false);
    expect(plan.assignments.length).toBe(0);
  });

  it("produces assignments with normalised replacement lift scores in [0,100]", () => {
    const rows: HistoricalShift[] = [];
    const servers = [
      { id: "s1", name: "Alex", sales: 1200 },
      { id: "s2", name: "Bea", sales: 900 },
      { id: "s3", name: "Cam", sales: 700 },
    ];
    // 5 weeks of history, Mon/Tue/Wed Dinner, each server works each day.
    for (let w = 0; w < 5; w++) {
      for (let d = 1; d <= 3; d++) {
        for (const s of servers) {
          rows.push(
            shift({
              shiftDate: `2024-01-${String(w * 7 + d + 1).padStart(2, "0")}`,
              dayOfWeek: d,
              daypart: "Dinner",
              serverId: s.id,
              serverName: s.name,
              grossSales: s.sales,
              netSales: s.sales * 0.9,
              coversServed: Math.round(s.sales / 30),
            }),
          );
        }
      }
    }
    const plan = buildShiftMatchPlan({ shifts: rows, dayparts: ["Dinner"] });
    expect(plan.dataReadiness.sufficient).toBe(true);
    expect(plan.assignments.length).toBeGreaterThan(0);
    for (const a of plan.assignments) {
      if (a.replacementLiftScore != null) {
        expect(a.replacementLiftScore).toBeGreaterThanOrEqual(0);
        expect(a.replacementLiftScore).toBeLessThanOrEqual(100);
      }
      // Each filled slot should have up to 2 backups, each with own fit/confidence/reason.
      for (const b of a.backups) {
        expect(typeof b.reason).toBe("string");
        expect(b.fitScore).toBeGreaterThanOrEqual(0);
        expect(["high", "medium", "low"]).toContain(b.confidenceLevel);
      }
    }
  });

  it("preserves inferred weekly shift quotas (no single server gets every slot)", () => {
    const rows: HistoricalShift[] = [];
    // s1 (the best server) only works 2 days/week historically -> quota 2.
    // s2 and s3 work all 5 days -> quotas 5.
    for (let w = 0; w < 6; w++) {
      for (let d = 1; d <= 5; d++) {
        const here: Array<{ id: string; sales: number }> = [];
        if (d <= 2) here.push({ id: "s1", sales: 2000 });
        here.push({ id: "s2", sales: 900 });
        here.push({ id: "s3", sales: 900 });
        for (const s of here) {
          rows.push(
            shift({
              shiftDate: `2024-02-${String(w * 7 + d + 1).padStart(2, "0")}`,
              dayOfWeek: d,
              daypart: "Dinner",
              serverId: s.id,
              serverName: s.id.toUpperCase(),
              grossSales: s.sales,
              netSales: s.sales * 0.9,
            }),
          );
        }
      }
    }
    const plan = buildShiftMatchPlan({ shifts: rows, dayparts: ["Dinner"] });
    const used = new Map<string, number>();
    for (const a of plan.assignments) {
      if (!a.recommendedServerId) continue;
      used.set(a.recommendedServerId, (used.get(a.recommendedServerId) ?? 0) + 1);
    }
    // s1 (the best server) cannot monopolise every slot — quotas cap it.
    const s1 = used.get("s1") ?? 0;
    const total = Array.from(used.values()).reduce((a, b) => a + b, 0);
    expect(s1).toBeLessThan(total);
  });
});
