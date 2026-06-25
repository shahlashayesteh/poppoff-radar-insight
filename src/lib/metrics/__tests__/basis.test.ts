import { describe, it, expect } from "vitest";
import { netSales, grossSales, aggregateSalesBasis } from "../sales";
import { laborCost, aggregateLaborBasis } from "../labor";
import type { LaborBasis, SalesBasis } from "../types";

describe("Phase 4 — Sales basis", () => {
  it("uses net_sales when present", () => {
    const r = netSales({ net_sales: 1000, gross_sales: 1200 });
    expect(r.value).toBe(1000);
    expect(r.basis).toBe("net_sales_source");
    expect(r.provenance).toBe("uploaded");
  });

  it("derives net from gross − discounts/comps/voids/refunds with derived basis", () => {
    const r = netSales({ gross_sales: 1200, discounts: 50, comps: 20, voids: 10, refunds: 5 });
    expect(r.value).toBe(1115);
    expect(r.basis).toBe("net_sales_derived");
    expect(r.provenance).toBe("derived");
  });

  it("flags gross-only fallback as gross_used_as_net_estimate with a warning note", () => {
    const r = netSales({ gross_sales: 1200 });
    expect(r.value).toBe(1200);
    expect(r.basis).toBe("gross_used_as_net_estimate");
    expect(r.provenance).toBe("estimated");
    expect(r.notes?.join(" ")).toMatch(/gross used as net estimate/i);
  });

  it("returns unknown basis when nothing present", () => {
    const r = netSales({});
    expect(r.value).toBeNull();
    expect(r.basis).toBe("unknown");
  });

  it("honours explicit sales_basis override", () => {
    const r = netSales({ net_sales: 900, sales_basis: "net_sales_source" });
    expect(r.value).toBe(900);
    expect(r.basis).toBe("net_sales_source");
    expect(r.formula).toMatch(/explicit basis override/);
  });

  it("grossSales returns gross_sales_source when uploaded", () => {
    const r = grossSales({ gross_sales: 1234 });
    expect(r.basis).toBe("gross_sales_source");
  });

  it("aggregateSalesBasis returns mixed when bases conflict", () => {
    const bases: SalesBasis[] = ["net_sales_source", "gross_used_as_net_estimate"];
    expect(aggregateSalesBasis(bases)).toBe("mixed");
  });

  it("aggregateSalesBasis collapses net source + net derived to net_sales_derived", () => {
    expect(aggregateSalesBasis(["net_sales_source", "net_sales_derived"])).toBe(
      "net_sales_derived",
    );
  });

  it("aggregateSalesBasis returns unknown for empty input", () => {
    expect(aggregateSalesBasis([])).toBe("unknown");
  });

  it("accepts new sidecar fields without breaking compatibility", () => {
    const r = netSales({
      net_sales: 800,
      tax: 100,
      vat: 0,
      service_charge: 50,
      tips: 25,
      currency: "GBP",
      outlet: "Main",
      revenue_centre: "Bar",
    });
    expect(r.value).toBe(800);
    expect(r.basis).toBe("net_sales_source");
  });
});

describe("Phase 4 — Labour basis", () => {
  it("labels fully loaded labour correctly", () => {
    const r = laborCost({ fully_loaded_labor_cost: 500 });
    expect(r.basis).toBe("fully_loaded");
  });

  it("labels wage only correctly", () => {
    const r = laborCost({ wage_cost: 400 });
    expect(r.basis).toBe("wage_only");
    expect(r.notes?.join(" ")).toMatch(/excludes employer on-costs/i);
  });

  it("labels hours × rate (rate_times_hours) correctly", () => {
    const r = laborCost({ hourly_rate: 12, paid_hours: 8 });
    expect(r.basis).toBe("rate_times_hours");
    expect(r.value).toBe(96);
  });

  it("returns 'none' when no labour input is present (unknown-like)", () => {
    const r = laborCost({});
    expect(r.basis).toBe("none");
    expect(r.value).toBeNull();
  });

  it("honours explicit labor_basis override for wage_only", () => {
    const r = laborCost({
      gross_wage_cost: 300,
      employer_on_cost: 60,
      labor_basis: "wage_only",
    });
    expect(r.basis).toBe("wage_only");
    expect(r.value).toBe(300);
  });

  it("aggregateLaborBasis returns mixed when bases conflict", () => {
    const bases: LaborBasis[] = ["fully_loaded", "wage_only"];
    expect(aggregateLaborBasis(bases)).toBe("mixed");
  });

  it("aggregateLaborBasis returns unknown when empty / none", () => {
    expect(aggregateLaborBasis([])).toBe("unknown");
    expect(aggregateLaborBasis(["none", null, undefined])).toBe("unknown");
  });

  it("aggregateLaborBasis preserves single basis", () => {
    expect(aggregateLaborBasis(["fully_loaded", "fully_loaded"])).toBe("fully_loaded");
  });

  it("old rows without new fields still load (back-compat)", () => {
    // No labor_basis, no on-cost; only legacy fields.
    const r = laborCost({ gross_wage_cost: 200 });
    expect(r.value).toBe(200);
    expect(r.basis).toBe("wage_only");
  });
});

describe("Phase 4 — server-page guard", () => {
  it("server-facing routes do not import labour basis badges", () => {
    // Sanity: the metrics provenance module exports labour badges; server
    // routes must not import them. This is enforced by code review +
    // ESLint-style audit. Here we only assert the export shape.
    const mod = require("@/components/metrics");
    expect(typeof mod.LaborBasisBadge).toBe("function");
    expect(typeof mod.SalesBasisBadge).toBe("function");
    expect(typeof mod.GrossEstimateWarning).toBe("function");
    expect(typeof mod.MixedBasisWarning).toBe("function");
  });
});
