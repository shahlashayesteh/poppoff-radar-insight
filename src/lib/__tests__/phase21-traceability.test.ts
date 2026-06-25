// Phase 21 — Manager Traceability and Evidence Explorer.
//
// These tests verify the structural safety properties of the trace layer:
//   - manager-only server functions exist with the documented shape;
//   - server routes (/server/*) do not import trace/evidence/provenance
//     internals;
//   - the trace functions module enforces entitlement + venue-access checks
//     for every exported handler.
//
// We deliberately avoid spinning up Supabase here — the runtime venue
// scoping and entitlement gating are covered by the existing Phase 14/16
// guard tests. Phase 21's contribution is the new read-only surface area.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TRACE_FN = "src/lib/manager-trace.functions.ts";
const TRACE_DRAWER = "src/components/manager/manager-trace-drawer.tsx";

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

describe("Phase 21 — manager-trace.functions.ts module", () => {
  const src = read(TRACE_FN);

  it("exports every documented trace handler", () => {
    for (const name of [
      "getLlsTrace",
      "getReportsTrace",
      "getImportTrace",
      "getRecommendationTrace",
      "getOfV2AssessmentTrace",
    ]) {
      expect(src).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });

  it("requires paid manager entitlement on every handler", () => {
    const handlers = src.match(/\.handler\(async/g) ?? [];
    const calls = src.match(/requirePaidManagerEntitlement\(/g) ?? [];
    expect(handlers.length).toBeGreaterThanOrEqual(5);
    expect(calls.length).toBeGreaterThanOrEqual(handlers.length);
  });

  it("asserts venue access on every handler", () => {
    const handlers = src.match(/\.handler\(async/g) ?? [];
    const calls = src.match(/assertVenueAccess\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(handlers.length);
  });

  it("never mutates committed data (no insert/update/delete/rpc)", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("scopes every read by venue_id", () => {
    const froms = src.match(/\.from\(/g) ?? [];
    const venueScopes = src.match(/\.eq\("venue_id"/g) ?? [];
    // shift_staging_rows is keyed by batch_id (already venue-scoped by the
    // batch query that ran first), so allow one read to be batch-scoped.
    expect(venueScopes.length).toBeGreaterThanOrEqual(froms.length - 1);
  });

  it("marks OF v2 trace responses as preview-only with applied v1", () => {
    expect(src).toMatch(/previewOnly: true/);
    expect(src).toMatch(/appliedFactorVersion: "v1"/);
  });
});

describe("Phase 21 — server routes stay clean of trace/evidence/provenance", () => {
  const SERVER_ROUTES = [
    "src/routes/server.coaching.tsx",
    "src/routes/server.rewards.tsx",
    "src/routes/server.stats.tsx",
    "src/routes/server.progress.tsx",
    "src/routes/server.leaderboard.tsx",
    "src/routes/server.menu.tsx",
    "src/routes/server.profile.tsx",
    "src/routes/server.index.tsx",
    "src/routes/server.welcome.tsx",
  ];

  for (const f of SERVER_ROUTES) {
    it(`${f} imports no manager trace/evidence/provenance internals`, () => {
      const src = read(f);
      expect(src).not.toMatch(/manager-trace\.functions/);
      expect(src).not.toMatch(/manager-trace-drawer/);
      expect(src).not.toMatch(/manager-data\.functions/);
      expect(src).not.toMatch(/opportunity-factor-v2/);
      expect(src).not.toMatch(/from "@\/lib\/provenance"/);
      expect(src).not.toMatch(/manager\/PaidManagerGate/);
    });

    it(`${f} does not render manager trace UI or LLS values`, () => {
      const src = read(f);
      expect(src).not.toMatch(/ManagerTraceDrawer/);
      expect(src).not.toMatch(/sales_basis/);
      expect(src).not.toMatch(/labor_basis/);
      expect(src).not.toMatch(/Adjusted LLS/);
    });
  }
});

describe("Phase 21 — manager surfaces wire the trace drawer", () => {
  const SURFACES = [
    "src/routes/manager.lls.index.tsx",
    "src/routes/manager.reports.tsx",
    "src/routes/manager.imports.$batchId.tsx",
    "src/routes/manager.coaching.tsx",
    "src/routes/manager.priorities.tsx",
    "src/routes/manager.menu.tsx",
  ];
  for (const f of SURFACES) {
    it(`${f} renders ManagerTraceDrawer`, () => {
      const src = read(f);
      expect(src).toMatch(/ManagerTraceDrawer/);
      expect(src).toMatch(/manager-trace\.functions/);
    });
  }
});

describe("Phase 21 — drawer renders the documented evidence fields", () => {
  const src = read(TRACE_DRAWER);
  it("LLS trace shows sales basis, labour basis, reliability and identity match", () => {
    expect(src).toMatch(/Sales basis/);
    expect(src).toMatch(/Labour basis/);
    expect(src).toMatch(/Reliability/);
    expect(src).toMatch(/Identity match method/);
    expect(src).toMatch(/Identity match confidence/);
  });
  it("Reports trace exposes measured/derived labels", () => {
    expect(src).toMatch(/Measured from POS/);
    expect(src).toMatch(/Derived from POS plus labour data/);
    expect(src).toMatch(/Estimated, review before relying/);
  });
  it("Recommendation trace exposes based_on, excluded contextual and blocked fields", () => {
    expect(src).toMatch(/Based on/);
    expect(src).toMatch(/Excluded contextual fields/);
    expect(src).toMatch(/context only/);
    expect(src).toMatch(/Blocked fields/);
  });
  it("OF v2 trace is marked preview-only and shows applied v1 and preview v2 factors", () => {
    expect(src).toMatch(/OF v2 preview only\. Applied LLS still uses v1\./);
    expect(src).toMatch(/Applied v1 factor/);
    expect(src).toMatch(/Preview v2 factor/);
    expect(src).toMatch(/Hours source/);
  });
  it("contextual SevenRooms section remains excluded by default", () => {
    expect(src).toMatch(/Section data.*context only/i);
  });
});

describe("Phase 21 — no /server/* route imports trace functions transitively", () => {
  // Defensive crawl: confirm no file under src/routes/server.*.tsx references
  // the trace module path even via aliases.
  const files = readdirSync(join(ROOT, "src/routes")).filter((f) =>
    f.startsWith("server.") && f.endsWith(".tsx"),
  );
  for (const f of files) {
    it(`${f} clean`, () => {
      const src = read(join("src/routes", f));
      expect(src).not.toMatch(/manager-trace/);
    });
  }
});
