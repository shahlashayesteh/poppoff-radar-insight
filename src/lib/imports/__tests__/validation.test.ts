// Phase 6 — Validation tests
import { describe, it, expect } from "vitest";
import { validateRows, type RawImportRow } from "../validation";
import { hashFileContent } from "../hash";

const baseSale = (over: Partial<RawImportRow> = {}): RawImportRow => ({
  server_name: "Alice", shift_date: "2026-06-01", shift_start_time: "17:00:00",
  net_sales: 1000, gross_sales: 1100, covers_served: 40, outlet: "Main",
  revenue_centre: "Bar", sales_basis: "net_after_tax", ...over,
});

describe("validateRows — rejects", () => {
  it("rejects rows missing both server name and id", () => {
    const r = validateRows([baseSale({ server_name: null, server_id: null })], "sales");
    expect(r.summary.rejected).toBe(1);
    expect(r.rows[0].reasons).toContain("missing_server_identity");
  });
  it("rejects rows with no shift_date", () => {
    const r = validateRows([baseSale({ shift_date: null })], "sales");
    expect(r.summary.rejected).toBe(1);
    expect(r.rows[0].reasons).toContain("missing_shift_date");
  });
  it("rejects malformed dates", () => {
    const r = validateRows([baseSale({ shift_date: "06/01/2026" })], "sales");
    expect(r.summary.rejected).toBe(1);
  });
});

describe("validateRows — warnings", () => {
  it("warns when start_time is missing (no silent default)", () => {
    const r = validateRows([baseSale({ shift_start_time: null })], "sales");
    expect(r.summary.warnings).toBe(1);
    expect(r.rows[0].reasons).toContain("missing_start_time");
  });
  it("warns on gross-only (no net) and tags evidence", () => {
    const r = validateRows([baseSale({ net_sales: null })], "sales");
    expect(r.summary.grossOnlyRows).toBe(1);
    expect(r.rows[0].evidence.sales_basis_hint).toBe("gross_used_as_net_estimate");
  });
  it("warns when sales basis is unknown", () => {
    const r = validateRows([baseSale({ sales_basis: null })], "sales");
    expect(r.summary.unknownSalesBasis).toBe(1);
  });
  it("warns when labor basis is unknown", () => {
    const r = validateRows([{ server_name: "B", shift_date: "2026-06-01", shift_start_time: "17:00", labor_cost: 200 }], "labor");
    expect(r.summary.unknownLaborBasis).toBe(1);
  });
  it("warns on missing outlet and revenue centre", () => {
    const r = validateRows([baseSale({ outlet: null, revenue_centre: null })], "sales");
    expect(r.summary.missingOutlet).toBe(1);
    expect(r.summary.missingRevenueCentre).toBe(1);
  });
});

describe("validateRows — duplicates", () => {
  it("flags duplicate rows and links to first occurrence", () => {
    const a = baseSale(); const b = baseSale();
    const r = validateRows([a, b], "sales");
    expect(r.summary.duplicates).toBe(1);
    expect(r.rows[1].duplicateOfIndex).toBe(0);
  });
});

describe("validateRows — totals and basis mode", () => {
  it("computes gross/net/labour/covers totals", () => {
    const r = validateRows([baseSale({ gross_sales: 100, net_sales: 90, covers_served: 5 }), baseSale({ gross_sales: 50, net_sales: 45, covers_served: 3 })], "sales");
    expect(r.totals).toEqual({ gross_total: 150, net_total: 135, labour_total: null, covers_total: 8 });
  });
  it("flags mixed sales basis", () => {
    const r = validateRows([baseSale({ sales_basis: "net_after_tax" }), baseSale({ shift_date: "2026-06-02", sales_basis: "gross_inc_tax" })], "sales");
    expect(r.salesBasis.mode).toBe("mixed");
  });
  it("flags single sales basis", () => {
    const r = validateRows([baseSale(), baseSale({ shift_date: "2026-06-02" })], "sales");
    expect(r.salesBasis.mode).toBe("single");
  });
});

describe("hashFileContent", () => {
  it("is deterministic for the same input", async () => {
    const a = await hashFileContent("hello world");
    const b = await hashFileContent("hello world");
    expect(a).toBe(b);
  });
  it("differs for different inputs", async () => {
    const a = await hashFileContent("hello world");
    const b = await hashFileContent("hello world!");
    expect(a).not.toBe(b);
  });
});
