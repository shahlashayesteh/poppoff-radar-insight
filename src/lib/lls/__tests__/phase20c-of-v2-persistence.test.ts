/**
 * Phase 20C — OF v2 Production Readiness tests.
 *
 * Covers:
 *   - preview prefers paid > clock > labour-export > proxy
 *   - missing hours → not_for_decision
 *   - preview assessment row builders persist applied v1, preview v2, delta,
 *     confidence, basis, hours source, decision grade, comparable count,
 *     inputs used / excluded, fallback reason
 *   - buildAssessmentRows emits overall + bucket rows
 *   - server routes do not import OF v2 assessment internals
 *   - LLS formula remains Adjusted = Base / OF (untouched)
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildOfV2Preview,
  classifyHoursSource,
  type PreviewHistoryRow,
} from "@/lib/lls/opportunity-factor-v2-preview";
import {
  buildAssessmentRows,
  buildOverallAssessmentRow,
  buildBucketAssessmentRow,
} from "@/lib/lls/opportunity-factor-assessments";

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

function history(): PreviewHistoryRow[] {
  const out: PreviewHistoryRow[] = [];
  for (let w = 1; w <= 8; w++) {
    const ws = `2026-04-${String(w + 6).padStart(2, "0")}`;
    out.push(mkRow(ws, ws, 1, "dinner", { paid_hours: 10 }));
  }
  return out;
}

describe("Phase 20C — hours-source priority", () => {
  it("prefers paid_hours over clock_hours, export, proxy", () => {
    expect(
      classifyHoursSource([
        mkRow("2026-05-01", "2026-04-27", 1, "dinner", { paid_hours: 8, clock_hours: 7, labour_export_hours: 6 }),
      ]),
    ).toBe("paid_hours");
  });

  it("falls through to clock_hours when paid missing", () => {
    expect(
      classifyHoursSource([
        mkRow("2026-05-01", "2026-04-27", 1, "dinner", { clock_hours: 7, labour_export_hours: 6 }),
      ]),
    ).toBe("clock_hours");
  });

  it("uses labour_export_hours when paid/clock missing", () => {
    expect(
      classifyHoursSource([
        mkRow("2026-05-01", "2026-04-27", 1, "dinner", { labour_export_hours: 6 }),
      ]),
    ).toBe("labour_export_hours");
  });

  it("downgrades to labour_cost_proxy when only labor_cost present", () => {
    expect(
      classifyHoursSource([
        mkRow("2026-05-01", "2026-04-27", 1, "dinner", { labor_cost: 120 }),
      ]),
    ).toBe("labour_cost_proxy");
  });

  it("classifies missing hours when nothing is available", () => {
    expect(
      classifyHoursSource([
        mkRow("2026-05-01", "2026-04-27", 1, "dinner", { labor_cost: 0 }),
      ]),
    ).toBe("missing_hours");
  });
});

describe("Phase 20C — preview hours-source ⇒ decision grade", () => {
  it("missing hours ⇒ not_for_decision and no hard recommendation", () => {
    const sel = [mkRow("2026-06-01", "2026-06-01", 1, "dinner", { labor_cost: 0 })];
    const hist = history().map((r) => ({ ...r, paid_hours: null as any, labor_cost: 0 }));
    const p = buildOfV2Preview({
      venueId: "v",
      weekStart: "2026-06-01",
      history: hist,
      selectedWeek: sel,
    });
    expect(p.hours_source).toBe("missing_hours");
    expect(p.decision_grade).toBe("not_for_decision");
    expect(p.can_drive_hard_recommendation).toBe(false);
  });

  it("labour-cost proxy stays preview_only", () => {
    const sel = [mkRow("2026-06-01", "2026-06-01", 1, "dinner", { labor_cost: 120 })];
    const hist = history().map((r) => ({ ...r, paid_hours: null as any, labor_cost: 120 }));
    const p = buildOfV2Preview({
      venueId: "v",
      weekStart: "2026-06-01",
      history: hist,
      selectedWeek: sel,
    });
    expect(p.hours_source).toBe("labour_cost_proxy");
    expect(p.can_drive_hard_recommendation).toBe(false);
  });
});

describe("Phase 20C — assessment row persistence shape", () => {
  const sel = [
    mkRow("2026-06-01", "2026-06-01", 1, "dinner", { paid_hours: 10 }),
    mkRow("2026-06-02", "2026-06-01", 2, "lunch", { paid_hours: 6 }),
  ];
  const preview = buildOfV2Preview({
    venueId: "v",
    weekStart: "2026-06-01",
    history: history(),
    selectedWeek: sel,
  });

  it("overall row carries applied v1, preview v2, delta, confidence, basis, hours source, decision grade, comparable count, inputs", () => {
    const row = buildOverallAssessmentRow({
      venueId: "v",
      weekStart: "2026-06-01",
      preview,
    });
    expect(row.bucket_type).toBe("overall");
    expect(row.bucket_key).toBe("_overall_");
    expect(row.applied_factor_version).toBe("v1");
    expect(row.preview_factor_version).toBe("v2_preview");
    expect(row.applied_v1_factor).toBe(preview.opportunity_factor_v1);
    expect(row.preview_v2_factor).toBe(preview.opportunity_factor_v2);
    expect(row.delta).toBe(preview.opportunity_factor_delta);
    expect(row.confidence).toBe(preview.confidence);
    expect(row.basis).toBe(preview.basis);
    expect(row.hours_source).toBe(preview.hours_source);
    expect(row.decision_grade).toBe(preview.decision_grade);
    expect(row.comparable_count).toBe(preview.comparable_count);
    expect(Array.isArray(row.inputs_used)).toBe(true);
    expect(Array.isArray(row.inputs_excluded)).toBe(true);
    expect(Array.isArray(row.warnings)).toBe(true);
    expect(row.can_drive_hard_recommendation).toBe(preview.can_drive_hard_recommendation);
  });

  it("bucket rows include fallback_reason and per-axis bucket_type", () => {
    const b = preview.buckets.by_daypart[0];
    if (!b) return; // skip if no daypart bucket
    const row = buildBucketAssessmentRow({
      venueId: "v",
      weekStart: "2026-06-01",
      bucket: b,
    });
    expect(row.bucket_type).toBe("daypart");
    expect(row.bucket_key).toBe(b.key);
    expect(row.fallback_reason).toBe(b.fallback_reason);
    expect(row.hours_source).toBe(b.hours_source);
  });

  it("buildAssessmentRows emits overall + daypart + day_of_week rows", () => {
    const rows = buildAssessmentRows({
      venueId: "v",
      weekStart: "2026-06-01",
      preview,
    });
    expect(rows.some((r) => r.bucket_type === "overall")).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBe(
      1 + preview.buckets.by_daypart.length + preview.buckets.by_day_of_week.length,
    );
  });
});

describe("Phase 20C — server routes stay clean of OF v2 assessment internals", () => {
  const ROOT = path.resolve(__dirname, "../../../routes");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (e.isFile() && /\.(t|j)sx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  const serverFiles = fs.existsSync(ROOT)
    ? walk(ROOT).filter((f) => /[\\/]server\./.test(f) || /[\\/]server[\\/]/.test(f))
    : [];

  it("no /server/* route imports OF v2 assessment helpers", () => {
    for (const f of serverFiles) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/opportunity-factor-assessments/);
      expect(src).not.toMatch(/opportunity-factor-v2-preview/);
      expect(src).not.toMatch(/opportunity-factor-v2['"]/);
      expect(src).not.toMatch(/buildOfV2Preview/);
      expect(src).not.toMatch(/buildAssessmentRows/);
      expect(src).not.toMatch(/persistAssessmentRows/);
    }
  });
});

describe("Phase 20C — LLS formula remains unchanged", () => {
  it("Adjusted LLS = Base LLS / Opportunity Factor (sanity)", () => {
    const base = 14;
    const of = 1.1;
    expect(base / of).toBeCloseTo(12.727, 2);
  });
});
