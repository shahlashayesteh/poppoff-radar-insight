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
  it("warns on missing outlet and revenue centre when other rows declare them (mixed → real signal)", () => {
    const rows = [
      baseSale({ outlet: null, revenue_centre: null }),
      baseSale({ shift_date: "2026-06-02" }), // has outlet + revenue_centre
    ];
    const r = validateRows(rows, "sales");
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

  it("does NOT flag two real shifts on the same date when start_time is missing but amounts differ", () => {
    // Sales POS exports often aggregate per server per day with no start_time.
    // Legacy key collapsed these into "duplicates"; the tiebreaker prevents that.
    const brunch = baseSale({ shift_start_time: null, gross_sales: 400, net_sales: 360, covers_served: 20 });
    const dinner = baseSale({ shift_start_time: null, gross_sales: 900, net_sales: 820, covers_served: 45 });
    const r = validateRows([brunch, dinner], "sales");
    expect(r.summary.duplicates).toBe(0);
  });

  it("DOES still flag true duplicates when start_time is missing and amounts match exactly", () => {
    const a = baseSale({ shift_start_time: null });
    const b = baseSale({ shift_start_time: null });
    const r = validateRows([a, b], "sales");
    expect(r.summary.duplicates).toBe(1);
  });

  it("sales and labour rows for the same server/date never collide", () => {
    const sale = baseSale({ shift_start_time: null });
    const labor: RawImportRow = {
      server_name: "Alice", shift_date: "2026-06-01", shift_start_time: null, labor_cost: 200,
    };
    const sR = validateRows([sale], "sales");
    const lR = validateRows([labor], "labor");
    expect(sR.summary.duplicates).toBe(0);
    expect(lR.summary.duplicates).toBe(0);
  });
});

describe("validateRows — context-warning suppression", () => {
  it("suppresses missing_revenue_centre when no row in the batch declares one and no default is set", () => {
    const rows = [
      baseSale({ revenue_centre: null }),
      baseSale({ revenue_centre: null, shift_date: "2026-06-02" }),
    ];
    const r = validateRows(rows, "sales");
    expect(r.summary.missingRevenueCentre).toBe(0);
    expect(r.rows.every((row) => !row.reasons.includes("missing_revenue_centre"))).toBe(true);
  });

  it("still warns missing_revenue_centre when SOME rows have one (mixed → real signal)", () => {
    const rows = [baseSale({ revenue_centre: "Bar" }), baseSale({ revenue_centre: null, shift_date: "2026-06-02" })];
    const r = validateRows(rows, "sales");
    expect(r.summary.missingRevenueCentre).toBe(1);
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
