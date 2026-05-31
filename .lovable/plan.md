# LLS v2 — Surgical Formula Correction

Scope-locked. Touch only the calculation engine, weekly aggregation, benchmark/RAG logic, and labels. No route, upload, RLS, or schema changes beyond the function rewrite + one column comment.

## Naming policy

- DB column `shifts.final_lls` stays (migration safety).
- All user-facing strings, response field names, tooltips, headers, and code comments call it **Adjusted LLS**. "Final LLS" must not appear anywhere user-visible after this change.
- Server response renames the field to `adjusted_lls` so the dashboard never sees `final_lls`.

## 1. Migration — `calculate_lls_for_shift` rewrite

- `rpc = gross_sales / covers_served` (guarded)
- `base_lls = gross_sales / labor_cost` (guarded)
- `adjusted_lls = base_lls / opportunity_factor` (OF defaults to 1.0; guarded)
- Persist `rpc`, `base_lls`, `opportunity_factor`, and write `adjusted_lls` into `shifts.final_lls`.
- `COMMENT ON COLUMN public.shifts.final_lls IS 'Adjusted LLS (kept under legacy name for migration safety)'`.
- `recalculate_lls_for_week` unchanged.
- Hard guard: no `base_lls * rpc` / `base_lls × rpc` / `(base_lls * rpc) / opportunity_factor` anywhere in SQL or TS.

## 2. `src/lib/lls.functions.ts` — `getWeeklyScorecard` rewrite

Same signature, same callers. Aggregation only — no other helpers touched.

Per server (Mon–Sun, worked shifts only):
- `daily[dow].adjusted_lls` — totals method scoped to that day; null when no shift.
- Totals: `total_gross_sales`, `total_covers_served`, `total_labor_cost`, `total_adjusted_labor_cost = Σ(labor_cost × opportunity_factor)`.
- `weekly_rpc = total_gross_sales / total_covers_served`
- `weekly_base_lls = total_gross_sales / total_labor_cost`
- `weekly_adjusted_lls = total_gross_sales / total_adjusted_labor_cost`
- `shifts_worked`

Venue benchmark + gap:
- `venue_benchmark` = venue-wide `weekly_adjusted_lls` for the same week (same totals method across all servers' shifts).
- Code comment above the benchmark computation:
  > v1 benchmark method: venue-wide weekly adjusted LLS for the same week. Stable and simple by design. This will later evolve into a venue-specific historical benchmark segmented by daypart, section, reservation density, covers, spend environment, and service intensity. Do NOT add new tables for that here.
- `performance_gap = weekly_adjusted_lls / venue_benchmark - 1` (null if benchmark missing/zero).
- `rag_status`: `green` if gap ≥ +0.10, `red` if gap ≤ −0.10, else `amber`.
- `operator_meaning`: short string from RAG + gap (e.g. "Outperforming venue benchmark by 11.1%", "Tracking with venue benchmark", "Below venue benchmark by 12.4%").

Existing `lowSample` / "servers to review" outputs kept; switch their threshold comparison to `rag_status`. `lls_green_threshold` / `lls_amber_threshold` columns left in place, unused by LLS dashboard.

## 3. `src/routes/manager.lls.tsx` — labels + columns only

No layout/style changes. Edits:

- Table columns: Server | Mon–Sun daily Adjusted LLS (— when not worked) | Shifts | Weekly RPC | Weekly Base LLS | Weekly Adjusted LLS | Venue Benchmark | Performance Gap | Operator Meaning.
- Row color band driven by `rag_status`.
- Performance Gap formatted `+11.1%` / `−8.4%`.
- Tooltips:
  - RPC — "Gross Sales ÷ Covers Served. Shows how well each server monetises each guest."
  - Base LLS — "Gross Sales ÷ Labor Cost. Shows sales generated for every £1 of labor."
  - Adjusted LLS — "Base LLS ÷ Opportunity Factor. Shows labor return after shift conditions are considered."
  - Performance Gap — "Adjusted LLS compared with the venue benchmark for this shift type."
- OF editor helper text: "Opportunity Factors are venue-specific. A Saturday afternoon can be quiet in one venue and one of the strongest shifts of the week in another. PoppOff benchmarks each server against what this venue normally expects from that type of shift."
- Venue summary strip shows `venue_benchmark` and its WoW trend.
- Purge every remaining "Final LLS" string in this file.

## 4. Sanity tests (must pass before done)

Run via `read_query` after migration deploys:

- Shift `gross_sales=1350, covers=30, labor=75, OF=1.2` → `rpc=45, base_lls=18, adjusted_lls=15`.
- Week totals `gross=6750, covers=150, labor=375, adj_labor=450` → `weekly_rpc=45, weekly_base_lls=18, weekly_adjusted_lls=15`.
- With `venue_benchmark=13.5` → `performance_gap ≈ 0.1111`, displayed `+11.1%`, RAG `green`.

Grep guard: zero occurrences of `base_lls * rpc`, `base_lls × rpc`, `final_lls = (base_lls` in `src/` and `supabase/migrations/`. Zero occurrences of the user-facing string "Final LLS" in `src/`.

## Out of scope

Route structure, nav, upload zones, mapping modal, import/rollback, RLS, OF grid editor UI, `settings.tsx` threshold inputs, server-facing surfaces, threshold columns, new tables.

## Build order

1. Migration — rewrite `calculate_lls_for_shift`; add column comment.
2. `src/lib/lls.functions.ts` — rewrite `getWeeklyScorecard` aggregation, add benchmark/gap/RAG/operator_meaning, rename outgoing field to `adjusted_lls`, add v1-benchmark comment.
3. `src/routes/manager.lls.tsx` — relabel columns, add Benchmark / Gap / Operator Meaning cells, swap row coloring to `rag_status`, update OF helper + tooltips, purge "Final LLS".
4. Sanity tests via `read_query` + grep guard.
