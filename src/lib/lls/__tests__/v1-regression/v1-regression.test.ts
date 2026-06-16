// V1 LLS regression snapshot. Runs under `bun test`.
// Locks the v1 calculation surface (including the documented FLAWS in
// docs/lls/v1-frozen-spec.md §6). A failing test means v1 behaviour drifted
// and must be re-approved before v2 work proceeds.

import { describe, it, expect } from "bun:test";
import {
  calculateLlsForShift,
  dayPartFromTime,
  hashServerId,
  normalizeDaypart,
  ragFromGap,
  getWeeklyScorecardPure,
} from "./v1-pure";
import { cleanWeek, missingTimesWeek, ambiguousDayWeek, WEEK_START } from "./fixtures";

const round = (v: number | null, dp = 6) =>
  v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp;

describe("v1 — primitive helpers (locked)", () => {
  it("dayPartFromTime — defaults to 'dinner' when null/empty (FLAW: import path defaults to '00:00:00' so 'breakfast' is the reachable default)", () => {
    expect(dayPartFromTime(null)).toBe("dinner");
    expect(dayPartFromTime("")).toBe("dinner");
    expect(dayPartFromTime("00:00:00")).toBe("breakfast");
    expect(dayPartFromTime("09:59")).toBe("breakfast");
    expect(dayPartFromTime("10:00")).toBe("brunch");
    expect(dayPartFromTime("12:00")).toBe("lunch");
    expect(dayPartFromTime("16:00")).toBe("dinner");
    expect(dayPartFromTime("22:00")).toBe("late");
  });

  it("normalizeDaypart — accepts canonical + 'evening' + 'late night'", () => {
    expect(normalizeDaypart("Dinner")).toBe("dinner");
    expect(normalizeDaypart("evening")).toBe("dinner");
    expect(normalizeDaypart("Late Night")).toBe("late");
    expect(normalizeDaypart("")).toBeNull();
    expect(normalizeDaypart(null)).toBeNull();
    expect(normalizeDaypart("happyhour")).toBeNull();
  });

  it("hashServerId — name-only synthetic id (FLAW: no fuzzy, no alias)", () => {
    expect(hashServerId("Alice Smith")).toBe("name:alice_smith");
    expect(hashServerId("  ALICE   SMITH  ")).toBe("name:alice_smith");
  });

  it("ragFromGap — ±10% bands", () => {
    expect(ragFromGap(null)).toBe("none");
    expect(ragFromGap(0.1)).toBe("green");
    expect(ragFromGap(0.099999)).toBe("amber");
    expect(ragFromGap(-0.1)).toBe("red");
    expect(ragFromGap(0)).toBe("amber");
  });
});

describe("v1 — calculate_lls_for_shift (DB function, locked)", () => {
  it("normal row → rpc, base_lls, adjusted final_lls", () => {
    const r = calculateLlsForShift({ gross_sales: 1000, covers_served: 50, labor_cost: 100, opportunity_factor: 1.1 });
    expect(round(r.rpc)).toBe(20);
    expect(round(r.base_lls)).toBe(10);
    expect(r.opportunity_factor).toBe(1.1);
    expect(round(r.final_lls)).toBe(round(10 / 1.1));
  });

  it("OF null or ≤ 0 → fallback 1.0", () => {
    const a = calculateLlsForShift({ gross_sales: 1000, covers_served: 50, labor_cost: 100, opportunity_factor: null });
    const b = calculateLlsForShift({ gross_sales: 1000, covers_served: 50, labor_cost: 100, opportunity_factor: 0 });
    const c = calculateLlsForShift({ gross_sales: 1000, covers_served: 50, labor_cost: 100, opportunity_factor: -0.5 });
    expect(a.opportunity_factor).toBe(1.0);
    expect(b.opportunity_factor).toBe(1.0);
    expect(c.opportunity_factor).toBe(1.0);
    expect(round(a.final_lls)).toBe(10);
  });

  it("missing covers → rpc null; missing labor → base/final null", () => {
    const noCovers = calculateLlsForShift({ gross_sales: 1000, covers_served: 0, labor_cost: 100, opportunity_factor: 1.0 });
    expect(noCovers.rpc).toBeNull();
    expect(round(noCovers.base_lls)).toBe(10);
    expect(round(noCovers.final_lls)).toBe(10);

    const noLabor = calculateLlsForShift({ gross_sales: 1000, covers_served: 50, labor_cost: null, opportunity_factor: 1.0 });
    expect(noLabor.base_lls).toBeNull();
    expect(noLabor.final_lls).toBeNull();
  });
});

describe("v1 — getWeeklyScorecard (clean week, locked)", () => {
  const sc = getWeeklyScorecardPure(cleanWeek, WEEK_START);

  it("venue benchmark = Σ gross / Σ (labor × OF) over worked current-week rows", () => {
    // Hand-computed totals from cleanWeek:
    // gross 1000+1200+1800+800+900+1500+600+700+650 = 9150
    // adjLabor 100*1.0 + 110*1.1 + 150*1.3 + 100*1.0 + 100*1.0 + 140*1.3 + 90*0.9 + 100*1.3 + 95*0.9
    //        = 100 + 121 + 195 + 100 + 100 + 182 + 81 + 130 + 85.5 = 1094.5
    expect(round(sc.venue_benchmark)).toBe(round(9150 / 1094.5));
  });

  it("WoW trend computed from prior week venue benchmark", () => {
    // prior: gross 900+1100+700 = 2700; adjLabor 100+121+130 = 351
    expect(round(sc.venue_benchmark_prev)).toBe(round(2700 / 351));
    expect(sc.venue_benchmark_trend_pct).not.toBeNull();
  });

  it("servers sorted desc by weekly_adjusted_lls", () => {
    const order = sc.servers.map((s) => s.serverId);
    const adj = sc.servers.map((s) => s.weekly_adjusted_lls);
    for (let i = 1; i < adj.length; i++) {
      expect((adj[i - 1] ?? -Infinity) >= (adj[i] ?? -Infinity)).toBe(true);
    }
    expect(order.length).toBe(3);
  });

  it("performance_gap = weekly_adjusted_lls / venue_benchmark − 1; RAG bands at ±10%", () => {
    for (const s of sc.servers) {
      const expected =
        s.weekly_adjusted_lls != null && sc.venue_benchmark
          ? s.weekly_adjusted_lls / sc.venue_benchmark - 1
          : null;
      expect(round(s.performance_gap)).toBe(round(expected));
      expect(s.rag_status).toBe(ragFromGap(s.performance_gap));
    }
  });

  it("daily.adjusted_lls null on no-shift days", () => {
    const alice = sc.servers.find((s) => s.serverId === "id:A")!;
    const noShiftDows = alice.daily.filter((d) => d.shifts === 0);
    for (const d of noShiftDows) expect(d.adjusted_lls).toBeNull();
  });

  it("Alice weekly_adjusted_lls = 4000 / (100+121+195) = 4000/416", () => {
    const alice = sc.servers.find((s) => s.serverId === "id:A")!;
    expect(round(alice.weekly_adjusted_lls)).toBe(round(4000 / 416));
  });
});

describe("v1 — missing-times week (LOCKS DOCUMENTED FLAWS)", () => {
  const sc = getWeeklyScorecardPure(missingTimesWeek, WEEK_START);

  it("FLAW §6.11 — missing covers treated as 0 in weekly_rpc denominator", () => {
    // Dee: 3 shifts, gross 800+900+1000=2700; covers null+40+45 -> coerced 0+40+45=85
    const dee = sc.servers.find((s) => s.serverId === "id:D")!;
    expect(round(dee.weekly_rpc)).toBe(round(2700 / 85));
  });

  it("FLAW §4.3 — only the surviving canonical row remains for Alice (collision)", () => {
    const alice = sc.servers.find((s) => s.serverId === "id:A")!;
    expect(alice.shifts_worked).toBe(1);
  });
});

describe("v1 — ambiguous-day week (LOCKS DOCUMENTED FLAWS)", () => {
  const sc = getWeeklyScorecardPure(ambiguousDayWeek, WEEK_START);

  it("FLAW §6.1 — sales-only and labor-only rows are silently dropped from totals", () => {
    const eve = sc.servers.find((s) => s.serverId === "id:E")!;
    // Eve has 3 raw rows but only 1 is 'worked' (gross 500, labor 100)
    expect(eve.shifts_worked).toBe(1);
    expect(round(eve.weekly_base_lls)).toBe(5);
  });

  it("OF of 0 falls back to 1.0 in the scorecard accumulator", () => {
    const eve = sc.servers.find((s) => s.serverId === "id:E")!;
    expect(round(eve.weekly_adjusted_lls)).toBe(5); // 500 / (100 * 1.0)
  });

  it("FLAW §6.2 — benchmark is self-referential (server's own row contributes)", () => {
    // Fox 2 rows + Eve 1 row contribute to venue totals AND to their own server totals
    // gross 500+1200+1300=3000; adjLabor 100*1 + 100*1 + 100*1.3 = 330
    expect(round(sc.venue_benchmark)).toBe(round(3000 / 330));
  });

  it("lowSample flag set when shifts_worked < 3", () => {
    expect(sc.servers.find((s) => s.serverId === "id:E")!.lowSample).toBe(true);
    expect(sc.servers.find((s) => s.serverId === "id:F")!.lowSample).toBe(true);
  });
});
