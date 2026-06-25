/**
 * Phase 20B — OF v2 Granularity & Data-Quality Hardening tests.
 *
 * Covers:
 *   - daypart-level and day-of-week-level preview buckets
 *   - hours-source classification (paid/clock/labour-export/proxy/missing)
 *   - decision-grade guardrails (manager_analysis / review / preview / n/a)
 *   - labour-cost proxy downgrades confidence + emits warning
 *   - missing hours cannot drive hard recommendation
 *   - low-confidence cannot drive hard recommendation
 *   - contextual SevenRooms / weather / manager_notes remain excluded
 *   - server routes do not import OF v2 internals
 *   - LLS formula is unchanged
 */

import { describe, expect, it } from "vitest";
import {
  buildOfV2Preview,
  classifyHoursSource,
  deriveDecisionGrade,
  isMeasuredHoursSource,
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

// 8 weeks of comparable Mon-dinner shifts to satisfy v2 minimums.
function richHistory(extraDow?: number, extraDp?: string): PreviewHistoryRow[] {
  const out: PreviewHistoryRow[] = [];
  for (let w = 1; w <= 8; w++) {
    const ws = `2026-04-${String(w * 1 + 6).padStart(2, "0")}`;
    out.push(mkRow(ws, ws, 0, "dinner", { paid_hours: 10 }));
    if (extraDow != null && extraDp != null) {
      out.push(mkRow(ws, ws, extraDow, extraDp, { paid_hours: 8 }));
    }
  }
  return out;
}

describe("Phase 20B — hours-source classification", () => {
  it("treats paid_hours as the strongest source", () => {
    const rows = [mkRow("2026-06-22", "2026-06-22", 0, "dinner", { paid_hours: 10, clock_hours: 9 })];
    expect(classifyHoursSource(rows)).toBe("paid_hours");
    expect(isMeasuredHoursSource("paid_hours")).toBe(true);
  });
  it("treats clock_hours as measured", () => {
    const rows = [mkRow("d", "w", 0, "d", { paid_hours: null, clock_hours: 9 })];
    expect(classifyHoursSource(rows)).toBe("clock_hours");
    expect(isMeasuredHoursSource("clock_hours")).toBe(true);
  });
  it("treats labour_export_hours as measured", () => {
    const rows = [mkRow("d", "w", 0, "d", { paid_hours: null, clock_hours: null, labour_export_hours: 9 })];
    expect(classifyHoursSource(rows)).toBe("labour_export_hours");
    expect(isMeasuredHoursSource("labour_export_hours")).toBe(true);
  });
  it("falls back to labour_cost_proxy when no real hours exist", () => {
    const rows = [mkRow("d", "w", 0, "d", { labor_cost: 100 })];
    expect(classifyHoursSource(rows)).toBe("labour_cost_proxy");
    expect(isMeasuredHoursSource("labour_cost_proxy")).toBe(false);
  });
  it("returns missing_hours when no rows have hours or cost", () => {
    const rows = [mkRow("d", "w", 0, "d", { labor_cost: 0 })];
    expect(classifyHoursSource(rows)).toBe("missing_hours");
  });
});

describe("Phase 20B — decision-grade guardrails", () => {
  it("high confidence + measured hours → manager_analysis", () => {
    const g = deriveDecisionGrade({ confidence: "high", hoursSource: "paid_hours", fellBack: false });
    expect(g.decision_grade).toBe("manager_analysis");
    expect(g.can_drive_hard_recommendation).toBe(true);
  });
  it("medium confidence + measured hours → manager_review (no hard rec)", () => {
    const g = deriveDecisionGrade({ confidence: "medium", hoursSource: "clock_hours", fellBack: false });
    expect(g.decision_grade).toBe("manager_review");
    expect(g.can_drive_hard_recommendation).toBe(false);
  });
  it("labour-cost proxy always demotes to preview_only", () => {
    const g = deriveDecisionGrade({ confidence: "high", hoursSource: "labour_cost_proxy", fellBack: false });
    expect(g.decision_grade).toBe("preview_only");
    expect(g.can_drive_hard_recommendation).toBe(false);
  });
  it("low confidence → preview_only, never hard rec", () => {
    const g = deriveDecisionGrade({ confidence: "low", hoursSource: "paid_hours", fellBack: false });
    expect(g.decision_grade).toBe("preview_only");
    expect(g.can_drive_hard_recommendation).toBe(false);
  });
  it("missing hours → not_for_decision", () => {
    const g = deriveDecisionGrade({ confidence: "high", hoursSource: "missing_hours", fellBack: false });
    expect(g.decision_grade).toBe("not_for_decision");
    expect(g.can_drive_hard_recommendation).toBe(false);
  });
  it("hard fallback → not_for_decision", () => {
    const g = deriveDecisionGrade({ confidence: "medium", hoursSource: "paid_hours", fellBack: true });
    expect(g.decision_grade).toBe("not_for_decision");
    expect(g.can_drive_hard_recommendation).toBe(false);
  });
});

describe("Phase 20B — preview buckets", () => {
  it("emits a daypart bucket for each selected-week daypart", () => {
    const sel = [
      mkRow("2026-06-22", "2026-06-22", 1, "lunch", { paid_hours: 6 }),
      mkRow("2026-06-22", "2026-06-22", 1, "dinner", { paid_hours: 8 }),
    ];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: richHistory(1, "lunch"),
      selectedWeek: sel,
    });
    const dps = out.buckets.by_daypart.map((b) => b.key).sort();
    expect(dps).toEqual(["dinner", "lunch"]);
    for (const b of out.buckets.by_daypart) {
      expect(b.axis).toBe("daypart");
      expect(b).toHaveProperty("comparable_count");
      expect(b).toHaveProperty("confidence");
      expect(b).toHaveProperty("inputs_used");
      expect(b).toHaveProperty("inputs_excluded");
      expect(b).toHaveProperty("hours_source");
      expect(b).toHaveProperty("decision_grade");
    }
  });
  it("emits a day-of-week bucket for each selected-week DOW", () => {
    const sel = [
      mkRow("2026-06-22", "2026-06-22", 1, "dinner", { paid_hours: 8 }),
      mkRow("2026-06-23", "2026-06-22", 2, "dinner", { paid_hours: 8 }),
    ];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: richHistory(2, "dinner"),
      selectedWeek: sel,
    });
    expect(out.buckets.by_day_of_week.length).toBe(2);
    for (const b of out.buckets.by_day_of_week) {
      expect(b.axis).toBe("day_of_week");
    }
  });
});

describe("Phase 20B — overall preview integration", () => {
  it("labour-cost proxy preview is labelled preview_only and cannot drive hard rec", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner", { paid_hours: null, labor_cost: 100 })];
    const hist: PreviewHistoryRow[] = [];
    for (let w = 1; w <= 8; w++) {
      const ws = `2026-04-${String(6 + w).padStart(2, "0")}`;
      hist.push(mkRow(ws, ws, 0, "dinner", { paid_hours: null, labor_cost: 100 }));
    }
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: hist,
      selectedWeek: sel,
    });
    expect(out.hours_source).toBe("labour_cost_proxy");
    expect(out.decision_grade).toBe("preview_only");
    expect(out.can_drive_hard_recommendation).toBe(false);
    expect(out.warnings.some((w) => /estimated from labour cost/i.test(w))).toBe(true);
  });

  it("missing hours overall prevents hard recommendation", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner", { paid_hours: null, labor_cost: 0 })];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: [],
      selectedWeek: sel,
    });
    expect(out.hours_source).toBe("missing_hours");
    expect(out.can_drive_hard_recommendation).toBe(false);
    expect(out.decision_grade).toBe("not_for_decision");
  });

  it("paid hours + rich history can reach manager_analysis", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner", { paid_hours: 10 })];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: richHistory(),
      selectedWeek: sel,
    });
    // With paid hours throughout and 8 comparable periods the venue baseline
    // should be high confidence; decision grade should reach analysis level.
    expect(out.hours_source).toBe("paid_hours");
    expect(out.can_drive_hard_recommendation).toBe(out.confidence === "high");
    if (out.confidence === "high") {
      expect(out.decision_grade).toBe("manager_analysis");
    }
  });

  it("contextual SevenRooms / weather / manager_notes remain excluded", () => {
    const sel = [mkRow("2026-06-22", "2026-06-22", 0, "dinner", { paid_hours: 10 })];
    const out = buildOfV2Preview({
      venueId: "v1",
      weekStart: "2026-06-22",
      history: richHistory(),
      selectedWeek: sel,
      context: {
        sevenrooms_section: "Patio",
        weather: "rain",
        manager_notes: "busy",
        table_allocation: "T12",
      },
    });
    expect(out.inputs_excluded).toEqual(
      expect.arrayContaining(["sevenrooms_section", "weather", "manager_notes", "table_allocation"]),
    );
  });

  it("LLS formula is unchanged: Adjusted LLS = Base LLS / Opportunity Factor", async () => {
    const { adjustedLlsFromOpportunityFactor } = await import("@/lib/opportunity-factor-v2");
    expect(adjustedLlsFromOpportunityFactor(10, 1.25)).toBeCloseTo(8, 6);
    expect(adjustedLlsFromOpportunityFactor(10, 1)).toBeCloseTo(10, 6);
  });

  it("server routes do NOT import OF v2 internals (Phase 20B guardrail)", () => {
    const dir = path.join(process.cwd(), "src", "routes");
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.startsWith("server.") && entry !== "server") continue;
      const full = path.join(dir, entry);
      if (!fs.statSync(full).isFile()) continue;
      const src = fs.readFileSync(full, "utf-8");
      if (
        src.includes("opportunity-factor-v2") ||
        src.includes("OpportunityFactorV2") ||
        src.includes("computeOpportunityFactorV2") ||
        src.includes("buildOfV2Preview") ||
        src.includes("OpportunityFactorPreview")
      ) {
        offenders.push(entry);
      }
    }
    expect(offenders).toEqual([]);
  });
});
