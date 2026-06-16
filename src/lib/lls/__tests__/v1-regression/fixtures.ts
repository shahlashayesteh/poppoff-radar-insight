// Deterministic fixtures for v1 regression. Week-of-Monday is 2026-06-08.
// Day-of-week is ISO (0=Mon..6=Sun).
import type { ShiftRow } from "./v1-pure";

export const WEEK_START = "2026-06-08"; // Monday
export const PREV_WEEK = "2026-06-01";  // Monday of previous week

// 1) Clean week: 3 servers, complete data, mixed OFs.
export const cleanWeek: ShiftRow[] = [
  // Current week
  { server_id: "id:A", server_name: "Alice", shift_date: "2026-06-08", day_of_week: 0, gross_sales: 1000, covers_served: 40, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:A", server_name: "Alice", shift_date: "2026-06-09", day_of_week: 1, gross_sales: 1200, covers_served: 50, labor_cost: 110, opportunity_factor: 1.1 },
  { server_id: "id:A", server_name: "Alice", shift_date: "2026-06-12", day_of_week: 4, gross_sales: 1800, covers_served: 70, labor_cost: 150, opportunity_factor: 1.3 },
  { server_id: "id:B", server_name: "Bob",   shift_date: "2026-06-08", day_of_week: 0, gross_sales:  800, covers_served: 35, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:B", server_name: "Bob",   shift_date: "2026-06-10", day_of_week: 2, gross_sales:  900, covers_served: 40, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:B", server_name: "Bob",   shift_date: "2026-06-13", day_of_week: 5, gross_sales: 1500, covers_served: 60, labor_cost: 140, opportunity_factor: 1.3 },
  { server_id: "id:C", server_name: "Cara",  shift_date: "2026-06-11", day_of_week: 3, gross_sales:  600, covers_served: 25, labor_cost:  90, opportunity_factor: 0.9 },
  { server_id: "id:C", server_name: "Cara",  shift_date: "2026-06-12", day_of_week: 4, gross_sales:  700, covers_served: 30, labor_cost: 100, opportunity_factor: 1.3 },
  { server_id: "id:C", server_name: "Cara",  shift_date: "2026-06-14", day_of_week: 6, gross_sales:  650, covers_served: 28, labor_cost:  95, opportunity_factor: 0.9 },
  // Prior week (drives WoW trend only)
  { server_id: "id:A", server_name: "Alice", shift_date: "2026-06-01", day_of_week: 0, gross_sales:  900, covers_served: 38, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:B", server_name: "Bob",   shift_date: "2026-06-02", day_of_week: 1, gross_sales: 1100, covers_served: 45, labor_cost: 110, opportunity_factor: 1.1 },
  { server_id: "id:C", server_name: "Cara",  shift_date: "2026-06-05", day_of_week: 4, gross_sales:  700, covers_served: 30, labor_cost: 100, opportunity_factor: 1.3 },
];

// 2) Missing-times week: exercises the §4.3 / §4.4 default-start-time + breakfast
//    daypart flaw. Both Alice rows share the canonical row in production (UPSERT
//    collision), but here we already pass the post-collision shape: a single row
//    per (server, date, start_time) — the second import would have OVERWRITTEN
//    the first. Documented as a flaw.
export const missingTimesWeek: ShiftRow[] = [
  // Only the surviving row is present; first import lost.
  { server_id: "id:A", server_name: "Alice", shift_date: "2026-06-08", day_of_week: 0, gross_sales: 1500, covers_served: 60, labor_cost: 150, opportunity_factor: 1.0 },
  // A row missing covers — weekly_rpc denominator is treated as 0 (flaw §6.11)
  { server_id: "id:D", server_name: "Dee",   shift_date: "2026-06-09", day_of_week: 1, gross_sales:  800, covers_served: null, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:D", server_name: "Dee",   shift_date: "2026-06-10", day_of_week: 2, gross_sales:  900, covers_served: 40,   labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:D", server_name: "Dee",   shift_date: "2026-06-11", day_of_week: 3, gross_sales: 1000, covers_served: 45,   labor_cost: 100, opportunity_factor: 1.0 },
];

// 3) Ambiguous-day week: a server with sales-only and labor-only shifts that
//    are SILENTLY EXCLUDED by the worked() filter (flaw §6.1), plus an OF of 0
//    that must fall back to 1.0 (flaw §3 constant default), plus a tiny sample
//    that should trigger lowSample.
export const ambiguousDayWeek: ShiftRow[] = [
  { server_id: "id:E", server_name: "Eve",   shift_date: "2026-06-08", day_of_week: 0, gross_sales: 1000, covers_served: 40, labor_cost: null, opportunity_factor: 1.0 }, // dropped: no labor
  { server_id: "id:E", server_name: "Eve",   shift_date: "2026-06-09", day_of_week: 1, gross_sales: null, covers_served: null, labor_cost: 100, opportunity_factor: 1.0 }, // dropped: no sales
  { server_id: "id:E", server_name: "Eve",   shift_date: "2026-06-10", day_of_week: 2, gross_sales:  500, covers_served: 20, labor_cost: 100, opportunity_factor: 0 },    // OF 0 → 1.0
  { server_id: "id:F", server_name: "Fox",   shift_date: "2026-06-08", day_of_week: 0, gross_sales: 1200, covers_served: 50, labor_cost: 100, opportunity_factor: 1.0 },
  { server_id: "id:F", server_name: "Fox",   shift_date: "2026-06-12", day_of_week: 4, gross_sales: 1300, covers_served: 55, labor_cost: 100, opportunity_factor: 1.3 },
];
