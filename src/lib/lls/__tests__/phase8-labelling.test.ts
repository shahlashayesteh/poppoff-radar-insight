// Phase 8 — Opportunity Factor & Shift Match labelling/positioning.
//
// These tests guard the honest framing requirements from Phase 8:
//   * Scheduling Leverage UI must be positioned as Historical Shift Match
//     Intelligence and explicitly NOT as full rota optimisation.
//   * Opportunity Factor grid must be labelled Trading Pattern Factor v1.
//   * Modelled lift must remain labelled as modelled/estimated, never guaranteed.
//   * Server-facing routes must NOT import the manager-only shift-match engine.
//   * The underlying engine continues to block cross-outlet recommendations
//     when no outlet history nor cross-outlet eligibility exists.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  computeSchedulingLeverage,
  type LeverageShiftRow,
} from "../scheduling-leverage";

const MATRIX_FILE = "src/components/lls/scheduling-leverage-matrix.tsx";
const MANAGER_LLS_ROUTE = "src/routes/manager.lls.index.tsx";
const ROUTES_DIR = "src/routes";

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("Phase 8 — Historical Shift Match Intelligence labelling", () => {
  const matrix = read(MATRIX_FILE);

  it("renames the section to Historical Shift Match Intelligence", () => {
    expect(matrix).toContain("Historical Shift Match Intelligence");
    // Old marketing label removed from the visible heading
    expect(matrix).not.toMatch(/<h2[^>]*>\s*Scheduling Leverage Matrix\s*</);
  });

  it("explicitly disclaims full rota optimisation", () => {
    expect(matrix).toMatch(/Not full rota optimisation yet/i);
  });

  it("frames recommendations as suggested tests, not instructions", () => {
    expect(matrix).toMatch(/Suggested shift-match tests/i);
    expect(matrix).toMatch(/suggested tests?/i);
    // No promise wording: anywhere "guaranteed" appears it must be negated.
    const guaranteedMatches = matrix.match(/[^\.]*guaranteed[^\.]*\./gi) ?? [];
    for (const sentence of guaranteedMatches) {
      expect(sentence.toLowerCase()).toMatch(/never|not /);
    }
  });

  it("warns when rota / availability / contracted hours are missing", () => {
    expect(matrix).toMatch(/no rota, availability, contracted-hours/i);
  });

  it("labels commercial lift as estimated/modelled", () => {
    expect(matrix).toMatch(/estimated\/modelled/i);
  });
});

describe("Phase 8 — Trading Pattern Factor v1 labelling", () => {
  const route = read(MANAGER_LLS_ROUTE);

  it("labels the Opportunity Factor grid as Trading Pattern Factor v1", () => {
    expect(route).toContain("Trading Pattern Factor v1");
  });

  it("acknowledges v1 is sales/daypart only", () => {
    expect(route).toMatch(/sales \/ daypart only/i);
  });

  it("calls out the v2 inputs that are not yet available", () => {
    // At least covers / outlet / section must be named as future inputs.
    expect(route).toMatch(/covers/);
    expect(route).toMatch(/outlet/);
    expect(route).toMatch(/section/);
  });
});

describe("Phase 8 — Server pages do not expose manager-only Shift Match", () => {
  it("no /server/* or /demo.server* route imports the scheduling-leverage engine or matrix", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ROUTES_DIR)) {
      if (!f.endsWith(".tsx")) continue;
      if (!(f.startsWith("server.") || f.startsWith("demo.server"))) continue;
      const body = read(join(ROUTES_DIR, f));
      if (
        body.includes("scheduling-leverage") ||
        body.includes("SchedulingLeverageMatrix") ||
        /Historical Shift Match Intelligence/.test(body)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ───────────── engine guard: cross-outlet block still holds ─────────────

function row(p: Partial<LeverageShiftRow> & { server_id: string; day: number }): LeverageShiftRow {
  const date = p.shift_date ?? `2026-06-${String((p.day % 28) + 1).padStart(2, "0")}`;
  return {
    server_id: p.server_id,
    server_name: p.server_name ?? p.server_id,
    shift_date: date,
    day_of_week: p.day,
    daypart: p.daypart ?? "dinner",
    outlet: p.outlet ?? null,
    gross_sales: p.gross_sales ?? 1200,
    net_sales: null,
    covers: p.covers ?? 60,
    hours: p.hours ?? 8,
    labor_cost: p.labor_cost ?? 110,
    opportunity_factor: p.opportunity_factor ?? 1,
    category_sales: p.category_sales ?? null,
    category_target_rate: p.category_target_rate ?? null,
  };
}

describe("Phase 8 — engine still blocks cross-outlet recommendations", () => {
  it("a server with no history in outlet B is not eligible for outlet B without manager flag", () => {
    // Build several weeks of rows so the engine has stable history.
    const rows: LeverageShiftRow[] = [];
    for (let w = 0; w < 6; w++) {
      const base = new Date("2026-04-06T00:00:00Z");
      base.setUTCDate(base.getUTCDate() + w * 7);
      const wkDate = (dow: number) => {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() + dow);
        return d.toISOString().slice(0, 10);
      };
      // Anna only ever works outlet "Bar"
      for (const dow of [4, 5, 6]) {
        rows.push(row({ server_id: "anna", day: dow, outlet: "Bar", shift_date: wkDate(dow) }));
      }
      // Ben only ever works outlet "Restaurant"
      for (const dow of [4, 5, 6]) {
        rows.push(row({ server_id: "ben", day: dow, outlet: "Restaurant", shift_date: wkDate(dow) }));
      }
    }

    const result = computeSchedulingLeverage(rows, {
      lookbackWeeks: 6,
      // No crossOutletEligibility flag set for anyone.
    });

    const annaInRestaurant = result.matrix.filter(
      (c) => c.server_id === "anna" && c.shift_type.startsWith("Restaurant"),
    );
    // Either Anna gets no Restaurant cells, or every Restaurant cell is marked not_eligible.
    for (const c of annaInRestaurant) {
      expect(c.outlet_eligibility).toBe(0);
      expect(c.cell_label).toBe("not_eligible");
    }

    // And no recommendation should put Anna in Restaurant.
    for (const rec of result.recommendations) {
      if (rec.server_id === "anna") {
        expect(rec.best_fit_shift.startsWith("Restaurant")).toBe(false);
      }
    }
  });
});
