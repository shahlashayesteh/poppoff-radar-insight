import { describe, expect, it } from "vitest";
import {
  adjustedLLS,
  aggregate,
  attachRate,
  avgCheck,
  baseLLS,
  coversPerHour,
  hoursWorked,
  laborCost,
  laborPct,
  leakageAmount,
  leakageRate,
  netSales,
  performanceGap,
  ragBand,
  recoverableOpportunity,
  rpc,
  rph,
  serviceChargePct,
  teamAdjustedLLS,
  teamBaseLLS,
  tipPct,
  trendPct,
  venueBenchmark,
} from "../index";

describe("netSales", () => {
  it("prefers uploaded net_sales", () => {
    const r = netSales({ net_sales: 1000, gross_sales: 1200 });
    expect(r.value).toBe(1000);
    expect(r.basis).toBe("net_sales_source");
    expect(r.provenance).toBe("uploaded");
  });
  it("falls back to gross − leakage with derived basis", () => {
    const r = netSales({ gross_sales: 1200, discounts: 50, comps: 20, voids: 10, refunds: 0 });
    expect(r.value).toBe(1120);
    expect(r.basis).toBe("net_sales_derived");
    expect(r.provenance).toBe("derived");
  });
  it("returns null when nothing is available", () => {
    expect(netSales({}).value).toBeNull();
  });
});

describe("labour cost hierarchy", () => {
  it("prefers fully_loaded over total over wage", () => {
    expect(
      laborCost({ fully_loaded_labor_cost: 500, total_labor_cost: 400, gross_wage_cost: 300 })
        .basis,
    ).toBe("fully_loaded");
    expect(laborCost({ total_labor_cost: 400, gross_wage_cost: 300 }).basis).toBe("total");
    expect(laborCost({ gross_wage_cost: 300, employer_on_cost: 60 }).basis).toBe(
      "wage_plus_oncost",
    );
    expect(laborCost({ gross_wage_cost: 300 }).basis).toBe("wage_only");
    expect(laborCost({ hourly_rate: 15, paid_hours: 8 }).basis).toBe("rate_times_hours");
  });
  it("does not silently promote wage to fully_loaded", () => {
    const r = laborCost({ gross_wage_cost: 300 });
    expect(r.basis).toBe("wage_only");
    expect(r.notes?.[0]).toMatch(/Wage cost only/);
  });
});

describe("hours hierarchy", () => {
  it("prefers paid → actual → clock-derived → scheduled", () => {
    expect(hoursWorked({ paid_hours: 8, actual_hours: 7.5 }).basis).toBe("paid");
    expect(hoursWorked({ actual_hours: 7.5 }).basis).toBe("actual");
    expect(
      hoursWorked({
        clock_in: "2025-01-01T10:00:00Z",
        clock_out: "2025-01-01T18:30:00Z",
        unpaid_break_minutes: 30,
      }).value,
    ).toBeCloseTo(8);
    const sched = hoursWorked({ scheduled_hours: 8 });
    expect(sched.basis).toBe("scheduled");
    expect(sched.provenance).toBe("estimated");
  });
});

describe("productivity", () => {
  const row = { net_sales: 1000, paid_hours: 10, covers: 40, closed_checks: 20, items_sold: 80 };
  it("rph/sph/rpc/avgCheck/coversPerHour/itemsPerCover", () => {
    expect(rph(row).value).toBe(100);
    expect(rpc(row).value).toBe(25);
    expect(avgCheck(row).value).toBe(50);
    expect(coversPerHour(row).value).toBe(4);
  });
  it("laborPct uses fully-loaded when available", () => {
    const r = laborPct({ ...row, fully_loaded_labor_cost: 300 });
    expect(r.value).toBe(0.3);
    expect(r.basis).toContain("fully_loaded");
  });
});

describe("LLS canonical rules", () => {
  const row = { net_sales: 1000, fully_loaded_labor_cost: 250, opportunity_factor: 1.25 };
  it("base = net / labour", () => {
    expect(baseLLS(row).value).toBe(4);
  });
  it("adjusted divides by OF at shift level", () => {
    expect(adjustedLLS(row).value).toBe(3.2);
  });
  it("treats missing/invalid OF as 1.0", () => {
    expect(adjustedLLS({ ...row, opportunity_factor: null }).value).toBe(4);
    expect(adjustedLLS({ ...row, opportunity_factor: 0 }).value).toBe(4);
  });
  it("RPC is NEVER multiplied into LLS", () => {
    const r = adjustedLLS({ ...row, covers: 10 } as never);
    expect(r.value).toBe(3.2);
    expect(r.formula).not.toMatch(/covers|rpc/i);
  });
});

describe("aggregate / team LLS — weighted, OF at shift", () => {
  const rows = [
    { net_sales: 1000, fully_loaded_labor_cost: 200, opportunity_factor: 1.0 }, // base 5,   adj 5
    { net_sales: 500, fully_loaded_labor_cost: 250, opportunity_factor: 1.25 }, // base 2,   adj 1.6
  ];
  it("weighted base team LLS = ΣS/ΣL = 1500/450", () => {
    expect(teamBaseLLS(rows).value).toBeCloseTo(1500 / 450);
  });
  it("adjusted team LLS = ΣS / Σ(L×OF) = 1500 / (200 + 312.5)", () => {
    expect(teamAdjustedLLS(rows).value).toBeCloseTo(1500 / 512.5);
  });
  it("avg-of-avg regression: simple mean of [5, 2] = 3.5 is NOT what we return", () => {
    const weighted = teamBaseLLS(rows).value!;
    expect(weighted).not.toBeCloseTo(3.5);
  });
  it("rejects mixed labour basis by default", () => {
    const mixed = [
      { net_sales: 1000, fully_loaded_labor_cost: 200 },
      { net_sales: 1000, gross_wage_cost: 200 },
    ];
    const r = aggregate(mixed);
    expect(r.laborBasis).toBe("mixed");
    expect(r.baseLLS.value).toBeNull();
  });
  it("allows mixed when explicitly opted in", () => {
    const mixed = [
      { net_sales: 1000, fully_loaded_labor_cost: 200 },
      { net_sales: 1000, gross_wage_cost: 200 },
    ];
    const r = aggregate(mixed, { allowMixedLaborBasis: true });
    expect(r.baseLLS.value).toBeCloseTo(5);
    expect(r.baseLLS.notes?.[0]).toMatch(/Mixed/);
  });
});

describe("benchmark basis guard", () => {
  const rows = [{ net_sales: 1000, gross_wage_cost: 200, opportunity_factor: 1.0 }];
  it("rejects basis-mismatched benchmarks", () => {
    const r = venueBenchmark(rows, { expectedBasis: "fully_loaded" });
    expect(r.value).toBeNull();
    expect(r.notes?.[0]).toMatch(/Basis mismatch/);
  });
  it("returns benchmark when basis matches", () => {
    const r = venueBenchmark(rows, { expectedBasis: "wage_only" });
    expect(r.value).toBeCloseTo(5);
  });
});

describe("gap + RAG bands", () => {
  it("performanceGap returns ratio", () => {
    expect(performanceGap(1.1, 1).value).toBeCloseTo(0.1);
  });
  it("RAG bands match canonical thresholds", () => {
    expect(ragBand(0.11)).toBe("strong");
    expect(ragBand(0.05)).toBe("tracking");
    expect(ragBand(-0.05)).toBe("tracking");
    expect(ragBand(-0.06)).toBe("monitor");
    expect(ragBand(-0.1)).toBe("monitor");
    expect(ragBand(-0.11)).toBe("priority");
    expect(ragBand(null)).toBe("insufficient_data");
  });
});

describe("tips / attach", () => {
  it("tipPct prefers eligible_sales", () => {
    expect(tipPct({ tips: 100, eligible_sales: 1000, net_sales: 800 }).value).toBe(0.1);
  });
  it("tipPct fallback labels approximate", () => {
    const r = tipPct({ tips: 100, net_sales: 800 });
    expect(r.value).toBe(0.125);
    expect(r.notes?.[0]).toMatch(/Approximate/);
  });
  it("serviceChargePct fallback labels approximate", () => {
    const r = serviceChargePct({ service_charge: 50, net_sales: 500 });
    expect(r.notes?.[0]).toMatch(/Approximate/);
  });
  it("attachRate flags approximate when requested", () => {
    const r = attachRate({
      numerator: 10,
      denominator: 40,
      numeratorName: "dessert_items",
      denominatorName: "covers",
      approximate: true,
    });
    expect(r.value).toBe(0.25);
    expect(r.notes?.[0]).toMatch(/Approximate/);
  });
});

describe("leakage / trend / recoverable", () => {
  it("leakage amount + rate", () => {
    const input = { gross_sales: 1000, discounts: 50, comps: 20, voids: 30, refunds: 0 };
    expect(leakageAmount(input).value).toBe(100);
    expect(leakageRate(input).value).toBeCloseTo(0.1);
  });
  it("trendPct", () => {
    expect(trendPct(110, 100).value).toBeCloseTo(0.1);
    expect(trendPct(110, 0).value).toBeNull();
  });
  it("recoverableOpportunity is modelled, labelled, and uses factor", () => {
    const r = recoverableOpportunity(
      [
        { actual_rph: 80, benchmark_rph: 100, hours_worked: 10 },
        { actual_rph: 120, benchmark_rph: 100, hours_worked: 5 }, // negative gap clamped
      ],
      0.5,
    );
    expect(r.value).toBeCloseTo(100); // (20*10)*0.5
    expect(r.provenance).toBe("estimated");
    expect(r.notes?.join(" ")).toMatch(/Modelled/);
  });
});
