// PURE replica of v1 LLS math, for regression testing only.
// Mirrors src/lib/lls.functions.ts (getWeeklyScorecard, helpers) and the DB
// function calculate_lls_for_shift as defined in
// supabase/migrations/20260531152242_*.sql (current production version).
//
// Documents v1 behaviour INCLUDING KNOWN FLAWS (see docs/lls/v1-frozen-spec.md
// section 6). Do NOT import from production code.

export const DAYPARTS = ["breakfast", "brunch", "lunch", "dinner", "late"] as const;
export type Daypart = (typeof DAYPARTS)[number];

export function dayOfWeekISO(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

export function dayPartFromTime(time: string | null | undefined): Daypart {
  if (!time) return "dinner";
  const h = parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(h)) return "dinner";
  if (h < 10) return "breakfast";
  if (h < 12) return "brunch";
  if (h < 16) return "lunch";
  if (h < 22) return "dinner";
  return "late";
}

export function normalizeDaypart(raw: unknown): Daypart | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s === "breakfast") return "breakfast";
  if (s === "brunch") return "brunch";
  if (s === "lunch") return "lunch";
  if (s === "dinner" || s === "evening") return "dinner";
  if (s === "late" || s === "latenight") return "late";
  return null;
}

export function hashServerId(name: string): string {
  return `name:${name.trim().toLowerCase().replace(/\s+/g, "_")}`;
}

export type ShiftRow = {
  server_id: string;
  server_name: string;
  shift_date: string; // YYYY-MM-DD
  day_of_week: number;
  gross_sales: number | null;
  covers_served: number | null;
  labor_cost: number | null;
  opportunity_factor: number | null;
};

export function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

export function ragFromGap(gap: number | null): "green" | "amber" | "red" | "none" {
  if (gap == null || !Number.isFinite(gap)) return "none";
  if (gap >= 0.1) return "green";
  if (gap <= -0.1) return "red";
  return "amber";
}

// Mirrors DB calculate_lls_for_shift (2026-05-31 1522 version).
// Returns the per-shift cached values. NB: the application never reads these
// at runtime; included only to lock the DB function's contract.
export function calculateLlsForShift(input: {
  gross_sales: number | null;
  covers_served: number | null;
  labor_cost: number | null;
  opportunity_factor: number | null; // from venue_opportunity_factors lookup
}): { rpc: number | null; base_lls: number | null; opportunity_factor: number; final_lls: number | null } {
  let v_of = input.opportunity_factor;
  if (v_of == null || v_of <= 0) v_of = 1.0;

  const v_rpc =
    input.covers_served != null && input.covers_served > 0 && input.gross_sales != null
      ? input.gross_sales / input.covers_served
      : null;

  const v_base =
    input.labor_cost != null && input.labor_cost > 0 && input.gross_sales != null
      ? input.gross_sales / input.labor_cost
      : null;

  const v_final = v_base != null ? v_base / v_of : null;
  return { rpc: v_rpc, base_lls: v_base, opportunity_factor: v_of, final_lls: v_final };
}

export type WeeklyScorecard = {
  weekStart: string;
  venue_benchmark: number | null;
  venue_benchmark_prev: number | null;
  venue_benchmark_trend_pct: number | null;
  servers: Array<{
    serverId: string;
    serverName: string;
    shifts_worked: number;
    weekly_rpc: number | null;
    weekly_base_lls: number | null;
    weekly_adjusted_lls: number | null;
    performance_gap: number | null;
    rag_status: "green" | "amber" | "red" | "none";
    lowSample: boolean;
    daily: Array<{ dow: number; adjusted_lls: number | null; shifts: number }>;
  }>;
  toReview: Array<{ serverId: string; serverName: string; reasons: string[] }>;
};

function addDaysISO(d: string, days: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatGapPct(gap: number | null): string {
  if (gap == null) return "—";
  const pct = gap * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

// Pure replica of getWeeklyScorecard. Takes the same rows the server fn would
// SELECT (current week + prior week). Does NOT touch the DB.
export function getWeeklyScorecardPure(rowsCurrentAndPrev: ShiftRow[], weekStart: string): WeeklyScorecard {
  const weekEnd = addDaysISO(weekStart, 7);
  const prevWeekStart = addDaysISO(weekStart, -7);
  const inCurrent = (d: string) => d >= weekStart && d < weekEnd;
  const inPrev = (d: string) => d >= prevWeekStart && d < weekStart;

  const worked = (r: ShiftRow) =>
    r.gross_sales != null && Number(r.gross_sales) > 0 && r.labor_cost != null && Number(r.labor_cost) > 0;

  type Totals = { gross: number; covers: number; labor: number; adjLabor: number; shifts: number };
  const emptyTotals = (): Totals => ({ gross: 0, covers: 0, labor: 0, adjLabor: 0, shifts: 0 });
  const accumulate = (t: Totals, r: ShiftRow) => {
    const of =
      r.opportunity_factor != null && Number(r.opportunity_factor) > 0 ? Number(r.opportunity_factor) : 1.0;
    t.gross += Number(r.gross_sales);
    t.covers += Number(r.covers_served ?? 0);
    t.labor += Number(r.labor_cost);
    t.adjLabor += Number(r.labor_cost) * of;
    t.shifts += 1;
  };

  const venueCur = emptyTotals();
  const venuePrev = emptyTotals();
  for (const r of rowsCurrentAndPrev) {
    if (!worked(r)) continue;
    if (inCurrent(r.shift_date)) accumulate(venueCur, r);
    else if (inPrev(r.shift_date)) accumulate(venuePrev, r);
  }
  const venue_benchmark = safeDiv(venueCur.gross, venueCur.adjLabor);
  const venue_benchmark_prev = safeDiv(venuePrev.gross, venuePrev.adjLabor);
  const venue_benchmark_trend_pct =
    venue_benchmark != null && venue_benchmark_prev != null && venue_benchmark_prev > 0
      ? ((venue_benchmark - venue_benchmark_prev) / venue_benchmark_prev) * 100
      : null;

  const byServer = new Map<string, { name: string; rows: ShiftRow[] }>();
  for (const r of rowsCurrentAndPrev) {
    if (!inCurrent(r.shift_date) || !worked(r)) continue;
    if (!byServer.has(r.server_id)) byServer.set(r.server_id, { name: r.server_name, rows: [] });
    byServer.get(r.server_id)!.rows.push(r);
  }

  const servers: WeeklyScorecard["servers"] = [];
  for (const [serverId, { name, rows }] of byServer) {
    const daily: WeeklyScorecard["servers"][number]["daily"] = [];
    for (let dow = 0; dow < 7; dow++) {
      const dayRows = rows.filter((r) => r.day_of_week === dow);
      if (!dayRows.length) {
        daily.push({ dow, adjusted_lls: null, shifts: 0 });
        continue;
      }
      const t = emptyTotals();
      dayRows.forEach((r) => accumulate(t, r));
      daily.push({ dow, adjusted_lls: safeDiv(t.gross, t.adjLabor), shifts: t.shifts });
    }

    const t = emptyTotals();
    rows.forEach((r) => accumulate(t, r));
    const weekly_rpc = safeDiv(t.gross, t.covers);
    const weekly_base_lls = safeDiv(t.gross, t.labor);
    const weekly_adjusted_lls = safeDiv(t.gross, t.adjLabor);

    const performance_gap =
      weekly_adjusted_lls != null && venue_benchmark != null && venue_benchmark > 0
        ? weekly_adjusted_lls / venue_benchmark - 1
        : null;
    const rag_status = ragFromGap(performance_gap);

    servers.push({
      serverId,
      serverName: name,
      shifts_worked: t.shifts,
      weekly_rpc,
      weekly_base_lls,
      weekly_adjusted_lls,
      performance_gap,
      rag_status,
      lowSample: t.shifts < 3,
      daily,
    });
  }

  const toReview: WeeklyScorecard["toReview"] = [];
  for (const s of servers) {
    if (s.lowSample) continue;
    const reasons: string[] = [];
    if (s.rag_status === "red") reasons.push(`Below venue benchmark (${formatGapPct(s.performance_gap)})`);
    if (s.shifts_worked > 5 && s.rag_status === "amber" && (s.performance_gap ?? 0) < 0) {
      reasons.push("Heavy week, tracking below benchmark");
    }
    if (reasons.length) toReview.push({ serverId: s.serverId, serverName: s.serverName, reasons });
  }

  servers.sort((a, b) => (b.weekly_adjusted_lls ?? -Infinity) - (a.weekly_adjusted_lls ?? -Infinity));

  return {
    weekStart,
    venue_benchmark,
    venue_benchmark_prev,
    venue_benchmark_trend_pct,
    servers,
    toReview,
  };
}
