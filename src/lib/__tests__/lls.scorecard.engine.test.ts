/**
 * Regression test: proves /manager/lls scorecard now routes through the
 * canonical metrics engine. Computes the scorecard for a known fixture and
 * cross-checks every weekly metric against an independent `aggregate()`
 * call. Any drift between the production path and the engine fails here.
 */
import { describe, it, expect } from "vitest";
import {
  computeWeeklyScorecardFromRows,
  type ScorecardInputRow,
} from "@/lib/lls.functions";
import { aggregate } from "@/lib/metrics/lls";
import { performanceGap, ragBand } from "@/lib/metrics/gap";

const WEEK = "2026-06-22"; // Monday

const fx = (over: Partial<ScorecardInputRow>): ScorecardInputRow => ({
  server_id: "s1",
  server_name: "Alex",
  shift_date: WEEK,
  day_of_week: 0,
  gross_sales: 1000,
  covers_served: 40,
  labor_cost: 100,
  opportunity_factor: 1,
  ...over,
});

describe("manager.lls scorecard ⇄ canonical engine", () => {
  it("weekly adjusted LLS equals engine aggregate.adjustedLLS", () => {
    const rows: ScorecardInputRow[] = [
      fx({ gross_sales: 1200, labor_cost: 120, opportunity_factor: 1.1, day_of_week: 0 }),
      fx({ gross_sales: 900, labor_cost: 100, opportunity_factor: 0.9, day_of_week: 1, shift_date: "2026-06-23" }),
      fx({ gross_sales: 1500, labor_cost: 130, opportunity_factor: 1.2, day_of_week: 2, shift_date: "2026-06-24" }),
    ];
    const sc = computeWeeklyScorecardFromRows(rows, WEEK, { green: 13, amber: 10 });

    const expected = aggregate(
      rows.map((r) => ({
        gross_sales: r.gross_sales,
        total_labor_cost: r.labor_cost,
        opportunity_factor: r.opportunity_factor,
      })),
      { allowMixedLaborBasis: true },
    );

    expect(sc.servers[0].weekly_adjusted_lls).toBe(expected.adjustedLLS.value);
    expect(sc.servers[0].weekly_base_lls).toBe(expected.baseLLS.value);
    expect(sc.venue_benchmark).toBe(expected.adjustedLLS.value);
  });

  it("performance gap matches engine performanceGap()", () => {
    const rows: ScorecardInputRow[] = [
      fx({ server_id: "s1", gross_sales: 1500, labor_cost: 100 }),
      fx({ server_id: "s2", server_name: "Sam", gross_sales: 800, labor_cost: 100 }),
    ];
    const sc = computeWeeklyScorecardFromRows(rows, WEEK, { green: 13, amber: 10 });
    const s1 = sc.servers.find((s) => s.serverId === "s1")!;
    const expectedGap = performanceGap(s1.weekly_adjusted_lls, sc.venue_benchmark).value;
    expect(s1.performance_gap).toBe(expectedGap);
  });

  it("RAG is the 3-band projection of canonical ragBand()", () => {
    // Build a server clearly above (+25%) the venue benchmark.
    const rows: ScorecardInputRow[] = [
      fx({ server_id: "s1", gross_sales: 2000, labor_cost: 100 }),
      fx({ server_id: "s2", server_name: "Sam", gross_sales: 1000, labor_cost: 100 }),
      fx({ server_id: "s3", server_name: "Sky", gross_sales: 1000, labor_cost: 100 }),
    ];
    const sc = computeWeeklyScorecardFromRows(rows, WEEK, { green: 13, amber: 10 });
    const s1 = sc.servers.find((s) => s.serverId === "s1")!;
    expect(ragBand(s1.performance_gap ?? undefined)).toBe("strong");
    expect(s1.rag_status).toBe("green");
  });

  it("shift-level OF is applied BEFORE aggregation (not avg-of-avg)", () => {
    // Two shifts at the same base LLS but different OFs — the weighted
    // adjusted result must equal Σnet / Σ(labor × OF), not (LLS1+LLS2)/2.
    const rows: ScorecardInputRow[] = [
      fx({ gross_sales: 1000, labor_cost: 100, opportunity_factor: 2 }),
      fx({ gross_sales: 1000, labor_cost: 100, opportunity_factor: 1, day_of_week: 1, shift_date: "2026-06-23" }),
    ];
    const sc = computeWeeklyScorecardFromRows(rows, WEEK, { green: 13, amber: 10 });
    // Σnet=2000, Σ(lc×OF)=100*2+100*1=300 → 6.666…
    expect(sc.servers[0].weekly_adjusted_lls).toBeCloseTo(2000 / 300, 6);
  });
});
