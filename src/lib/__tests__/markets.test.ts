import { describe, it, expect } from "vitest";
import {
  MARKETS,
  MARKET_ORDER,
  loadedLabourCost,
  formatMoney,
} from "@/lib/markets";

describe("Phase F.1 — market presets", () => {
  it("UK preset: £, DD/MM, 15% employer on-cost", () => {
    expect(MARKETS.UK.currencySymbol).toBe("£");
    expect(MARKETS.UK.currencyCode).toBe("GBP");
    expect(MARKETS.UK.dateFormat).toBe("uk");
    expect(MARKETS.UK.defaultOnCost).toBe(0.15);
  });

  it("US preset: $, MM/DD, 12% payroll burden assumption", () => {
    expect(MARKETS.US.currencySymbol).toBe("$");
    expect(MARKETS.US.currencyCode).toBe("USD");
    expect(MARKETS.US.dateFormat).toBe("us");
    expect(MARKETS.US.defaultOnCost).toBe(0.12);
    expect(MARKETS.US.onCostLabel).toMatch(/payroll burden/i);
    expect(MARKETS.US.onCostHelper).toMatch(/not federal payroll tax only/i);
  });

  it("Croatia preset: €, DD/MM, 16.5% employer health insurance assumption", () => {
    expect(MARKETS.HR.currencySymbol).toBe("€");
    expect(MARKETS.HR.currencyCode).toBe("EUR");
    expect(MARKETS.HR.dateFormat).toBe("uk"); // DD/MM
    expect(MARKETS.HR.defaultOnCost).toBe(0.165);
    expect(MARKETS.HR.onCostLabel).toMatch(/Croatia employer health insurance/i);
    // Wording rule: never "Euro tax"
    expect(MARKETS.HR.onCostLabel).not.toMatch(/euro tax/i);
    expect(MARKETS.HR.onCostHelper).not.toMatch(/euro tax/i);
    // No hidden minimum-wage default
    expect(MARKETS.HR.wageHint).toMatch(/No minimum-wage default/i);
  });

  it("market order is UK, US, Croatia", () => {
    expect(MARKET_ORDER).toEqual(["UK", "US", "HR"]);
  });
});

describe("Phase F.1 — loaded labour cost formula", () => {
  it("UK: gross × hours × 1.15", () => {
    const v = loadedLabourCost({ rate: 12, hours: 100, onCost: 0.15, basis: "gross_hourly" });
    expect(v).toBeCloseTo(12 * 100 * 1.15, 6); // 1380
  });

  it("US: gross × hours × 1.12", () => {
    const v = loadedLabourCost({ rate: 15, hours: 100, onCost: 0.12, basis: "gross_hourly" });
    expect(v).toBeCloseTo(15 * 100 * 1.12, 6); // 1680
  });

  it("Croatia: gross × hours × 1.165", () => {
    const v = loadedLabourCost({ rate: 8, hours: 100, onCost: 0.165, basis: "gross_hourly" });
    expect(v).toBeCloseTo(8 * 100 * 1.165, 6); // 932
  });

  it("DOUBLE-COUNTING: fully-loaded input is not multiplied again", () => {
    const v = loadedLabourCost({ rate: 14, hours: 100, onCost: 0.165, basis: "fully_loaded" });
    expect(v).toBe(14 * 100); // 1400 — on-cost ignored
  });

  it("gross-hourly basis applies the on-cost once", () => {
    const v = loadedLabourCost({ rate: 14, hours: 100, onCost: 0.165, basis: "gross_hourly" });
    expect(v).toBeCloseTo(14 * 100 * 1.165, 6);
    // sanity: this differs from fully_loaded
    const loaded = loadedLabourCost({ rate: 14, hours: 100, onCost: 0.165, basis: "fully_loaded" });
    expect(v).not.toBe(loaded);
  });
});

describe("Phase F.1 — currency formatting", () => {
  it("UK uses £", () => {
    expect(formatMoney("UK", 1234.5)).toBe("£1,235");
  });
  it("US uses $", () => {
    expect(formatMoney("US", 1234.5)).toBe("$1,235");
  });
  it("Croatia uses €", () => {
    expect(formatMoney("HR", 1234.5)).toBe("€1,235");
  });
  it("respects decimals option", () => {
    expect(formatMoney("HR", 12.5, { decimals: 2 })).toBe("€12.50");
  });
});
