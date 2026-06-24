// Scheduling Leverage v2 — rota decision intelligence tests.
//
// These tests prove the engine:
//   1. Keeps outlets separate by default.
//   2. Blocks cross-outlet recommendations without history/eligibility.
//   3. Infers single outlet from upload filename.
//   4. Uses category data when available, neutral otherwise.
//   5. Never labels a negative-lift cell as Best/Good/Peak/RPC/Throughput/Slow.
//   6. Produces label contrast (not every cell is "Good").
//   7. Top-SPH-on-busy-Saturday does NOT auto-win against Tuesday with headroom.
//   8. Marginal-lift gate: recommendations only when projected > current.
//   9. Underused capability surfaces strong, low-allocation cells.
//  10. Respects observed working pattern — part-time servers get swap, not extra.

import { describe, it, expect } from "vitest";
import {
  computeSchedulingLeverage,
  type LeverageShiftRow,
} from "../scheduling-leverage";

function row(p: Partial<LeverageShiftRow> & { server_id: string; day: number }): LeverageShiftRow {
  return {
    server_id: p.server_id,
    server_name: p.server_name ?? p.server_id,
    shift_date: p.shift_date ?? `2026-06-${String((p.day % 28) + 1).padStart(2, "0")}`,
    day_of_week: p.day,
    daypart: p.daypart ?? "dinner",
    outlet: p.outlet ?? null,
    gross_sales: p.gross_sales ?? 1000,
    net_sales: null,
    covers: p.covers ?? 50,
    hours: p.hours ?? 8,
    labor_cost: p.labor_cost ?? 100,
    opportunity_factor: p.opportunity_factor ?? 1,
    category_sales: p.category_sales ?? null,
    category_target_rate: p.category_target_rate ?? null,
  };
}

// helper: build rows across N weeks so working-pattern logic has history
function weeksOf(
  build: (week: number) => LeverageShiftRow[],
  weeks: number,
): LeverageShiftRow[] {
  const out: LeverageShiftRow[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const r of build(w)) {
      // shift_date offset by week
      const base = new Date("2026-04-06T00:00:00Z"); // Monday
      base.setUTCDate(base.getUTCDate() + w * 7 + r.day_of_week);
      out.push({ ...r, shift_date: base.toISOString().slice(0, 10) });
    }
  }
  return out;
}

describe("Scheduling Leverage v2", () => {
  it("keeps outlets separate by default — Villoresi Friday dinner ≠ Nebo Friday dinner", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `vp${w}`, day: 4, outlet: "Villoresi", gross_sales: 2000, covers: 50 }),
      row({ server_id: `np${w}`, day: 4, outlet: "Nebo", gross_sales: 3000, covers: 40 }),
    ], 6);
    const out = computeSchedulingLeverage(rows);
    expect(out.matrix_scope).toBe("outlet_scoped");
    const keys = new Set(out.shift_types.map((t) => t.key));
    expect(keys.has("Villoresi|4|dinner")).toBe(true);
    expect(keys.has("Nebo|4|dinner")).toBe(true);
    // baselines must differ (different RPC)
    const v = out.shift_types.find((t) => t.outlet === "Villoresi")!;
    const n = out.shift_types.find((t) => t.outlet === "Nebo")!;
    expect(v.baseline_rpc).not.toBeCloseTo(n.baseline_rpc!, 1);
  });

  it("blocks cross-outlet recommendations without history or eligibility", () => {
    const rows = weeksOf((w) => [
      // Villoresi server with strong history in Villoresi only
      row({ server_id: "A", day: 5, outlet: "Villoresi", gross_sales: 2500, covers: 50 }),
      row({ server_id: "A", day: 4, outlet: "Villoresi", gross_sales: 2400, covers: 50 }),
      // Nebo peers
      row({ server_id: `np${w}`, day: 5, outlet: "Nebo", gross_sales: 1500, covers: 40 }),
      row({ server_id: `np${w}`, day: 4, outlet: "Nebo", gross_sales: 1600, covers: 40 }),
    ], 6);
    const out = computeSchedulingLeverage(rows);
    const aNebo = out.matrix.find((c) => c.server_id === "A" && c.baseline.outlet === "Nebo");
    expect(aNebo).toBeTruthy();
    expect(aNebo!.cell_label).toBe("not_eligible");
    expect(aNebo!.outlet_eligibility).toBe(0);
    // No recommendation should suggest A into Nebo
    for (const r of out.recommendations) {
      if (r.server_id === "A") expect(r.best_fit_shift).not.toMatch(/Nebo/);
    }
  });

  it("infers single outlet from filename when outlet missing", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, gross_sales: 2000, covers: 50, outlet: null }),
    ], 4);
    const out = computeSchedulingLeverage(rows, { outletInferredFromFile: "Villoresi" });
    expect(out.matrix_scope).toBe("single_outlet_inferred");
    expect(out.outlet_inferred_from_file).toBe("Villoresi");
    expect(out.shift_types.every((t) => t.outlet === "Villoresi")).toBe(true);
  });

  it("uses category data when present and falls back to neutral when missing", () => {
    const withCat = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, gross_sales: 2000, covers: 50, outlet: "V",
        category_sales: { wine: 600, food: 1400 }, category_target_rate: { wine: 20 } }),
      row({ server_id: "Star", day: 5, gross_sales: 2200, covers: 50, outlet: "V",
        category_sales: { wine: 900, food: 1300 }, category_target_rate: { wine: 20 } }),
    ], 6);
    const out = computeSchedulingLeverage(withCat);
    const star = out.matrix.find((c) => c.server_id === "Star")!;
    expect(star.category_fit_status).toBe("computed");

    const noCat = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "V" }),
    ], 4);
    const out2 = computeSchedulingLeverage(noCat);
    const c = out2.matrix[0];
    expect(c.category_fit_status).toBe("neutral_no_data");
    expect(c.category_fit).toBe(1.0);
  });

  it("negative modelled lift can never be Best/Good and never appears as Peak/RPC/Throughput/Slow-lift", () => {
    // construct a setup where Server Weak underperforms current deployment
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "V", gross_sales: 2500, covers: 50, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }),
      row({ server_id: "Weak", day: 5, outlet: "V", gross_sales: 800, covers: 30, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }),
    ], 8);
    const out = computeSchedulingLeverage(rows);
    const weakCell = out.matrix.find((c) => c.server_id === "Weak")!;
    expect(weakCell.modelled_marginal_lift).toBeLessThan(0);
    expect(weakCell.cell_label).not.toBe("best_fit");
    expect(weakCell.cell_label).not.toBe("good_fit");
    for (const r of out.recommendations) {
      if (r.server_id === "Weak") {
        expect(["development_shift", "protect_from_mismatch"]).toContain(r.recommendation_type);
      }
    }
  });

  it("creates label contrast — not every cell is Good or Best", () => {
    // Multiple servers, multiple shifts, varied performance
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 8; w++) {
      for (const dow of [1, 4, 5]) {
        for (let i = 0; i < 6; i++) {
          rows.push(row({ server_id: `p${i}`, day: dow, outlet: "V", gross_sales: 1500 + Math.random() * 800, covers: 40 + Math.random() * 20 }));
        }
      }
    }
    const out = computeSchedulingLeverage(rows);
    const labels = new Set(out.matrix.map((c) => c.cell_label));
    const goodOrBest = out.matrix.filter((c) => c.cell_label === "best_fit" || c.cell_label === "good_fit").length;
    // No column should have >25% best+good (engine enforces this hard rule)
    const byCol = new Map<string, number>();
    const totalByCol = new Map<string, number>();
    for (const c of out.matrix) {
      totalByCol.set(c.shift_type, (totalByCol.get(c.shift_type) ?? 0) + 1);
      if (c.cell_label === "best_fit" || c.cell_label === "good_fit") {
        byCol.set(c.shift_type, (byCol.get(c.shift_type) ?? 0) + 1);
      }
    }
    for (const [k, n] of byCol) {
      const total = totalByCol.get(k)!;
      expect(n / total).toBeLessThanOrEqual(0.4); // small tolerance for cap=max(1, floor(0.25))
    }
    expect(goodOrBest).toBeLessThan(out.matrix.length); // not everything passes
    expect(labels.size).toBeGreaterThan(1); // we produce more than one label kind
  });

  it("CRITICAL: highest-SPH on busy Saturday does NOT auto-win — Tuesday with headroom ranks higher", () => {
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 8; w++) {
      // Saturday — already strong (peers at top quartile)
      for (let i = 0; i < 6; i++) {
        rows.push(row({ server_id: `peer${i}`, day: 5, outlet: "V",
          gross_sales: 2200 + i * 50, covers: 45, hours: 8, labor_cost: 150, opportunity_factor: 1.3,
          shift_date: `2026-${String(4 + Math.floor(w / 4)).padStart(2, "0")}-${String((w * 7 + 5) % 28 + 1).padStart(2, "0")}` }));
      }
      // Tuesday — weak deployment
      for (let i = 0; i < 6; i++) {
        rows.push(row({ server_id: `peer${i}`, day: 1, outlet: "V",
          gross_sales: 700 + i * 30, covers: 30, hours: 8, labor_cost: 150, opportunity_factor: 0.9,
          shift_date: `2026-${String(4 + Math.floor(w / 4)).padStart(2, "0")}-${String((w * 7 + 1) % 28 + 1).padStart(2, "0")}` }));
      }
      // Server A: top on Saturday, also above on Tuesday
      rows.push(row({ server_id: "A", day: 5, outlet: "V", gross_sales: 2400, covers: 48, hours: 8, labor_cost: 150, opportunity_factor: 1.3 }));
      rows.push(row({ server_id: "A", day: 1, outlet: "V", gross_sales: 1200, covers: 36, hours: 8, labor_cost: 150, opportunity_factor: 0.9 }));
    }
    const out = computeSchedulingLeverage(rows);
    const aSat = out.matrix.find((c) => c.server_id === "A" && c.baseline.day_of_week === 5)!;
    const aTue = out.matrix.find((c) => c.server_id === "A" && c.baseline.day_of_week === 1)!;
    expect(aSat.baseline.opportunity_need).toBeLessThan(aTue.baseline.opportunity_need);
    expect(aTue.rota_test_priority).toBeGreaterThan(aSat.rota_test_priority);
  });

  it("only recommends when projected > current rota baseline (positive lift gate)", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "V", gross_sales: 2000, covers: 50 }),
      row({ server_id: "Mediocre", day: 5, outlet: "V", gross_sales: 1900, covers: 50 }), // barely below
    ], 6);
    const out = computeSchedulingLeverage(rows);
    for (const r of out.recommendations) {
      if (["best_overall_leverage", "slow_shift_lifter", "peak_performer", "high_rpc_specialist", "throughput_specialist", "underused_capability"].includes(r.recommendation_type)) {
        expect((r.modelled_opportunity ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it("surfaces underused capability when strong fit + low allocation share", () => {
    const rows: LeverageShiftRow[] = [];
    // Star works MANY Friday dinners and only one Tuesday lunch (very strong)
    const baseMon = new Date("2026-04-06T00:00:00Z");
    for (let w = 0; w < 12; w++) {
      const mon = new Date(baseMon); mon.setUTCDate(mon.getUTCDate() + w * 7);
      const fri = new Date(mon); fri.setUTCDate(fri.getUTCDate() + 4);
      const tue = new Date(mon); tue.setUTCDate(tue.getUTCDate() + 1);
      const friISO = fri.toISOString().slice(0, 10);
      const tueISO = tue.toISOString().slice(0, 10);
      for (let i = 0; i < 6; i++) {
        rows.push(row({ server_id: `p${i}`, day: 1, daypart: "lunch", outlet: "V", gross_sales: 700, covers: 40, shift_date: tueISO }));
      }
      rows.push(row({ server_id: "Star", day: 4, daypart: "dinner", outlet: "V", gross_sales: 2000, covers: 50, shift_date: friISO }));
    }
    // two very strong Tuesday lunches on distinct dates — Star is rarely scheduled there
    rows.push(row({ server_id: "Star", day: 1, daypart: "lunch", outlet: "V", gross_sales: 1400, covers: 45, shift_date: "2026-05-05" }));
    rows.push(row({ server_id: "Star", day: 1, daypart: "lunch", outlet: "V", gross_sales: 1500, covers: 48, shift_date: "2026-05-12" }));
    const out = computeSchedulingLeverage(rows);
    // The matrix at least produces an underused recommendation OR highlights it
    const hasUnder =
      out.recommendations.some((r) => r.recommendation_types.includes("underused_capability")) ||
      out.highlights.most_underused != null;
    expect(hasUnder).toBe(true);
  });

  it("respects observed working pattern — part-time pattern receives swap, not extra-shift recommendation", () => {
    // Sarah works ~3 shifts/week consistently
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 8; w++) {
      const mondayBase = new Date("2026-04-06T00:00:00Z");
      mondayBase.setUTCDate(mondayBase.getUTCDate() + w * 7);
      for (const dow of [1, 3, 5]) {
        const d = new Date(mondayBase);
        d.setUTCDate(d.getUTCDate() + dow);
        rows.push({
          server_id: "Sarah", server_name: "Sarah", shift_date: d.toISOString().slice(0, 10),
          day_of_week: dow, daypart: "dinner", outlet: "V",
          gross_sales: 2200, covers: 45, hours: 8, labor_cost: 150, opportunity_factor: 1.0,
        });
      }
      // peers
      for (let i = 0; i < 4; i++) {
        for (const dow of [1, 2, 3, 4, 5]) {
          const d = new Date(mondayBase); d.setUTCDate(d.getUTCDate() + dow);
          rows.push({
            server_id: `peer${i}`, server_name: `peer${i}`, shift_date: d.toISOString().slice(0, 10),
            day_of_week: dow, daypart: "dinner", outlet: "V",
            gross_sales: 1700, covers: 45, hours: 8, labor_cost: 150, opportunity_factor: 1.0,
          });
        }
      }
    }
    const out = computeSchedulingLeverage(rows);
    const sarah = out.servers.find((s) => s.id === "Sarah")!;
    expect(sarah.pattern.pattern === "likely_part_time" || sarah.pattern.avg_shifts_per_week <= 3.5).toBe(true);
    const sarahRec = out.recommendations.find((r) => r.server_id === "Sarah");
    if (sarahRec) {
      expect(sarahRec.suggested_rota_test.toLowerCase()).toMatch(/swap|within current/);
    }
  });

  it("recommendation that exceeds observed max weekly pattern requires confirmation", () => {
    // Server with only 2 shifts/wk pattern, recommend on Sunday they never worked
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 6; w++) {
      const mb = new Date("2026-04-06T00:00:00Z"); mb.setUTCDate(mb.getUTCDate() + w * 7);
      for (const dow of [1, 3]) {
        const d = new Date(mb); d.setUTCDate(d.getUTCDate() + dow);
        rows.push({ server_id: "Stipe", server_name: "Stipe", shift_date: d.toISOString().slice(0, 10),
          day_of_week: dow, daypart: "dinner", outlet: "V",
          gross_sales: 2200, covers: 50, hours: 8, labor_cost: 150, opportunity_factor: 1.0 });
      }
      for (let i = 0; i < 4; i++) for (const dow of [0, 6]) {
        const d = new Date(mb); d.setUTCDate(d.getUTCDate() + dow);
        rows.push({ server_id: `peer${i}`, server_name: `p${i}`, shift_date: d.toISOString().slice(0, 10),
          day_of_week: dow, daypart: "lunch", outlet: "V",
          gross_sales: 1300, covers: 40, hours: 8, labor_cost: 150, opportunity_factor: 0.9 });
      }
    }
    const out = computeSchedulingLeverage(rows);
    // The Sunday lunch cell for Stipe must NOT be best/good and must indicate confirmation/eligibility
    const sun = out.matrix.find((c) => c.server_id === "Stipe" && c.baseline.day_of_week === 6);
    if (sun) {
      expect(["requires_availability", "test_monitor", "avoid_for_now", "insufficient_data"]).toContain(sun.cell_label);
    }
  });

  it("working pattern counts UNIQUE shifts — multiple POS/category rows from the same shift do not inflate weekly counts", () => {
    // Sarah has 8 weeks of Tue+Thu+Sat dinner shifts; each shift has 3 duplicate
    // rows (POS sale + 2 category-split rows). Working pattern must still say ~3 shifts/wk.
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 8; w++) {
      const mb = new Date("2026-04-06T00:00:00Z"); mb.setUTCDate(mb.getUTCDate() + w * 7);
      for (const dow of [1, 3, 5]) {
        const d = new Date(mb); d.setUTCDate(d.getUTCDate() + dow);
        const date = d.toISOString().slice(0, 10);
        // Simulate 3 joined rows for the same shift (POS + 2 categories)
        for (let k = 0; k < 3; k++) {
          rows.push({
            server_id: "Sarah", server_name: "Sarah", shift_date: date,
            day_of_week: dow, daypart: "dinner", outlet: "V",
            shift_start: "17:00:00", shift_end: "23:00:00",
            gross_sales: 700, covers: 15, hours: 6, labor_cost: 80, opportunity_factor: 1,
          });
        }
      }
    }
    const out = computeSchedulingLeverage(rows);
    const sarah = out.servers.find((s) => s.id === "Sarah")!;
    // 3 days/wk × 8 weeks = 24 unique shifts — NOT 72
    expect(sarah.pattern.total_shifts).toBe(24);
    expect(sarah.pattern.avg_shifts_per_week).toBeCloseTo(3, 1);
    expect(sarah.pattern.avg_worked_days_per_week).toBeCloseTo(3, 1);
    expect(sarah.pattern.pattern).toBe("likely_part_time");
  });

  it("every non-neutral matrix cell carries a visible primary_reason and a cell_label_text", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "V", gross_sales: 2000, covers: 50 }),
      row({ server_id: "Star", day: 5, outlet: "V", gross_sales: 2400, covers: 55 }),
    ], 8);
    const out = computeSchedulingLeverage(rows);
    for (const cell of out.matrix) {
      expect(cell.cell_label_text).toBeTruthy();
      if (cell.cell_label !== "insufficient_data") {
        expect(cell.primary_reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("duplicate (server, shift) recommendations are grouped — recommendation_types lists each category", () => {
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 8; w++) {
      // Strong server on a single shift type — likely to trigger best_overall AND high_rpc
      const mb = new Date("2026-04-06T00:00:00Z"); mb.setUTCDate(mb.getUTCDate() + w * 7);
      for (const dow of [4]) {
        const d = new Date(mb); d.setUTCDate(d.getUTCDate() + dow);
        rows.push({ server_id: "Star", server_name: "Star", shift_date: d.toISOString().slice(0, 10),
          day_of_week: dow, daypart: "dinner", outlet: "V",
          gross_sales: 3200, covers: 60, hours: 8, labor_cost: 150, opportunity_factor: 1 });
        for (let i = 0; i < 4; i++) {
          rows.push({ server_id: `peer${i}`, server_name: `peer${i}`, shift_date: d.toISOString().slice(0, 10),
            day_of_week: dow, daypart: "dinner", outlet: "V",
            gross_sales: 1700, covers: 55, hours: 8, labor_cost: 150, opportunity_factor: 1 });
        }
      }
    }
    const out = computeSchedulingLeverage(rows);
    // Star should appear only ONCE per (server, shift) in dedup
    const starRecs = out.recommendations.filter((r) => r.server_id === "Star");
    const seen = new Set<string>();
    for (const r of starRecs) {
      const k = `${r.server_id}|${r.best_fit_shift}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(Array.isArray(r.recommendation_types)).toBe(true);
    }
  });

  it("venue fallback for outlet is labelled — outlet_basis=venue_fallback adds a data-quality note", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "The Ivy", gross_sales: 2000, covers: 50 }),
    ], 6);
    const out = computeSchedulingLeverage(rows, { outletBasis: "venue_fallback" });
    expect(out.outlet_basis).toBe("venue_fallback");
    expect(out.data_quality.notes.some((n) => n.toLowerCase().includes("venue name used as fallback"))).toBe(true);
  });

  it("returns period metadata and selected-week-has-shifts when provided", () => {
    const rows = weeksOf((w) => [row({ server_id: `p${w}`, day: 5, outlet: "V" })], 4);
    const out = computeSchedulingLeverage(rows, {
      period: { start: "2026-04-06", end: "2026-05-10", weeks: 5 },
      selectedWeekHasShifts: false,
      selectedWeekStart: "2026-06-22",
    });
    expect(out.period.weeks).toBe(5);
    expect(out.selected_week_has_shifts).toBe(false);
    expect(out.selected_week_start).toBe("2026-06-22");
  });

  it("recommendations include test_style (swap | extra | requires_confirmation) and a plain-English explanation", () => {
    const rows = weeksOf((w) => [
      row({ server_id: `p${w}`, day: 5, outlet: "V", gross_sales: 1500, covers: 45 }),
      row({ server_id: "Star", day: 5, outlet: "V", gross_sales: 2400, covers: 55 }),
    ], 8);
    const out = computeSchedulingLeverage(rows);
    for (const r of out.recommendations) {
      expect(["swap", "extra", "requires_confirmation"]).toContain(r.test_style);
      expect(r.explanation.current_baseline).toMatch(/baseline/i);
      expect(r.explanation.projected_result).toContain(r.server_name);
      expect(r.explanation.confidence.toLowerCase()).toContain("confidence");
      expect(r.explanation.observed_pattern.toLowerCase()).toContain("pattern");
    }
  });
});
