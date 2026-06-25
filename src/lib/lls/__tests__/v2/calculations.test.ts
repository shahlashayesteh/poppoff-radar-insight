// LLS v2 — pure-module test suite (Phase 2 + Phase 3).
// These tests cover the deterministic math + decision rules required by the
// approved Phase 2/3 specification. The DB-backed reconciliation engine is
// tested separately in v2/schema-and-safeguards.test.ts (under PGHOST).
import { describe, test, expect } from "vitest";

import { calcShift, calcWeekly, performanceGap, modelledRevenueOpportunity } from "../../v2/calculations";
import { computeOpportunityFactor, durationTierFromHours, filterBaselinePeriods } from "../../v2/opportunity";
import { comparableBenchmark, weeklyExpectedSales } from "../../v2/benchmark";
import { benchmarkConfidence, resultConfidence, ragStatus, lowerBand } from "../../v2/confidence";
import { computeDaypartDistribution } from "../../v2/daypart";
import { aggregatePeriod, attributionStatus } from "../../v2/servicePeriods";
import { resolveIdentity } from "../../v2/identity";
import { classifyDuplicate, rawRowHash } from "../../v2/duplicates";
import { chooseMatch } from "../../v2/matching";
import { rederive } from "../../v2/contribution";
import { buildComparison } from "../../v2/comparison";
import { buildConfigSnapshot, hashConfig, MODEL_VERSION, OF_VERSION } from "../../v2/config";
import type { CanonicalShift, HistoricalPeriod } from "../../v2/types";

const baseShift = (over: Partial<CanonicalShift> = {}): CanonicalShift => ({
  id: "s1", venue_id: "v", identity_id: "i", service_date: "2026-06-10",
  day_of_week: 3, daypart: "dinner", duration_tier: "standard",
  gross_sales: 1000, net_sales: 950, covers: 50, hours_worked: 8, labor_cost: 200,
  cross_daypart: false, status: "active",
  ...over,
});

describe("§6 calcShift", () => {
  test("RPH, RPC, Base, Adjusted LLS", () => {
    const r = calcShift(baseShift(), 1.2, null);
    expect(r.rph).toBe(125);
    expect(r.rpc).toBe(20);
    expect(r.base_lls).toBe(5);
    expect(r.adjusted_labor_cost).toBe(240);
    expect(r.adjusted_lls).toBeCloseTo(1000 / 240);
    expect(r.effective_of).toBe(1.2);
  });
  test("override OF beats system OF", () => {
    const r = calcShift(baseShift(), 1.0, 0.9);
    expect(r.effective_of).toBe(0.9);
    expect(r.adjusted_labor_cost).toBe(180);
  });
  test("missing covers → RPC null but LLS still computed", () => {
    const r = calcShift(baseShift({ covers: null }), 1.0, null);
    expect(r.rpc).toBeNull();
    expect(r.base_lls).toBe(5);
  });
  test("zero labor cost → LLS null", () => {
    const r = calcShift(baseShift({ labor_cost: 0 }), 1.0, null);
    expect(r.base_lls).toBeNull();
    expect(r.adjusted_lls).toBeNull();
  });
});

describe("§7 calcWeekly — weighted totals, never averaged ratios", () => {
  test("weighted weekly aggregation across two shifts", () => {
    const a = baseShift({ id: "a", gross_sales: 1000, hours_worked: 8, labor_cost: 200, covers: 50 });
    const b = baseShift({ id: "b", gross_sales: 500, hours_worked: 5, labor_cost: 150, covers: 30 });
    const w = calcWeekly("i", "v", "2026-06-08", [a, b], () => ({ system_of: 1.2, override_of: null }));
    expect(w.gross_sales).toBe(1500);
    expect(w.labor_cost).toBe(350);
    expect(w.adjusted_labor_cost).toBeCloseTo(420);
    expect(w.weekly_base_lls).toBeCloseTo(1500 / 350);
    expect(w.weekly_adjusted_lls).toBeCloseTo(1500 / 420);
    expect(w.weekly_rpc).toBeCloseTo(1500 / 80);
  });
  test("missing covers on any included shift → weekly RPC null", () => {
    const a = baseShift({ id: "a", covers: 50 });
    const b = baseShift({ id: "b", covers: null });
    const w = calcWeekly("i", "v", "2026-06-08", [a, b], () => ({ system_of: 1.0, override_of: null }));
    expect(w.weekly_rpc).toBeNull();
  });
  test("shifts with zero gross/hours/cost excluded from LLS aggregation", () => {
    const a = baseShift({ id: "a" });
    const b = baseShift({ id: "b", labor_cost: 0 });
    const w = calcWeekly("i", "v", "2026-06-08", [a, b], () => ({ system_of: 1.0, override_of: null }));
    expect(w.shift_count).toBe(1);
  });
});

describe("§5 Opportunity Factor", () => {
  const venue = "v";
  function mkPeriod(over: Partial<HistoricalPeriod> = {}): HistoricalPeriod {
    return {
      venue_id: venue, service_date: "2026-05-01", week_start: "2026-04-27",
      day_of_week: 5, daypart: "dinner", duration_tier: "standard",
      service_hours: 5, gross_sales: 2000, covers: 100, labor_hours: 25, labor_cost: 500,
      attribution_status: "reconciled", duration_source: "pos_first_last",
      ...over,
    };
  }
  test("fewer than 5 comparable periods → System OF = 1.00, Insufficient", () => {
    const base = Array.from({ length: 4 }, (_, i) => mkPeriod({ service_date: `2026-05-0${i + 1}` }));
    const r = computeOpportunityFactor({ day_of_week: 5, daypart: "dinner", duration_tier: "standard" }, base);
    expect(r.system_of).toBe(1.0);
    expect(r.comparable_count).toBe(4);
  });
  test("strong bucket vs venue normal raises OF, clamped at 1.40", () => {
    const strong = Array.from({ length: 40 }, () => mkPeriod({ gross_sales: 5000, covers: 200, labor_hours: 25 }));
    const weak = Array.from({ length: 80 }, () =>
      mkPeriod({ day_of_week: 1, daypart: "lunch", gross_sales: 500, covers: 50, labor_hours: 25, service_hours: 5 }),
    );
    const r = computeOpportunityFactor(
      { day_of_week: 5, daypart: "dinner", duration_tier: "standard" },
      [...strong, ...weak],
    );
    expect(r.comparable_count).toBe(40);
    expect(r.system_of).toBeLessThanOrEqual(1.4);
    expect(r.system_of).toBeGreaterThan(1.0);
  });
  test("weak bucket vs venue normal lowers OF, clamped at 0.75", () => {
    const weak = Array.from({ length: 40 }, () => mkPeriod({ gross_sales: 200, covers: 20 }));
    const strong = Array.from({ length: 80 }, () =>
      mkPeriod({ day_of_week: 1, daypart: "lunch", gross_sales: 5000, covers: 300 }),
    );
    const r = computeOpportunityFactor(
      { day_of_week: 5, daypart: "dinner", duration_tier: "standard" },
      [...weak, ...strong],
    );
    expect(r.system_of).toBeGreaterThanOrEqual(0.75);
    expect(r.system_of).toBeLessThan(1.0);
  });
  test("baseline filters exclude blocked/held/zero-denominator periods and scoring week", () => {
    const periods = [
      mkPeriod({ attribution_status: "blocked" }),
      mkPeriod({ attribution_status: "held_for_review" }),
      mkPeriod({ week_start: "2026-06-08" }),
      mkPeriod({ covers: 0 }),
      mkPeriod(),
    ];
    const filtered = filterBaselinePeriods(periods, "2026-06-08");
    expect(filtered).toHaveLength(1);
  });
  test("duration tier boundaries", () => {
    expect(durationTierFromHours(3.5)).toBe("short");
    expect(durationTierFromHours(4)).toBe("standard");
    expect(durationTierFromHours(6.99)).toBe("standard");
    expect(durationTierFromHours(7)).toBe("long");
  });
});

describe("§8/§9 benchmark, performance gap, modelled opportunity", () => {
  function mkPeriod(over: Partial<HistoricalPeriod> = {}): HistoricalPeriod {
    return {
      venue_id: "v", service_date: "2026-05-01", week_start: "2026-04-27",
      day_of_week: 5, daypart: "dinner", duration_tier: "standard",
      service_hours: 5, gross_sales: 2000, covers: 100, labor_hours: 25, labor_cost: 500,
      attribution_status: "reconciled", duration_source: "pos_first_last",
      ...over,
    };
  }
  test("comparable benchmark", () => {
    const periods = Array.from({ length: 10 }, () => mkPeriod());
    const b = comparableBenchmark({ day_of_week: 5, daypart: "dinner", duration_tier: "standard" }, periods, 1.2);
    expect(b.comparable_gross).toBe(20000);
    expect(b.comparable_labor).toBe(5000);
    expect(b.comparable_adjusted_labor).toBe(6000);
    expect(b.comparable_adjusted_lls).toBeCloseTo(20000 / 6000);
  });
  test("weekly expected sales weighted by adjusted labor and bucket benchmark", () => {
    const shifts = [baseShift({ labor_cost: 200 }), baseShift({ id: "b", labor_cost: 100 })];
    const w = weeklyExpectedSales(shifts, () => ({ effective_of: 1.2, comparable_adjusted_lls: 4 }));
    expect(w.weekly_adjusted_labor_cost).toBe(360);
    expect(w.expected_sales).toBeCloseTo(1440);
    expect(w.weekly_comparable_adjusted_lls).toBeCloseTo(4);
  });
  test("performance gap = adjusted_lls / comparable - 1", () => {
    expect(performanceGap(5, 4)).toBeCloseTo(0.25);
    expect(performanceGap(null, 4)).toBeNull();
    expect(performanceGap(5, 0)).toBeNull();
  });
  test("modelled revenue opportunity floors at zero", () => {
    expect(modelledRevenueOpportunity(1000, 800)).toBe(200);
    expect(modelledRevenueOpportunity(800, 1000)).toBe(0);
  });
});

describe("§10 confidence + §11 RAG", () => {
  test("benchmark confidence: high requires all eight gates", () => {
    expect(
      benchmarkConfidence({
        comparable_periods: 50, weeks_represented: 8, historical_labor_hours: 200,
        historical_covers: 1000, attribution_ok_pct: 0.95, labor_span_fallback_pct: 0.05,
        unresolved_outliers_pct: 0.02,
      }),
    ).toBe("high");
  });
  test("benchmark confidence: missing one high gate falls to medium", () => {
    expect(
      benchmarkConfidence({
        comparable_periods: 25, weeks_represented: 8, historical_labor_hours: 200,
        historical_covers: 1000, attribution_ok_pct: 0.95, labor_span_fallback_pct: 0.05,
        unresolved_outliers_pct: 0.02,
      }),
    ).toBe("medium");
  });
  test("benchmark confidence: insufficient when below low gates", () => {
    expect(
      benchmarkConfidence({
        comparable_periods: 1, weeks_represented: 1, historical_labor_hours: 5,
        historical_covers: 10, attribution_ok_pct: 0, labor_span_fallback_pct: 1,
        unresolved_outliers_pct: 1,
      }),
    ).toBe("insufficient");
  });
  test("result confidence: unresolved identity → insufficient", () => {
    expect(
      resultConfidence({
        valid_shifts: 20, labor_hours: 80, covers: 500, completeness_pct: 1,
        unresolved_identity_conflict: true, unresolved_duplicate: false,
        cross_daypart_pct: 0, has_single_sided_exception: false,
      }),
    ).toBe("insufficient");
  });
  test("result confidence: single-sided exception blocks High", () => {
    expect(
      resultConfidence({
        valid_shifts: 20, labor_hours: 80, covers: 500, completeness_pct: 1,
        unresolved_identity_conflict: false, unresolved_duplicate: false,
        cross_daypart_pct: 0, has_single_sided_exception: true,
      }),
    ).toBe("medium");
  });
  test("final confidence = min(bench, result)", () => {
    expect(lowerBand("high", "low")).toBe("low");
    expect(lowerBand("medium", "high")).toBe("medium");
  });
  test("RAG: directional when final low/insufficient", () => {
    expect(ragStatus(0.3, "low")).toBe("directional");
    expect(ragStatus(0.3, "insufficient")).toBe("directional");
  });
  test("RAG: green/red thresholds at +/- 0.10 under medium/high", () => {
    expect(ragStatus(0.1, "medium")).toBe("green");
    expect(ragStatus(-0.1, "medium")).toBe("red");
    expect(ragStatus(0.05, "high")).toBe("amber");
  });
});

describe("§3 matching", () => {
  test("clean exact-time pair selects best", () => {
    const sales = { staging_id: "s", identity_id: "i", service_date: "d", sales_employee_shift_start: 1000 };
    const r = chooseMatch(sales, [
      { labor: { staging_id: "L1", identity_id: "i", service_date: "d", labor_clock_in: 1000 } },
      { labor: { staging_id: "L2", identity_id: "i", service_date: "d", labor_clock_in: 5000 } },
    ]);
    expect(r.status).toBe("matched");
    expect(r.pick?.staging_id).toBe("L1");
  });
  test("two equally-close labor rows → time_ambiguous (gap < 20)", () => {
    const sales = { staging_id: "s", identity_id: "i", service_date: "d", sales_employee_shift_start: 1000 };
    const r = chooseMatch(sales, [
      { labor: { staging_id: "L1", identity_id: "i", service_date: "d", labor_clock_in: 1000 } },
      { labor: { staging_id: "L2", identity_id: "i", service_date: "d", labor_clock_in: 1100 } },
    ]);
    expect(r.status).toBe("time_ambiguous");
  });
  test("no candidates → unmatched", () => {
    const r = chooseMatch({ staging_id: "s", identity_id: "i", service_date: "d" }, []);
    expect(r.status).toBe("unmatched");
  });
});

describe("§3.10 daypart distribution + cross_daypart", () => {
  const windows = [
    { daypart: "lunch", start_minute: 11 * 60, end_minute: 15 * 60 },
    { daypart: "dinner", start_minute: 17 * 60, end_minute: 23 * 60 },
  ];
  test("clean dinner shift → not cross_daypart", () => {
    const r = computeDaypartDistribution(17 * 60, 22 * 60, windows);
    expect(r.dominant).toBe("dinner");
    expect(r.cross_daypart).toBe(false);
  });
});

describe("§3.7 canonical re-derivation", () => {
  test("only active sources count; inactive ignored", () => {
    const t = rederive([
      { source_kind: "sales", is_active: true, gross_sales: 1000, net_sales: 950, covers: 50 },
      { source_kind: "sales", is_active: false, gross_sales: 99999, covers: 9999 },
      { source_kind: "labor", is_active: true, labor_hours: 8, labor_cost: 200 },
    ]);
    expect(t.gross_sales).toBe(1000);
    expect(t.labor_cost).toBe(200);
    expect(t.hourly_rate).toBe(25);
    expect(t.status).toBe("active");
  });
  test("single-sided → incomplete", () => {
    const t = rederive([{ source_kind: "sales", is_active: true, gross_sales: 100 }]);
    expect(t.status).toBe("incomplete");
  });
});

describe("§3.8 duplicate preservation", () => {
  test("identical hashes flagged as duplicate_candidate, kept in staging", () => {
    const seen = new Set<string>();
    const h = rawRowHash({ a: 1 });
    const a = classifyDuplicate(h, seen);
    const b = classifyDuplicate(h, seen);
    expect(a.duplicate_status).toBe("unique");
    expect(b.duplicate_status).toBe("duplicate_candidate");
    expect(b.excluded_from_canonical).toBe(true);
  });
});

describe("§3.2 identity resolution priority", () => {
  test("employee ID wins over name", () => {
    const r = resolveIdentity({ id: "E1", name: "Anyone" }, {
      byEmployeeId: new Map([["E1", "ID-A"]]),
      confirmedMappings: new Map(),
      aliases: new Map(),
      canonicalByName: new Map([["anyone", "ID-B"]]),
    });
    expect(r.identity_id).toBe("ID-A");
    expect(r.method).toBe("employee_id");
  });
  test("fuzzy never auto-merges; sets pending", () => {
    const r = resolveIdentity({ name: "Jon Smyth" }, {
      byEmployeeId: new Map(),
      confirmedMappings: new Map(),
      aliases: new Map(),
      canonicalByName: new Map(),
      fuzzyCandidate: () => "ID-X",
    });
    expect(r.identity_status).toBe("pending");
  });
  test("no candidate → new_unverified synthetic", () => {
    const r = resolveIdentity({ name: "Nobody" }, {
      byEmployeeId: new Map(),
      confirmedMappings: new Map(),
      aliases: new Map(),
      canonicalByName: new Map(),
    });
    expect(r.identity_status).toBe("new_unverified");
  });
});

describe("§4 service period attribution", () => {
  test("reconciled when deviation within 3%", () => {
    expect(attributionStatus(980, 198, { gross: 1000, covers: 200 }).status).toBe("reconciled");
  });
  test("blocked when deviation > 15%", () => {
    expect(attributionStatus(500, 100, { gross: 1000, covers: 200 }).status).toBe("blocked");
  });
  test("no_control when no control totals", () => {
    expect(attributionStatus(1, 1, null).status).toBe("no_control");
  });
  test("aggregatePeriod sums active shifts only", () => {
    const a = baseShift({ id: "a", status: "active" });
    const b = baseShift({ id: "b", status: "incomplete" });
    const r = aggregatePeriod([a, b]);
    expect(r.gross_sales).toBe(1000);
    expect(r.server_count).toBe(1);
  });
});

describe("§14/§15 feature-flag + comparison + config hash", () => {
  test("buildComparison emits variance codes deterministically", () => {
    const r = buildComparison(
      { weekly_rpc: 20, base_lls: 5, adjusted_lls: 4, benchmark_adjusted_lls: 3.5, performance_gap: 0.14, rag: "green" },
      { weekly_rpc: 20, base_lls: 5, adjusted_lls: 4.5, comparable_adjusted_lls: 4, performance_gap: 0.125, rag: "green",
        benchmark_confidence: "high", result_confidence: "high", final_confidence: "high",
        expected_sales: 1800, modelled_revenue_opportunity: 0 },
      { hadSingleSidedExcluded: true, hadDuplicatesRemoved: true },
    );
    expect(r.variance_explanations).toContain("single_sided_record_excluded");
    expect(r.variance_explanations).toContain("duplicate_removed_from_canonical");
    expect(r.diff_adjusted_lls).toBeCloseTo(0.5);
  });
  test("config hash is stable for identical inputs", () => {
    const s = buildConfigSnapshot(8);
    expect(hashConfig(s)).toBe(hashConfig(s));
    expect(MODEL_VERSION).toMatch(/^lls-v2/);
    expect(OF_VERSION).toMatch(/^of-v2/);
  });
});
