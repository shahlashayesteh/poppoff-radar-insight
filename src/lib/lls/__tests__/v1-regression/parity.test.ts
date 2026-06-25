// Parity test: invokes the REAL extracted production math
// (`computeWeeklyScorecardFromRows` from src/lib/lls.functions.ts) on the
// same fixtures used by v1-pure, and asserts the pure replica matches the
// production code field-for-field. The server-fn wrapper around the same
// math is a thin data-loading shim (venue lookup + supabase select); the
// formulas under test live entirely inside the extracted pure helper.

import { describe, it, expect } from "vitest";
import { computeWeeklyScorecardFromRows } from "@/lib/lls.functions";
import { getWeeklyScorecardPure } from "./v1-pure";
import {
  cleanWeek,
  missingTimesWeek,
  ambiguousDayWeek,
  WEEK_START,
} from "./fixtures";
import type { ShiftRow } from "./v1-pure";

const round = (v: number | null | undefined, dp = 6) =>
  v == null ? null : Math.round((v as number) * 10 ** dp) / 10 ** dp;

const fixtures: Array<{ name: string; rows: ShiftRow[] }> = [
  { name: "cleanWeek", rows: cleanWeek },
  { name: "missingTimesWeek", rows: missingTimesWeek },
  { name: "ambiguousDayWeek", rows: ambiguousDayWeek },
];

const thresholds = { green: 13.0, amber: 10.0 };

describe("v1 — parity (pure replica ≡ production computeWeeklyScorecardFromRows)", () => {
  for (const fx of fixtures) {
    it(`${fx.name}: venue benchmark + trend match`, () => {
      const prod = computeWeeklyScorecardFromRows(fx.rows as any, WEEK_START, thresholds);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      expect(round(prod.venue_benchmark)).toBe(round(pure.venue_benchmark));
      expect(round(prod.venue_benchmark_prev)).toBe(round(pure.venue_benchmark_prev));
      expect(round(prod.venue_benchmark_trend_pct, 4)).toBe(
        round(pure.venue_benchmark_trend_pct, 4),
      );
    });

    it(`${fx.name}: per-server totals, RAG, lowSample, daily`, () => {
      const prod = computeWeeklyScorecardFromRows(fx.rows as any, WEEK_START, thresholds);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      const prodById = new Map(prod.servers.map((s) => [s.serverId, s]));
      expect(prod.servers.length).toBe(pure.servers.length);

      for (const ps of pure.servers) {
        const p = prodById.get(ps.serverId)!;
        expect(p).toBeTruthy();
        expect(p.shifts_worked).toBe(ps.shifts_worked);
        expect(round(p.weekly_rpc)).toBe(round(ps.weekly_rpc));
        expect(round(p.weekly_base_lls)).toBe(round(ps.weekly_base_lls));
        expect(round(p.weekly_adjusted_lls)).toBe(round(ps.weekly_adjusted_lls));
        expect(round(p.performance_gap)).toBe(round(ps.performance_gap));
        expect(p.rag_status).toBe(ps.rag_status);
        expect(p.lowSample).toBe(ps.lowSample);
        for (let dow = 0; dow < 7; dow++) {
          expect(round(p.daily[dow].adjusted_lls)).toBe(round(ps.daily[dow].adjusted_lls));
          expect(p.daily[dow].shifts).toBe(ps.daily[dow].shifts);
        }
      }
    });

    it(`${fx.name}: toReview set matches`, () => {
      const prod = computeWeeklyScorecardFromRows(fx.rows as any, WEEK_START, thresholds);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      const pSet = new Set(prod.toReview.map((r) => r.serverId));
      const uSet = new Set(pure.toReview.map((r) => r.serverId));
      expect([...pSet].sort()).toEqual([...uSet].sort());
    });

    it(`${fx.name}: server sort order (desc by weekly_adjusted_lls) matches`, () => {
      const prod = computeWeeklyScorecardFromRows(fx.rows as any, WEEK_START, thresholds);
      const pure = getWeeklyScorecardPure(fx.rows, WEEK_START);
      expect(prod.servers.map((s) => s.serverId)).toEqual(
        pure.servers.map((s) => s.serverId),
      );
    });
  }
});
