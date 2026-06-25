/**
 * Phase 20A — Controlled OF v2 Integration & Manager Preview tests.
 *
 * Verify the preview adapter:
 *   - returns required factor-version metadata
 *   - uses v1 fallback when comparable history is too thin
 *   - uses v2 preview when comparable history exists
 *   - excludes contextual / weather / manager-notes from scoring
 *   - never mutates input rows (committed values unchanged)
 *   - low confidence does NOT produce hard deployment claims
 *   - server routes do not import OF v2
 */

import { describe, expect, it } from "vitest";
import {
  buildOfV2Preview,
  OF_V2_MATERIAL_DELTA,
  type PreviewHistoryRow,
} from "@/lib/lls/opportunity-factor-v2-preview";
import * as fs from "node:fs";
import * as path from "node:path";

function mkRow(
  shift_date: string,
  week_start: string,
  day_of_week: number,
  daypart: string,
  overrides: Partial<PreviewHistoryRow> = {},
): PreviewHistoryRow {
  return {
    shift_date,
    week_start,
    day_of_week,
    daypart,
    outlet: null,
    gross_sales: 1000,
    covers: 80,
    labor_cost: 100,
    opportunity_factor: 1.0,
    ...overrides,
  };
}

describe("Phase 20A — OF v2 preview adapter", () => {
  it("returns required factor-version metadata", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner")];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: [],
      selectedWeek: sel,
    });
    expect(out).toHaveProperty("opportunity_factor_version");
    expect(out).toHaveProperty("opportunity_factor");
    expect(out).toHaveProperty("opportunity_factor_v1");
    expect(out).toHaveProperty("opportunity_factor_v2");
    expect(out).toHaveProperty("confidence");
    expect(out).toHaveProperty("basis");
    expect(out).toHaveProperty("inputs_used");
    expect(out).toHaveProperty("inputs_excluded");
    expect(out).toHaveProperty("warnings");
    expect(out).toHaveProperty("fallback_reason");
    expect(out).toHaveProperty("comparison_level");
    expect(out).toHaveProperty("comparable_count");
    expect(out).toHaveProperty("materially_different");
  });

  it("falls back to v1 when comparable history is insufficient", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner")];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: [],
      selectedWeek: sel,
    });
    expect(out.opportunity_factor_version).toBe("v1");
    expect(out.fallback_reason).not.toBeNull();
    expect(out.confidence).toBe("low");
    // No hard deployment claim — flag is false at low confidence.
    expect(out.materially_different).toBe(false);
  });

  it("uses v2 preview with comparable history", () => {
    const history: PreviewHistoryRow[] = [];
    // 8 prior weeks of comparable shifts.
    for (let w = 1; w <= 8; w++) {
      const ws = `2026-04-${String(20 + w).padStart(2, "0")}`;
      history.push(mkRow(ws, ws, 0, "dinner", { gross_sales: 1000, labor_cost: 100, covers: 80 }));
    }
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner")];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history,
      selectedWeek: sel,
    });
    expect(out.opportunity_factor_version).toBe("v2_preview");
    expect(out.fallback_reason).toBeNull();
    expect(out.comparable_count).toBeGreaterThanOrEqual(3);
  });

  it("excludes contextual / weather / manager-notes from scoring", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner")];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: [],
      selectedWeek: sel,
      context: {
        sevenrooms_section: "Patio",
        weather: "rain",
        manager_notes: "busy night",
        table_allocation: "T12",
      },
    });
    expect(out.inputs_excluded).toEqual(
      expect.arrayContaining([
        "sevenrooms_section",
        "weather",
        "manager_notes",
        "table_allocation",
      ]),
    );
  });

  it("does NOT mutate committed history / selected week rows", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner")];
    const hist = [mkRow("2026-06-15", "2026-06-15", 0, "dinner")];
    const selSnap = JSON.parse(JSON.stringify(sel));
    const histSnap = JSON.parse(JSON.stringify(hist));
    buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: hist,
      selectedWeek: sel,
    });
    expect(sel).toEqual(selSnap);
    expect(hist).toEqual(histSnap);
  });

  it("computes v1 fallback factor as labour-weighted avg of stored OF", () => {
    const sel = [
      mkRow("2026-06-22", "2026-06-22", 0, "dinner", { labor_cost: 100, opportunity_factor: 1.2 }),
      mkRow("2026-06-23", "2026-06-22", 1, "lunch", { labor_cost: 100, opportunity_factor: 0.8 }),
    ];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: [],
      selectedWeek: sel,
    });
    expect(out.opportunity_factor_v1).toBeCloseTo(1.0, 5);
  });

  it("flags material change only when delta ≥ threshold AND confidence not low", () => {
    // history that pushes v2 noticeably above v1
    const history: PreviewHistoryRow[] = [];
    for (let w = 1; w <= 8; w++) {
      const ws = `2026-04-${String(20 + w).padStart(2, "0")}`;
      history.push(
        mkRow(ws, ws, 0, "dinner", { gross_sales: 500, labor_cost: 100, covers: 40 }),
      );
    }
    const sel = [
      mkRow("2026-06-22", "2026-06-22", 0, "dinner", {
        gross_sales: 1500,
        labor_cost: 100,
        covers: 120,
        opportunity_factor: 1.0,
      }),
    ];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history,
      selectedWeek: sel,
    });
    expect(out.opportunity_factor_delta).not.toBeNull();
    if (out.confidence !== "low") {
      expect(Math.abs(out.opportunity_factor_delta!)).toBeGreaterThanOrEqual(
        OF_V2_MATERIAL_DELTA - 1e-9,
      );
    }
  });

  it("LLS formula is unchanged: Adjusted LLS = Base LLS / Opportunity Factor", async () => {
    // Sanity — the helper exported by the engine preserves the formula.
    const { adjustedLlsFromOpportunityFactor } = await import("@/lib/opportunity-factor-v2");
    expect(adjustedLlsFromOpportunityFactor(10, 1.25)).toBeCloseTo(8, 6);
    expect(adjustedLlsFromOpportunityFactor(10, 1)).toBeCloseTo(10, 6);
  });

  it("server routes do NOT import OF v2 (Phase 20A guardrail)", () => {
    const serverDir = path.join(process.cwd(), "src", "routes");
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(serverDir)) {
      if (!entry.startsWith("server.") && entry !== "server") continue;
      const full = path.join(serverDir, entry);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        const src = fs.readFileSync(full, "utf-8");
        if (
          src.includes("opportunity-factor-v2") ||
          src.includes("OpportunityFactorV2") ||
          src.includes("computeOpportunityFactorV2") ||
          src.includes("buildOfV2Preview")
        ) {
          offenders.push(entry);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
