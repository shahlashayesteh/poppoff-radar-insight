/**
 * Read-only v1 LLS audit dump.
 *
 * Usage (local):
 *   bun scripts/lls/audit-v1.ts <venueId> <weekStartYYYY-MM-DD>
 *
 * Prints every input feeding the v1 weekly scorecard for the given venue/week:
 * raw shift rows, OF lookups hit/miss, worked()-filter exclusions, benchmark
 * numerator/denominator. Does NOT write to the database.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment of the
 * machine running it (not available in Lovable Cloud; for engineer use).
 */
import { createClient } from "@supabase/supabase-js";
import { getWeeklyScorecardPure, type ShiftRow } from "../../src/lib/lls/__tests__/v1-regression/v1-pure";

function addDaysISO(d: string, days: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  const [venueId, weekStart] = process.argv.slice(2);
  if (!venueId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    console.error("usage: bun scripts/lls/audit-v1.ts <venueId> <YYYY-MM-DD>");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const prevWeekStart = addDaysISO(weekStart, -7);
  const weekEnd = addDaysISO(weekStart, 7);

  const { data: shifts, error } = await supabase
    .from("shifts")
    .select(
      "shift_id, server_id, server_name, shift_date, shift_start_time, shift_end_time, day_of_week, daypart, gross_sales, covers_served, labor_cost, opportunity_factor, sales_batch_id, labor_batch_id",
    )
    .eq("venue_id", venueId)
    .gte("shift_date", prevWeekStart)
    .lt("shift_date", weekEnd);
  if (error) throw error;

  const { data: ofRows } = await supabase
    .from("venue_opportunity_factors")
    .select("day_of_week, daypart, factor")
    .eq("venue_id", venueId);

  console.log("=== AUDIT: venue", venueId, "week", weekStart, "===");
  console.log("Total rows in range:", shifts?.length ?? 0);

  const worked = (r: any) =>
    r.gross_sales != null && Number(r.gross_sales) > 0 && r.labor_cost != null && Number(r.labor_cost) > 0;

  const excluded = (shifts ?? []).filter((r) => !worked(r));
  console.log("\n--- Excluded by worked() filter (silent in production) ---");
  for (const r of excluded) {
    const reason =
      r.gross_sales == null || Number(r.gross_sales) <= 0
        ? "no/zero gross_sales"
        : "no/zero labor_cost";
    console.log(`  ${r.shift_date} ${r.server_name} (${r.server_id}) — ${reason}`);
  }

  const ofMap = new Map<string, number>();
  for (const o of ofRows ?? []) ofMap.set(`${o.day_of_week}|${o.daypart}`, Number(o.factor));
  let ofHits = 0;
  let ofMisses = 0;
  for (const r of shifts ?? []) {
    const k = `${r.day_of_week}|${r.daypart}`;
    if (ofMap.has(k)) ofHits++;
    else ofMisses++;
  }
  console.log(`\nOF grid lookups — hits: ${ofHits}, misses (defaulted to 1.0): ${ofMisses}`);

  const pureRows: ShiftRow[] = (shifts ?? []).map((r) => ({
    server_id: r.server_id,
    server_name: r.server_name ?? "",
    shift_date: r.shift_date,
    day_of_week: r.day_of_week,
    gross_sales: r.gross_sales,
    covers_served: r.covers_served,
    labor_cost: r.labor_cost,
    opportunity_factor: r.opportunity_factor,
  }));
  const sc = getWeeklyScorecardPure(pureRows, weekStart);

  console.log("\n--- Venue benchmark (current week) ---");
  let g = 0;
  let aL = 0;
  for (const r of pureRows) {
    if (!worked(r)) continue;
    if (r.shift_date < weekStart || r.shift_date >= weekEnd) continue;
    const of = r.opportunity_factor && r.opportunity_factor > 0 ? r.opportunity_factor : 1.0;
    g += Number(r.gross_sales);
    aL += Number(r.labor_cost) * of;
  }
  console.log(`  numerator (Σ gross):       ${g.toFixed(2)}`);
  console.log(`  denominator (Σ labor×OF):  ${aL.toFixed(2)}`);
  console.log(`  venue_benchmark:           ${sc.venue_benchmark}`);
  console.log(`  prev-week benchmark:       ${sc.venue_benchmark_prev}`);
  console.log(`  WoW trend %:               ${sc.venue_benchmark_trend_pct}`);

  console.log("\n--- Per-server ---");
  for (const s of sc.servers) {
    console.log(
      `  ${s.serverName} (${s.serverId})  shifts=${s.shifts_worked}  adjLLS=${s.weekly_adjusted_lls}  gap=${s.performance_gap}  rag=${s.rag_status}${s.lowSample ? "  [lowSample]" : ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
