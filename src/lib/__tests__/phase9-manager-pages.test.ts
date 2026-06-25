// Phase 9 — Manager page upgrade: data-quality / identity-quality / basis /
// provenance surfacing. These tests assert wiring + label correctness via
// file-content checks, plus engine-level guarantees that no manager-only
// component leaks into /server/* routes.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STRIP = "src/components/manager/operations-status-strip.tsx";
const MANAGER_INDEX = "src/routes/manager.index.tsx";
const MANAGER_TEAM = "src/routes/manager.team.tsx";
const MANAGER_SERVER = "src/routes/manager.server.$id.tsx";
const MANAGER_REPORTS = "src/routes/manager.reports.tsx";
const ROUTES_DIR = "src/routes";

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("Phase 9 — Operations status component", () => {
  const body = read(STRIP);

  it("loads imports via the manager-only listImportBatches server fn", () => {
    expect(body).toContain('from "@/lib/imports.functions"');
    expect(body).toContain("listImportBatches");
  });

  it("surfaces import status, pending review and failed batches", () => {
    expect(body).toMatch(/Latest import/i);
    expect(body).toMatch(/pending review/i);
    expect(body).toMatch(/failed/i);
  });

  it("explicitly states that nothing is guaranteed revenue", () => {
    expect(body).toMatch(/guaranteed revenue/i);
    // The sentence must negate the claim, not assert it.
    const sentences = body.match(/[^.]*guaranteed revenue[^.]*\./gi) ?? [];
    expect(sentences.length).toBeGreaterThan(0);
    for (const s of sentences) {
      expect(s.toLowerCase()).toMatch(/nothing|no |not /);
    }
  });

  it("exports a ProvenanceLegend with measured/derived/estimated/modelled", () => {
    expect(body).toMatch(/export function ProvenanceLegend/);
    expect(body).toMatch(/Measured/);
    expect(body).toMatch(/Derived/);
    expect(body).toMatch(/Estimated/);
    expect(body).toMatch(/Modelled/);
  });
});

describe("Phase 9 — Manager pages mount the status strip", () => {
  it("manager dashboard imports and renders OperationsStatusStrip", () => {
    const body = read(MANAGER_INDEX);
    expect(body).toMatch(/from "@\/components\/manager\/operations-status-strip"/);
    expect(body).toMatch(/<OperationsStatusStrip/);
  });

  it("manager team imports and renders OperationsStatusStrip", () => {
    const body = read(MANAGER_TEAM);
    expect(body).toMatch(/from "@\/components\/manager\/operations-status-strip"/);
    expect(body).toMatch(/<OperationsStatusStrip/);
  });

  it("manager individual server page renders ProvenanceLegend", () => {
    const body = read(MANAGER_SERVER);
    expect(body).toMatch(/ProvenanceLegend/);
    expect(body).toMatch(/<ProvenanceLegend/);
  });

  it("manager reports page renders the strip and the basis context block", () => {
    const body = read(MANAGER_REPORTS);
    expect(body).toMatch(/<OperationsStatusStrip/);
    expect(body).toMatch(/Basis & data quality/i);
    expect(body).toMatch(/Sales basis/i);
    expect(body).toMatch(/Labour basis/i);
    expect(body).toMatch(/Confidence/i);
  });
});

describe("Phase 9 — Reports page upgrade", () => {
  const body = read(MANAGER_REPORTS);

  it("adds RPC, WoW sales and WoW RPC columns", () => {
    expect(body).toMatch(/RPC\s*</);
    expect(body).toMatch(/WoW sales/i);
    expect(body).toMatch(/WoW RPC/i);
  });

  it("offers a CSV export", () => {
    expect(body).toMatch(/Export CSV/);
    expect(body).toMatch(/downloadCsv/);
  });

  it("points managers to the LLS workspace for adjusted LLS / RPH trends", () => {
    expect(body).toMatch(/LLS workspace/);
    expect(body).toMatch(/Adjusted LLS/);
    expect(body).toMatch(/RPH/);
  });

  it("frames Historical Shift Match as suggested tests, not rota automation", () => {
    expect(body).toMatch(/Historical Shift Match/);
    expect(body).toMatch(/not rota automation/i);
  });

  it("labels measured vs derived values explicitly", () => {
    expect(body).toMatch(/<em>measured<\/em>/);
    expect(body).toMatch(/<em>derived<\/em>/);
  });
});

describe("Phase 9 — Server routes never import manager-only intelligence", () => {
  const offenders: string[] = [];
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".tsx")) continue;
    if (!(f.startsWith("server.") || f.startsWith("demo.server"))) continue;
    const body = read(join(ROUTES_DIR, f));
    if (
      body.includes("manager/operations-status-strip") ||
      body.includes("OperationsStatusStrip") ||
      body.includes("ProvenanceLegend") ||
      body.includes("scheduling-leverage") ||
      body.includes("SchedulingLeverageMatrix") ||
      body.includes("listImportBatches") ||
      body.includes("getImportBatchDetail") ||
      /Historical Shift Match Intelligence/.test(body) ||
      /Trading Pattern Factor v1/.test(body)
    ) {
      offenders.push(f);
    }
  }

  it("no /server/* or /demo.server* route imports manager-only components or intelligence", () => {
    expect(offenders).toEqual([]);
  });
});
