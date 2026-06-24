import { describe, expect, it } from "vitest";
import { __test, type LaborBasis } from "../manager.lls.index";

const LABOR_FIELDS = [
  { key: "server_name" },
  { key: "shift_date" },
  { key: "labor_cost" },
  { key: "hours_worked" },
  { key: "hourly_rate" },
] as const;

describe("manager.lls autoMap — labour cost basis preservation (emergency fix)", () => {
  it("prefers fully_loaded_labor_cost when both columns are present and reports basis = 'fully_loaded'", () => {
    const headers = [
      "Server",
      "Shift Date",
      "Labor Cost",
      "FullyLoadedLabourCostEUR",
      "Hours Worked",
      "Hourly Rate",
    ];
    const { mapping, laborBasis } = __test.autoMap(headers, LABOR_FIELDS as any);
    expect(mapping.labor_cost).toBe("FullyLoadedLabourCostEUR");
    expect(laborBasis satisfies LaborBasis).toBe("fully_loaded");
  });

  it("falls back to wage labor cost when fully loaded is absent and reports basis = 'wage'", () => {
    const headers = ["Server", "Shift Date", "Labor Cost", "Hours Worked", "Hourly Rate"];
    const { mapping, laborBasis } = __test.autoMap(headers, LABOR_FIELDS as any);
    expect(mapping.labor_cost).toBe("Labor Cost");
    expect(laborBasis).toBe("wage");
  });

  it("returns laborBasis = null when no labor cost column is present", () => {
    const headers = ["Server", "Shift Date", "Hours Worked", "Hourly Rate"];
    const { mapping, laborBasis } = __test.autoMap(headers, LABOR_FIELDS as any);
    expect(mapping.labor_cost).toBeUndefined();
    expect(laborBasis).toBeNull();
  });
});
