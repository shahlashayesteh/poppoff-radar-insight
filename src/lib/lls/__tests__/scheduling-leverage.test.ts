// Scheduling Leverage engine tests.
//
// The critical test is "highest SPH on busy Saturday is NOT always the best
// rota test for Saturday when Tuesday has more headroom". This proves the
// engine does not collapse to "best seller to busiest shift".

import { describe, it, expect } from "vitest";
import {
  computeSchedulingLeverage,
  type LeverageShiftRow,
} from "../scheduling-leverage";

function row(p: Partial<LeverageShiftRow> & { server_id: string; day: number; daypart?: string }): LeverageShiftRow {
  return {
    server_id: p.server_id,
    server_name: p.server_name ?? p.server_id,
    shift_date: p.shift_date ?? `2026-06-${String(p.day + 1).padStart(2, "0")}`,
    day_of_week: p.day,
    daypart: p.daypart ?? "dinner",
    outlet: p.outlet ?? null,
    gross_sales: p.gross_sales ?? 1000,
    net_sales: p.net_sales ?? null,
    covers: p.covers ?? 50,
    hours: p.hours ?? 8,
    labor_cost: p.labor_cost ?? 100,
    opportunity_factor: p.opportunity_factor ?? 1.0,
    category_sales: null,
    category_target_rate: null,
  };
}

describe("scheduling leverage engine", () => {
  it("computes baselines and per-server projected metrics", () => {
    const rows: LeverageShiftRow[] = [
      row({ server_id: "A", day: 5, gross_sales: 2000, covers: 80, hours: 8, labor_cost: 120 }),
      row({ server_id: "A", day: 5, gross_sales: 2100, covers: 82, hours: 8, labor_cost: 120 }),
      row({ server_id: "B", day: 5, gross_sales: 1400, covers: 70, hours: 8, labor_cost: 120 }),
      row({ server_id: "B", day: 5, gross_sales: 1500, covers: 72, hours: 8, labor_cost: 120 }),
    ];
    const out = computeSchedulingLeverage(rows);
    expect(out.shift_types.length).toBe(1);
    const A = out.matrix.find((c) => c.server_id === "A")!;
    expect(A.rpc_index).toBeGreaterThan(1);
    expect(A.rph_index).toBeGreaterThan(1);
    expect(A.fit_score).toBeGreaterThan(50);
  });

  it("CRITICAL: top SPH on naturally busy Saturday does NOT auto-win — Tuesday with more headroom can score higher rota priority", () => {
    const rows: LeverageShiftRow[] = [];
    // Saturday dinner — venue baseline already STRONG (RPH ~$250, RPC ~$50)
    // many servers post strong numbers — no headroom.
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: `peer${i}`, day: 5, gross_sales: 2000, covers: 40, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }));
    }
    // Tuesday dinner — venue baseline WEAK (RPH ~$100, RPC ~$25). Lots of headroom.
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: `peer${i}`, day: 1, gross_sales: 800, covers: 32, hours: 8, labor_cost: 150, opportunity_factor: 0.9 }));
    }
    // Server A: highest SPH on Saturday, also above baseline on Tuesday.
    for (let i = 0; i < 6; i++) {
      rows.push(row({ server_id: "A", day: 5, gross_sales: 2300, covers: 45, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }));
      rows.push(row({ server_id: "A", day: 1, gross_sales: 1100, covers: 36, hours: 8, labor_cost: 150, opportunity_factor: 0.9 }));
    }
    const out = computeSchedulingLeverage(rows);
    const aSat = out.matrix.find((c) => c.server_id === "A" && c.baseline.day_of_week === 5)!;
    const aTue = out.matrix.find((c) => c.server_id === "A" && c.baseline.day_of_week === 1)!;
    // Saturday has zero headroom because venue baseline ~= top quartile.
    expect(aSat.baseline.opportunity_need).toBeLessThan(aTue.baseline.opportunity_need);
    // Therefore Tuesday must rank higher for rota test priority.
    expect(aTue.rota_test_priority).toBeGreaterThan(aSat.rota_test_priority);
  });

  it("shrinks projected metrics toward venue baseline when sample size is small", () => {
    const rows: LeverageShiftRow[] = [];
    // Venue baseline RPC=20 on Tuesday dinner
    for (let i = 0; i < 20; i++) {
      rows.push(row({ server_id: `peer${i}`, day: 1, gross_sales: 1000, covers: 50, hours: 8, labor_cost: 120 }));
    }
    // Server X: 1 lucky shift at RPC=60
    rows.push(row({ server_id: "X", day: 1, gross_sales: 1800, covers: 30, hours: 8, labor_cost: 120 }));
    const out = computeSchedulingLeverage(rows);
    const x = out.matrix.find((c) => c.server_id === "X")!;
    expect(x.server_rpc).toBeCloseTo(60, 0);
    // Projected RPC must be much closer to venue 20 than raw 60.
    expect(x.projected_rpc!).toBeLessThan(40);
    expect(x.reliability).toBeLessThan(0.5);
    expect(x.confidence_band === "low" || x.confidence_band === "insufficient").toBe(true);
  });

  it("detects slow shift lifter and peak performer", () => {
    const rows: LeverageShiftRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(row({ server_id: `p${i}`, day: 5, gross_sales: 2000, covers: 40, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }));
      rows.push(row({ server_id: `p${i}`, day: 1, gross_sales: 700, covers: 28, hours: 8, labor_cost: 150, opportunity_factor: 0.9 }));
    }
    // PeakStar wins Saturdays
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "Peak", day: 5, gross_sales: 2600, covers: 48, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }));
    }
    // Lifter improves Tuesdays significantly
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "Lift", day: 1, gross_sales: 1100, covers: 40, hours: 8, labor_cost: 150, opportunity_factor: 0.9 }));
    }
    const out = computeSchedulingLeverage(rows);
    const peaks = out.recommendations.filter((r) => r.recommendation_type === "peak_performer");
    const lifts = out.recommendations.filter((r) => r.recommendation_type === "slow_shift_lifter");
    expect(peaks.some((r) => r.server_id === "Peak")).toBe(true);
    expect(lifts.some((r) => r.server_id === "Lift")).toBe(true);
  });

  it("identifies high RPC specialist and throughput specialist distinctly", () => {
    const rows: LeverageShiftRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(row({ server_id: `p${i}`, day: 5, gross_sales: 1500, covers: 60, hours: 8, labor_cost: 150 }));
    }
    // Rpc: fewer covers, big tickets
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "Rpc", day: 5, gross_sales: 2000, covers: 40, hours: 8, labor_cost: 150 }));
    }
    // Throughput: more covers per hour
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "Tp", day: 5, gross_sales: 2200, covers: 100, hours: 8, labor_cost: 150 }));
    }
    const out = computeSchedulingLeverage(rows);
    expect(out.recommendations.some((r) => r.server_id === "Rpc" && r.recommendation_type === "high_rpc_specialist")).toBe(true);
    expect(out.recommendations.some((r) => r.server_id === "Tp" && r.recommendation_type === "throughput_specialist")).toBe(true);
  });

  it("flags underused capability when fit is high but current allocation is low", () => {
    const rows: LeverageShiftRow[] = [];
    // venue Tuesday lunch baseline
    for (let i = 0; i < 12; i++) {
      rows.push(row({ server_id: `p${i}`, day: 1, daypart: "lunch", gross_sales: 800, covers: 40, hours: 8, labor_cost: 120 }));
    }
    // Star works mostly Friday dinner; only 1 Tuesday lunch but very strong
    for (let i = 0; i < 20; i++) {
      rows.push(row({ server_id: "Star", day: 4, daypart: "dinner", gross_sales: 1800, covers: 50, hours: 8, labor_cost: 150 }));
    }
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "Star", day: 1, daypart: "lunch", gross_sales: 1200, covers: 50, hours: 8, labor_cost: 120 }));
    }
    const out = computeSchedulingLeverage(rows);
    expect(out.highlights.most_underused).toBeTruthy();
  });

  it("detects protect-from-mismatch when a strong server is over-scheduled on a low-fit shift", () => {
    const rows: LeverageShiftRow[] = [];
    // venue baselines
    for (let i = 0; i < 12; i++) {
      rows.push(row({ server_id: `p${i}`, day: 5, gross_sales: 2000, covers: 50, hours: 8, labor_cost: 150 }));
      rows.push(row({ server_id: `p${i}`, day: 0, daypart: "breakfast", gross_sales: 600, covers: 40, hours: 6, labor_cost: 80 }));
    }
    // M: strong on Saturday, but mostly scheduled on Monday breakfast where they underperform.
    for (let i = 0; i < 8; i++) {
      rows.push(row({ server_id: "M", day: 5, gross_sales: 2400, covers: 55, hours: 8, labor_cost: 150 }));
    }
    for (let i = 0; i < 20; i++) {
      rows.push(row({ server_id: "M", day: 0, daypart: "breakfast", gross_sales: 250, covers: 30, hours: 6, labor_cost: 80 }));
    }
    const out = computeSchedulingLeverage(rows);
    expect(out.recommendations.some((r) => r.server_id === "M" && r.recommendation_type === "protect_from_mismatch")).toBe(true);
  });

  it("does not crash and degrades gracefully when hours and covers are missing", () => {
    const rows: LeverageShiftRow[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push({
        server_id: "A",
        server_name: "A",
        shift_date: `2026-06-0${i + 1}`,
        day_of_week: i % 7,
        daypart: "dinner",
        gross_sales: 1000,
        covers: null,
        hours: null,
        labor_cost: 100,
        opportunity_factor: 1,
      });
    }
    const out = computeSchedulingLeverage(rows);
    expect(out.matrix.length).toBeGreaterThan(0);
    expect(out.data_quality.notes.length).toBeGreaterThan(0);
    // No fit score should be NaN
    for (const c of out.matrix) expect(Number.isFinite(c.fit_score)).toBe(true);
  });
});
