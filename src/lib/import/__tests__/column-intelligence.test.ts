import { describe, expect, it } from "vitest";
import {
  detectColumns,
  tokenizeHeader,
  normalizeHeader,
  resolveForImporter,
  fallbackCalculations,
} from "@/lib/import/column-intelligence";

describe("tokenizeHeader", () => {
  it("strips currency, demo suffix, brackets and splits camelCase", () => {
    expect(tokenizeHeader("FullyLoadedLabourCostEURDemo")).toContain("labor");
    expect(tokenizeHeader("FullyLoadedLabourCostEURDemo")).toContain("cost");
    expect(tokenizeHeader("FullyLoadedLabourCostEURDemo")).toContain("loaded");
    expect(tokenizeHeader("Net Sales (GBP)")).toEqual(["net", "sales"]);
    expect(tokenizeHeader("employee_id_demo")).toEqual(["employee", "id"]);
  });

  it("normalises British/American spellings", () => {
    expect(normalizeHeader("Labour Cost")).toBe(normalizeHeader("Labor Cost"));
    expect(normalizeHeader("Revenue Centre")).toBe(normalizeHeader("Revenue Center"));
  });
});

describe("detectColumns — labour file (UKG/Kronos style)", () => {
  const headers = [
    "EmployeeID",
    "EmployeeName",
    "BusinessDate",
    "ShiftStart",
    "ShiftEnd",
    "PaidHours",
    "HourlyRate",
    "FullyLoadedLabourCostEURDemo",
    "RevenueCentre",
  ];
  const sample = [
    { EmployeeID: "E001", EmployeeName: "Ana", BusinessDate: "2025-06-23",
      ShiftStart: "12:00", ShiftEnd: "20:00", PaidHours: 7.5,
      HourlyRate: 12, FullyLoadedLabourCostEURDemo: 108.5,
      RevenueCentre: "Main Restaurant" },
  ];

  it("maps FullyLoadedLabourCostEURDemo to fully_loaded_labor_cost with high confidence", () => {
    const d = detectColumns(headers, { sampleRows: sample });
    const m = d.mappings.fully_loaded_labor_cost;
    expect(m?.header).toBe("FullyLoadedLabourCostEURDemo");
    expect(m?.confidence).toBe("high");
  });

  it("detects file kind as labor_rota", () => {
    const d = detectColumns(headers, { sampleRows: sample, filename: "ukg_kronos_rota.csv" });
    expect(d.fileKind).toBe("labor_rota");
  });

  it("maps identity, date, times and rate fields", () => {
    const d = detectColumns(headers, { sampleRows: sample });
    expect(d.mappings.employee_id?.header).toBe("EmployeeID");
    expect(d.mappings.server_name?.header).toBe("EmployeeName");
    expect(d.mappings.shift_date?.header).toBe("BusinessDate");
    expect(d.mappings.shift_start_time?.header).toBe("ShiftStart");
    expect(d.mappings.shift_end_time?.header).toBe("ShiftEnd");
    expect(d.mappings.hours_worked?.header).toBe("PaidHours");
    expect(d.mappings.hourly_rate?.header).toBe("HourlyRate");
    expect(d.mappings.revenue_centre?.header).toBe("RevenueCentre");
  });
});

describe("detectColumns — POS server sales (Oracle MICROS style)", () => {
  const headers = ["Server Name", "Business Date", "Covers", "Net Sales (GBP)", "Gross Sales", "Checks"];
  const sample = [
    { "Server Name": "Bea", "Business Date": "2025-06-23", Covers: 12,
      "Net Sales (GBP)": 540.0, "Gross Sales": 600.0, Checks: 4 },
  ];

  it("maps net + gross sales independently", () => {
    const d = detectColumns(headers, { sampleRows: sample });
    expect(d.mappings.net_sales?.header).toBe("Net Sales (GBP)");
    expect(d.mappings.gross_sales?.header).toBe("Gross Sales");
    expect(d.mappings.covers_served?.header).toBe("Covers");
    expect(d.mappings.checks?.header).toBe("Checks");
    expect(d.fileKind).toBe("pos_sales");
  });
});

describe("detectColumns — menu item sales", () => {
  const headers = ["Major Group", "Menu Item", "Quantity Sold", "Item Revenue"];
  const sample = [{ "Major Group": "Wine", "Menu Item": "Malbec", "Quantity Sold": 3, "Item Revenue": 36 }];
  it("recognises menu_item_sales", () => {
    const d = detectColumns(headers, { sampleRows: sample, filename: "menu_item_sales.csv" });
    expect(d.fileKind).toBe("menu_item_sales");
    expect(d.mappings.major_group?.header).toBe("Major Group");
    expect(d.mappings.menu_item?.header).toBe("Menu Item");
    expect(d.mappings.item_revenue?.header).toBe("Item Revenue");
  });
});

describe("resolveForImporter", () => {
  it("does not flag confirmation for high-confidence required fields", () => {
    const headers = ["EmployeeName", "BusinessDate", "FullyLoadedLabourCostEURDemo", "PaidHours"];
    const d = detectColumns(headers);
    const r = resolveForImporter(
      d,
      ["server_name", "shift_date", "fully_loaded_labor_cost"],
      ["hours_worked"],
    );
    expect(r.needsConfirm).toEqual([]);
    expect(r.resolved.fully_loaded_labor_cost).toBe("FullyLoadedLabourCostEURDemo");
  });
});

describe("fallbackCalculations", () => {
  it("derives labor cost from hours × rate", () => {
    expect(fallbackCalculations.laborCost(8, 15)).toBe(120);
    expect(fallbackCalculations.laborCost(null, 15)).toBeNull();
  });
  it("guards against zero / negative denominators", () => {
    expect(fallbackCalculations.salesPerHour(100, 0)).toBeNull();
    expect(fallbackCalculations.baseLls(500, 0)).toBeNull();
  });
});
