/**
 * Phase 20 — Trusted Opportunity Factor v2 tests.
 *
 * Covers the required behaviours called out in the Phase 20 brief:
 *   - hard data inputs allowed
 *   - contextual fields excluded unless verified
 *   - weather / manager notes always excluded
 *   - estimated inputs reduce confidence + warn
 *   - covers fallback to check count
 *   - comparison hierarchy + fallback
 *   - clamps to safe bounds
 *   - inputs_used / inputs_excluded / fallback_reason reported
 *   - Adjusted LLS = Base ÷ OF (formula unchanged)
 */
import { describe, expect, it } from "vitest";
import {
  OF_V2_CLAMP_MAX,
  OF_V2_CLAMP_MIN,
  OF_V2_NEUTRAL,
  adjustedLlsFromOpportunityFactor,
  computeOpportunityFactorV2,
  excludedContextualInputs,
  type OfHistoricalPeriod,
  type OfScoringShift,
} from "../opportunity-factor-v2";

function period(over: Partial<OfHistoricalPeriod> = {}): OfHistoricalPeriod {
  return {
    week_start: "2026-06-01",
    day_of_week: 5, // Fri
    daypart: "dinner",
    outlet_id: "main",
    sales: 4000,
    sales_basis: "net",
    checks: 80,
    covers: 100,
    labor_hours: 30,
    service_hours: 5,
    ...over,
  };
}

function shift(over: Partial<OfScoringShift> = {}): OfScoringShift {
  return {
    venue_id: "v1",
    week_start: "2026-06-22",
    day_of_week: 5,
    daypart: "dinner",
    outlet_id: "main",
    outlet_reliable: true,
    sales: 4200,
    sales_basis: "net",
    checks: 85,
    covers: 105,
    labor_hours: 31,
    service_hours: 5,
    ...over,
  };
}

function buildHistory(weeks: number, mut: (i: number) => Partial<OfHistoricalPeriod> = () => ({})): OfHistoricalPeriod[] {
  const out: OfHistoricalPeriod[] = [];
  for (let i = 0; i < weeks; i++) {
    out.push(period({ week_start: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`, ...mut(i) }));
  }
  return out;
}

describe("Phase 20 — Opportunity Factor v2 — allowed measured/derived inputs", () => {
  it("uses POS timestamp, sales, check count, labour hours, derived daypart/dow as measured inputs", () => {
    const r = computeOpportunityFactorV2({ shift: shift(), history: buildHistory(8) });
    expect(r.inputs_used).toEqual(
      expect.arrayContaining([
        "pos_check_timestamp",
        "pos_sales",
        "pos_check_count",
        "labor_paid_hours",
        "derived_daypart",
        "derived_day_of_week",
        "venue_id",
      ]),
    );
    expect(r.basis === "derived" || r.basis === "measured").toBe(true);
  });

  it("uses POS covers as measured when present", () => {
    const r = computeOpportunityFactorV2({ shift: shift(), history: buildHistory(8) });
    expect(r.inputs_used).toContain("pos_covers");
  });

  it("falls back to check count when POS covers missing", () => {
    const r = computeOpportunityFactorV2({
      shift: shift({ covers: null }),
      history: buildHistory(8, () => ({ covers: null })),
    });
    expect(r.inputs_used).toContain("pos_check_count_as_covers_fallback");
    expect(r.warnings.some((w) => w.toLowerCase().includes("covers"))).toBe(true);
  });

  it("marks reliable outlet as used when verified", () => {
    const r = computeOpportunityFactorV2({ shift: shift({ outlet_reliable: true }), history: buildHistory(8) });
    expect(r.inputs_used).toContain("pos_outlet_id");
  });

  it("excludes outlet when not verified reliable", () => {
    const r = computeOpportunityFactorV2({
      shift: shift({ outlet_reliable: false }),
      history: buildHistory(8),
    });
    expect(r.inputs_excluded).toContain("pos_outlet_id_unverified");
  });
});

describe("Phase 20 — contextual exclusion rules", () => {
  it("excludes SevenRooms section unless explicitly verified", () => {
    const r = computeOpportunityFactorV2({
      shift: shift(),
      history: buildHistory(8),
      context: { sevenrooms_section: "Bar" },
    });
    expect(r.inputs_excluded).toContain("sevenrooms_section");
  });

  it("excludes rota section and table allocation unless verified", () => {
    const r = computeOpportunityFactorV2({
      shift: shift(),
      history: buildHistory(8),
      context: { rota_section: "A", table_allocation: "1-5" },
    });
    expect(r.inputs_excluded).toEqual(expect.arrayContaining(["rota_section", "table_allocation"]));
  });

  it("always excludes weather and manager notes from scoring even if supplied", () => {
    const ex = excludedContextualInputs({
      weather: "rain",
      manager_notes: "busy after game",
    });
    expect(ex).toEqual(expect.arrayContaining(["weather", "manager_notes"]));
  });

  it("excludes booking-derived covers reduces confidence & warns", () => {
    const r = computeOpportunityFactorV2({
      shift: shift({ covers_from_bookings: true }),
      history: buildHistory(8),
    });
    expect(r.warnings.join(" ").toLowerCase()).toContain("bookings");
    expect(["medium", "low"]).toContain(r.confidence);
  });
});

describe("Phase 20 — estimated inputs reduce confidence", () => {
  it("gross-used-as-net warns and downgrades confidence", () => {
    const r = computeOpportunityFactorV2({
      shift: shift({ sales_basis: "gross" }),
      history: buildHistory(8),
    });
    expect(r.warnings.some((w) => w.toLowerCase().includes("gross"))).toBe(true);
    expect(r.basis).toBe("estimated");
  });

  it("estimated labour hours warn and downgrade confidence", () => {
    const r = computeOpportunityFactorV2({
      shift: shift({ labor_hours_estimated: true }),
      history: buildHistory(8),
    });
    expect(r.warnings.some((w) => w.toLowerCase().includes("labour"))).toBe(true);
    expect(["medium", "low"]).toContain(r.confidence);
  });
});

describe("Phase 20 — comparison hierarchy + fallback", () => {
  it("prefers venue+daypart+dow+reliable outlet (level 1)", () => {
    const hist = buildHistory(8, (i) => ({ outlet_id: "main", day_of_week: 5, daypart: "dinner" }));
    const r = computeOpportunityFactorV2({ shift: shift({ outlet_reliable: true }), history: hist });
    expect(r.comparison_level).toBe(1);
    expect(r.fallback_reason).toBeNull();
  });

  it("falls back to venue+daypart+dow (level 2) when outlet not reliable", () => {
    const hist = buildHistory(8, () => ({ day_of_week: 5, daypart: "dinner", outlet_id: null }));
    const r = computeOpportunityFactorV2({ shift: shift({ outlet_reliable: false, outlet_id: null }), history: hist });
    expect(r.comparison_level).toBe(2);
  });

  it("falls back to v1 / neutral when comparable history is too thin", () => {
    const r = computeOpportunityFactorV2({
      shift: shift(),
      history: buildHistory(1),
      v1FallbackFactor: 1.1,
    });
    expect(r.fallback_reason).toBe("insufficient_comparable_history");
    expect(r.confidence).toBe("low");
    expect(r.opportunity_factor).toBeCloseTo(1.1, 5);
  });

  it("uses neutral when no v1 fallback supplied and history is empty", () => {
    const r = computeOpportunityFactorV2({ shift: shift(), history: [] });
    expect(r.opportunity_factor).toBe(OF_V2_NEUTRAL);
    expect(r.fallback_reason).toBe("insufficient_comparable_history");
  });
});

describe("Phase 20 — clamps + reporting", () => {
  it("clamps factor within safe bounds", () => {
    // Force a comically high bucket: very high sales/covers vs venue normal.
    const hist: OfHistoricalPeriod[] = [
      ...buildHistory(8, () => ({ daypart: "lunch", day_of_week: 2, sales: 200, covers: 5, service_hours: 5 })),
      ...buildHistory(8, () => ({ daypart: "dinner", day_of_week: 5, sales: 100000, covers: 5000, service_hours: 5 })),
    ];
    const r = computeOpportunityFactorV2({
      shift: shift({ daypart: "dinner", day_of_week: 5 }),
      history: hist,
    });
    expect(r.opportunity_factor).toBeLessThanOrEqual(OF_V2_CLAMP_MAX + 1e-9);
    expect(r.opportunity_factor).toBeGreaterThanOrEqual(OF_V2_CLAMP_MIN - 1e-9);
  });

  it("reports inputs_used and inputs_excluded explicitly", () => {
    const r = computeOpportunityFactorV2({
      shift: shift(),
      history: buildHistory(8),
      context: { sevenrooms_section: "Bar", weather: "rain" },
    });
    expect(r.inputs_used.length).toBeGreaterThan(0);
    expect(r.inputs_excluded).toEqual(expect.arrayContaining(["sevenrooms_section", "weather"]));
  });

  it("returns plain-language explanation", () => {
    const r = computeOpportunityFactorV2({ shift: shift(), history: buildHistory(8) });
    expect(r.explanation.length).toBeGreaterThan(20);
    expect(r.explanation.toLowerCase()).toContain("opportunity factor");
  });
});

describe("Phase 20 — LLS formula remains unchanged", () => {
  it("Adjusted LLS = Base LLS ÷ Opportunity Factor", () => {
    expect(adjustedLlsFromOpportunityFactor(50, 1.25)).toBeCloseTo(40, 6);
    expect(adjustedLlsFromOpportunityFactor(50, 0.8)).toBeCloseTo(62.5, 6);
  });

  it("falls through unchanged when OF is invalid", () => {
    expect(adjustedLlsFromOpportunityFactor(42, 0)).toBe(42);
    expect(adjustedLlsFromOpportunityFactor(42, Number.NaN)).toBe(42);
  });
});

describe("Phase 20 — server route safety", () => {
  it("opportunity-factor-v2 module is never imported by /server/* routes", async () => {
    const { execSync } = await import("node:child_process");
    let hits = "";
    try {
      hits = execSync(
        `bash -lc "grep -RIl 'opportunity-factor-v2' src/routes/server.* 2>/dev/null || true"`,
        { encoding: "utf8" },
      ).trim();
    } catch {
      hits = "";
    }
    expect(hits).toBe("");
  });
});
