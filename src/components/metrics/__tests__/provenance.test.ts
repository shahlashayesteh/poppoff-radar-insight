import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PROVENANCE_LABEL,
  PROVENANCE_DESCRIPTION,
  LABOR_BASIS_LABEL,
  MetricTooltip,
  MetricBasisBadge,
  LaborBasisBadge,
  DataQualityChip,
  ModelledValueLabel,
  SourceFieldPopover,
} from "../metrics";

describe("provenance labels", () => {
  it("covers every Provenance value", () => {
    for (const p of ["uploaded", "derived", "estimated", "defaulted"] as const) {
      expect(PROVENANCE_LABEL[p]).toBeTruthy();
      expect(PROVENANCE_DESCRIPTION[p]).toBeTruthy();
    }
  });

  it("covers every LaborBasis value", () => {
    for (const b of [
      "fully_loaded",
      "total",
      "wage_plus_oncost",
      "wage_only",
      "rate_times_hours",
      "none",
    ] as const) {
      expect(LABOR_BASIS_LABEL[b]).toBeTruthy();
    }
  });

  it("never relabels wage_only as fully loaded", () => {
    expect(LABOR_BASIS_LABEL.wage_only).not.toMatch(/fully loaded/i);
    expect(LABOR_BASIS_LABEL.wage_only).toMatch(/wage cost only/i);
    expect(LABOR_BASIS_LABEL.rate_times_hours).toMatch(/approx|approximation/i);
  });
});

describe("provenance components", () => {
  it("all expected components are exported", () => {
    expect(MetricTooltip).toBeTypeOf("function");
    expect(MetricBasisBadge).toBeTypeOf("function");
    expect(LaborBasisBadge).toBeTypeOf("function");
    expect(DataQualityChip).toBeTypeOf("function");
    expect(ModelledValueLabel).toBeTypeOf("function");
    expect(SourceFieldPopover).toBeTypeOf("function");
  });
});

/**
 * Static guard: server-facing routes must never import labour/LLS engine
 * surfaces or manager-only provenance components.
 *
 * The server dashboard must stay simple and gamified. If this test fails,
 * the offending route is leaking manager intelligence to servers.
 */
describe("server dashboard isolation", () => {
  const routesDir = join(process.cwd(), "src/routes");
  const serverFiles = readdirSync(routesDir).filter(
    (f) => f.startsWith("server.") && f.endsWith(".tsx"),
  );

  const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
    {
      pattern: /from\s+["']@\/lib\/metrics\/(lls|labor|benchmark|gap|server-rag)["']/,
      reason: "imports manager-only engine module",
    },
    { pattern: /from\s+["']@\/lib\/lls\//, reason: "imports LLS internals" },
    {
      pattern: /from\s+["']@\/lib\/lls\.functions["']/,
      reason: "imports LLS server fns",
    },
    {
      pattern: /from\s+["']@\/lib\/server-gap\//,
      reason: "imports manager calculator internals",
    },
    {
      pattern: /\bLaborBasisBadge\b|\blabor[_-]?cost\b|\blabour[_-]?cost\b/i,
      reason: "displays labour cost / LLS basis",
    },
    {
      pattern: /\bLLS\b|adjusted_lls|base_lls/,
      reason: "displays LLS values to servers",
    },
  ];

  for (const file of serverFiles) {
    it(`${file} is free of manager-only intelligence`, () => {
      const src = readFileSync(join(routesDir, file), "utf-8");
      for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        const m = src.match(pattern);
        expect(
          m,
          `${file} leaks manager intelligence (${reason}): "${m?.[0] ?? ""}"`,
        ).toBeNull();
      }
    });
  }
});

describe("manager pages expose provenance", () => {
  const routesDir = join(process.cwd(), "src/routes");
  const REQUIRED_PAGES = [
    "manager.index.tsx",
    "manager.team.tsx",
    "manager.server.$id.tsx",
    "manager.lls.index.tsx",
    "manager.lls.compare.tsx",
    "calculator.server-gap.tsx",
  ];

  for (const file of REQUIRED_PAGES) {
    it(`${file} uses MetricTooltip from @/components/metrics`, () => {
      const src = readFileSync(join(routesDir, file), "utf-8");
      expect(src).toMatch(/@\/components\/metrics/);
      expect(src).toMatch(/MetricTooltip/);
    });
  }

  it("recoverable opportunity is labelled modelled/directional, not guaranteed", () => {
    const src = readFileSync(join(routesDir, "calculator.server-gap.tsx"), "utf-8");
    expect(src).toMatch(/ModelledValueLabel/);
    // never describes recoverable as guaranteed
    expect(src).not.toMatch(/guaranteed\s+(revenue|uplift)/i);
  });

  it("compare page discloses benchmark window basis", () => {
    const src = readFileSync(join(routesDir, "manager.lls.compare.tsx"), "utf-8");
    expect(src).toMatch(/baselineWeeks/);
    expect(src).toMatch(/weighted/);
  });
});
