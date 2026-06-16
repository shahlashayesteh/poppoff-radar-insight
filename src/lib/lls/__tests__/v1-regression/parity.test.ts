// Parity test: runs the REAL production getWeeklyScorecard handler against
// a mocked Supabase client returning the same fixtures used by v1-pure, and
// asserts the pure replica's output matches the production output field-for-
// field on every shared key. This is what protects us from accidentally
// drifting the manually-recreated v1 math away from the real code path.
//
// We deliberately do NOT mock the math: only the data layer (`from().select()
// .eq()....`) is faked. Every calculation runs through the real module.

import { describe, it, expect } from "bun:test";
import { getWeeklyScorecardPure } from "./v1-pure";
import {
  cleanWeek,
  missingTimesWeek,
  ambiguousDayWeek,
  WEEK_START,
} from "./fixtures";
import type { ShiftRow } from "./v1-pure";

// ---- minimal chainable supabase mock ----------------------------------------

type Filter = { col: string; op: string; val: any };

function makeShiftQuery(rows: ShiftRow[]) {
  const filters: Filter[] = [];
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => (filters.push({ col, op: "eq", val }), api),
    gte: (col: string, val: any) => (filters.push({ col, op: "gte", val }), api),
    lt: (col: string, val: any) => (filters.push({ col, op: "lt", val }), api),
    not: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    // terminal: awaited directly via `await query`
    then: (resolve: any) => {
      const filtered = rows.filter((r) =>
        filters.every((f) => {
          if (f.col === "shift_date" && f.op === "gte") return r.shift_date >= f.val;
          if (f.col === "shift_date" && f.op === "lt") return r.shift_date < f.val;
          return true; // venue_id etc. are not in fixtures
        }),
      );
      resolve({ data: filtered, error: null });
    },
  };
  return api;
}

function makeMockSupabase(rows: ShiftRow[]) {
  return {
    from(table: string) {
      if (table === "venues") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: { id: "venue-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "venue_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "shifts") return makeShiftQuery(rows);
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// Reach into the production module and execute the handler directly. The
// server-fn wrapper is bypassed (we provide our own `context`), but every
// line of the actual computation runs unchanged.
async function runProductionHandler(rows: ShiftRow[], weekStart: string) {
  const mod: any = await import("@/lib/lls.functions");
  // createServerFn returns an object exposing the registered handler.
  // We invoke whichever shape the current TanStack Start version exposes.
  const fn = mod.getWeeklyScorecard;
  const ctx = { supabase: makeMockSupabase(rows), userId: "u1", claims: {} };
  // Try the documented call shape first; fall back to internal handler.
  if (typeof fn === "function") {
    try {
      return await fn({ data: { weekStart }, context: ctx });
    } catch {
      /* fall through */
    }
  }
  const handler =
    fn?._handler ?? fn?.handler ?? fn?.__executeServer ?? fn?.serverFn;
  if (typeof handler !== "function") {
    throw new Error("Could not locate production handler for parity test");
  }
  return await handler({ data: { weekStart }, context: ctx });
}

const round = (v: number | null | undefined, dp = 6) =>
  v == null ? null : Math.round((v as number) * 10 ** dp) / 10 ** dp;

const fixtures: Array<{ name: string; rows: ShiftRow[] }> = [
  { name: "cleanWeek", rows: cleanWeek },
  { name: "missingTimesWeek", rows: missingTimesWeek },
  { name: "ambiguousDayWeek", rows: ambiguousDayWeek },
];

describe("v1 — parity (pure replica ≡ production getWeeklyScorecard)", () => {
  for (const fx of fixtures) {
    it(`${fx.name}: venue benchmark + trend match`, async () => {
      const prod = await runProductionHandler(fx.rows, WEEK_START);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      expect(round(prod.venue_benchmark)).toBe(round(pure.venue_benchmark));
      expect(round(prod.venue_benchmark_prev)).toBe(
        round(pure.venue_benchmark_prev),
      );
      expect(round(prod.venue_benchmark_trend_pct, 4)).toBe(
        round(pure.venue_benchmark_trend_pct, 4),
      );
    });

    it(`${fx.name}: per-server totals, RAG, lowSample, daily`, async () => {
      const prod = await runProductionHandler(fx.rows, WEEK_START);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);

      const prodById = new Map(prod.servers.map((s: any) => [s.serverId, s]));
      expect(prod.servers.length).toBe(pure.servers.length);

      for (const ps of pure.servers) {
        const p = prodById.get(ps.serverId);
        expect(p).toBeTruthy();
        expect(p.shifts_worked).toBe(ps.shifts_worked);
        expect(round(p.weekly_rpc)).toBe(round(ps.weekly_rpc));
        expect(round(p.weekly_base_lls)).toBe(round(ps.weekly_base_lls));
        expect(round(p.weekly_adjusted_lls)).toBe(round(ps.weekly_adjusted_lls));
        expect(round(p.performance_gap)).toBe(round(ps.performance_gap));
        expect(p.rag_status).toBe(ps.rag_status);
        expect(p.lowSample).toBe(ps.lowSample);
        for (let dow = 0; dow < 7; dow++) {
          expect(round(p.daily[dow].adjusted_lls)).toBe(
            round(ps.daily[dow].adjusted_lls),
          );
          expect(p.daily[dow].shifts).toBe(ps.daily[dow].shifts);
        }
      }
    });

    it(`${fx.name}: toReview set matches`, async () => {
      const prod = await runProductionHandler(fx.rows, WEEK_START);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      const pSet = new Set(prod.toReview.map((r: any) => r.serverId));
      const uSet = new Set(pure.toReview.map((r) => r.serverId));
      expect([...pSet].sort()).toEqual([...uSet].sort());
    });
  }
});
