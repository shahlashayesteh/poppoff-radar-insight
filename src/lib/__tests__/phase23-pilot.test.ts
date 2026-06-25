// Phase 23 — Pilot & Sales Demo Readiness tests.
//
// Covers:
//   - Pilot checklist scoring + status mapping
//   - Measured uplift and modelled opportunity stay separated
//   - Leadership summary uses correct language
//   - Demo journey contains the required steps
//   - Server routes do not import pilot/ROI internals
//   - Manager pilot route enforces paid-manager + venue access
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildPilotPackage,
  buildLeadershipSummary,
  deriveMeasuredUplift,
  deriveModelledOpportunity,
  evaluateChecklist,
  DEMO_JOURNEY,
  PILOT_OFFER,
  REQUIRED_DATA_FILES,
} from "@/lib/pilot/leadership";
import {
  buildRoiReport,
  type RoiShiftRow,
} from "@/lib/roi/calculations";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function mkRow(over: Partial<RoiShiftRow> = {}): RoiShiftRow {
  return {
    shift_date: "2025-01-01",
    gross_sales: 1000,
    labor_cost: 100,
    opportunity_factor: 1,
    covers_served: 50,
    sales_basis: "net",
    labor_basis: "wages_only",
    reliability_class: "measured",
    identity_match_method: "id",
    identity_match_confidence: 1,
    real_hours: 10,
    ...over,
  };
}

function mkRoi(baselineRpc: number, currentRpc: number, n = 30) {
  const baselineRows = Array.from({ length: n }, () =>
    mkRow({ gross_sales: baselineRpc * 50, covers_served: 50, labor_cost: 100 }),
  );
  const currentRows = Array.from({ length: n }, () =>
    mkRow({ gross_sales: currentRpc * 50, covers_served: 50, labor_cost: 100 }),
  );
  return buildRoiReport({ baselineRows, currentRows });
}

describe("Phase 23 — pilot checklist", () => {
  it("flags small sample size as missing", () => {
    const report = mkRoi(20, 18, 5);
    const cl = evaluateChecklist(report.dataQuality, report.movement);
    const sample = cl.groups[0].items.find((i) => i.id === "sample")!;
    expect(sample.status).toBe("missing");
    expect(cl.readinessLevel).toBe("not_ready");
  });

  it("ready when measured, identity resolved, hours present, large sample", () => {
    const report = mkRoi(20, 18, 80);
    const cl = evaluateChecklist(report.dataQuality, report.movement);
    expect(cl.blockingCount).toBe(0);
    expect(cl.readinessLevel === "ready" || cl.readinessLevel === "almost").toBe(true);
  });

  it("required data files list includes POS sales and labour hours", () => {
    const ids = REQUIRED_DATA_FILES.map((i) => i.id);
    expect(ids).toContain("pos_sales");
    expect(ids).toContain("labour_hours");
  });

  it("rota is marked optional / contextual", () => {
    const rota = REQUIRED_DATA_FILES.find((i) => i.id === "rota")!;
    expect(rota.optional).toBe(true);
    expect(rota.detail).toMatch(/optional|context/i);
  });
});

describe("Phase 23 — measured uplift vs modelled opportunity", () => {
  it("measured uplift uses positive movement only", () => {
    const report = mkRoi(20, 22, 40); // current better than baseline
    const u = deriveMeasuredUplift(report.movement);
    expect(u.hasImprovement).toBe(true);
    expect(u.improvementLines.some((l) => /Sales|Revenue per cover/.test(l))).toBe(true);
  });

  it("modelled opportunity is zero when current meets baseline", () => {
    const report = mkRoi(20, 22, 40);
    const m = deriveModelledOpportunity(report);
    expect(m.noGap).toBe(true);
    expect(m.modelledRecoverableRevenuePeriod).toBe(0);
  });

  it("modelled opportunity > 0 when current below baseline", () => {
    const report = mkRoi(22, 18, 40);
    const m = deriveModelledOpportunity(report);
    expect(m.noGap).toBe(false);
    expect(m.modelledRecoverableRevenuePeriod).toBeGreaterThan(0);
  });
});

describe("Phase 23 — leadership summary language", () => {
  const report = mkRoi(22, 18, 40);
  const summary = buildLeadershipSummary({
    venueName: "Test Bistro",
    baselineLabel: "2025-01-01 → 2025-01-28",
    currentLabel: "2025-01-29 → 2025-02-25",
    report,
  });

  it("never uses 'guaranteed revenue' language", () => {
    expect(summary.toLowerCase()).not.toMatch(/guaranteed revenue/);
  });

  it("uses 'modelled' and 'measured' framing", () => {
    expect(summary).toMatch(/[Mm]odelled/);
    expect(summary).toMatch(/[Mm]easured/);
  });

  it("separates measured improvement from modelled opportunity in distinct sections", () => {
    expect(summary).toContain("Measured improvement already achieved");
    expect(summary).toContain("Modelled remaining opportunity");
    const measuredIdx = summary.indexOf("Measured improvement");
    const modelledIdx = summary.indexOf("Modelled remaining");
    expect(measuredIdx).toBeGreaterThan(-1);
    expect(modelledIdx).toBeGreaterThan(measuredIdx);
  });

  it("discloses assumptions and confidence", () => {
    expect(summary).toMatch(/Confidence:/);
    expect(summary).toMatch(/Assumptions/);
    expect(summary).toMatch(/Recoverability factor/);
  });

  it("includes a clear next action", () => {
    expect(summary).toMatch(/Next action/);
  });
});

describe("Phase 23 — buildPilotPackage", () => {
  it("returns checklist, uplift, opportunity and summary", () => {
    const report = mkRoi(22, 20, 40);
    const pkg = buildPilotPackage({
      venueName: "X", baselineLabel: "A", currentLabel: "B", report,
    });
    expect(pkg.checklist).toBeTruthy();
    expect(pkg.measuredUplift).toBeTruthy();
    expect(pkg.modelledOpportunity).toBeTruthy();
    expect(pkg.leadershipSummary.length).toBeGreaterThan(100);
  });
});

describe("Phase 23 — demo journey", () => {
  it("includes the data trust step", () => {
    expect(DEMO_JOURNEY.some((s) => s.category === "trust")).toBe(true);
  });
  it("includes the ROI step", () => {
    expect(DEMO_JOURNEY.some((s) => s.category === "outcome" || s.id === "roi")).toBe(true);
  });
  it("ends with a pilot next step", () => {
    expect(DEMO_JOURNEY[DEMO_JOURNEY.length - 1].category).toBe("pilot");
  });
});

describe("Phase 23 — pilot offer framing", () => {
  it("covers venue, manager, server and leadership audiences", () => {
    expect(PILOT_OFFER.venueProvides.length).toBeGreaterThan(0);
    expect(PILOT_OFFER.managersReceive.length).toBeGreaterThan(0);
    expect(PILOT_OFFER.serversSee.length).toBeGreaterThan(0);
    expect(PILOT_OFFER.leadershipReceives.length).toBeGreaterThan(0);
  });
  it("server-visible items contain no manager or financial intelligence", () => {
    const joined = PILOT_OFFER.serversSee.join(" ").toLowerCase();
    for (const banned of ["roi", "labour basis", "lls", "modelled recoverable", "provenance", "evidence explorer"]) {
      expect(joined).not.toContain(banned);
    }
  });
});

describe("Phase 23 — route guards & server isolation", () => {
  const pilotRoute = read("src/routes/manager.pilot.tsx");

  it("manager pilot route is wrapped in PaidManagerGate", () => {
    expect(pilotRoute).toMatch(/PaidManagerGate/);
  });

  it("manager pilot route requires venue selection via useActiveVenue", () => {
    expect(pilotRoute).toMatch(/useActiveVenue/);
    expect(pilotRoute).toMatch(/NoVenueState/);
  });

  it("manager pilot route verifies paid manager access on the server", () => {
    expect(pilotRoute).toMatch(/useVerifyPaidManagerAccess/);
  });

  it("manager pilot route fetches data via getRoiReport (entitlement+venue enforced server-side)", () => {
    expect(pilotRoute).toMatch(/getRoiReport/);
  });

  it("no /server/* route imports pilot/leadership, roi internals, or trace internals", () => {
    const banned = [
      /from\s+["']@\/lib\/pilot\//,
      /from\s+["']@\/lib\/roi/,
      /from\s+["']@\/lib\/roi\.functions["']/,
      /from\s+["']@\/lib\/manager-data\.functions["']/,
      /from\s+["']@\/lib\/manager-trace\.functions["']/,
      /from\s+["']@\/lib\/entitlements-guard["']/,
    ];
    const files = readdirSync("src/routes").filter((f) => f.startsWith("server.") && f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = read(`src/routes/${f}`);
      for (const re of banned) {
        expect(src, `server route ${f} must not import ${re}`).not.toMatch(re);
      }
    }
  });

  it("/demo/journey is a public page and does not import manager intelligence", () => {
    const j = read("src/routes/demo.journey.tsx");
    expect(j).not.toMatch(/PaidManagerGate|requirePaidManager|manager-data\.functions|roi\.functions/);
  });
});
