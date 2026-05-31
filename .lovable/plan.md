# Labor Leverage Score (LLS) — Engine + Manager Dashboard

## Scope

Manager-only LLS feature for Popp Off. POS-agnostic CSV/XLSX ingestion, per-venue Opportunity Factor grid, weekly scorecard. No visual changes outside the four permitted exceptions (router, nav, `venue_settings` extension, `settings.tsx` thresholds).

## Formulas (corrected)

- `rpc = gross_sales / covers_served`
- `base_lls = gross_sales / labor_cost`
- `final_lls = (base_lls × rpc) / opportunity_factor`

All three values are stored per shift. Division-by-zero guarded (null when denominator is 0).

## Database (single migration)

- `shifts` — `shift_id`, `venue_id`, `server_id` (text, synthetic hash when missing), `server_name`, `shift_date`, `shift_start_time`, `shift_end_time`, `daypart`, `day_of_week`, `covers_served`, `gross_sales`, `labor_cost`, `rpc`, `base_lls`, `opportunity_factor`, `final_lls`, `sales_batch_id`, `labor_batch_id`, `created_at`, `updated_at`. Unique `(venue_id, server_id, shift_date, shift_start_time)`.
- `shift_import_batches` — `id`, `venue_id`, `source_type` ('sales'|'labor'), `filename`, `row_count`, `status`, `created_at`, `created_by`. For audit + rollback.
- `venue_column_mappings` — `venue_id`, `source_type`, `mapping` (jsonb). Unique `(venue_id, source_type)`.
- `venue_opportunity_factors` — `venue_id`, `day_of_week` (0–6), `daypart` (5 buckets), `factor` numeric clamped 0.7–1.4. Unique `(venue_id, day_of_week, daypart)`. Fully scoped per venue.
- Extend `venue_settings` with `lls_green_threshold numeric default 13.0`, `lls_amber_threshold numeric default 10.0`.
- Postgres functions:
  - `calculate_lls_for_shift(shift_id)` — applies the three formulas above.
  - `recalculate_lls_for_week(venue_id, week_start)` — re-runs OF lookup + final_lls only, never touches historical weeks.
- RLS: managers full CRUD on their venue rows via `is_venue_manager(venue_id)`; servers NO access. GRANTs to `authenticated` and `service_role`.

## Server functions (`src/lib/lls.functions.ts`)

All `.middleware([requireSupabaseAuth])`, manager-only checks inside handler.

- `parseUploadHeaders({ file, sourceType })` — CSV/TSV via PapaParse, XLSX via `xlsx` package. Returns headers + sample rows.
- `importShifts({ sourceType, mapping, rows })` — validates required fields, two-pass merge: sales rows + labor rows joined on `(server_id, shift_date, shift_start_time)`. Row-level error list. On success, runs `calculate_lls_for_shift` for the batch.
- `rollbackBatch({ batchId })` — deletes batch contribution.
- `saveColumnMapping` / `getColumnMapping` — per venue, per source.
- `getOpportunityFactors({ venueId })` / `updateOpportunityFactor({ venueId, dow, daypart, factor })` — clamps 0.7–1.4 server-side. After update, calls `recalculate_lls_for_week` for the currently displayed week only.
- `getWeeklyScorecard({ venueId, weekStart })` — per server: daily LLS Mon–Sun (color band), shift count, weekly avg, 4-week rolling avg (low-sample flag if `shifts < 3`), WoW trend %, venue weekly avg + trend, "servers to review" list.

## Manager dashboard (`src/routes/manager.lls.tsx`)

New route under existing manager layout. Follows existing manager page visual language. No reuse of server-facing tokens.

Sections:
1. Week picker (ISO Mon start via `src/lib/week.ts`).
2. Upload card — two drag-drop zones (Sales, Labor), column-mapping modal on first upload, saved mapping auto-applied on subsequent uploads with "Edit mapping" link. Per-batch rollback in recent imports list.
3. Weekly scorecard table — Server | Mon–Sun | Shifts | Avg. Color bands from venue thresholds. Subtle "low sample" indicator when `shifts < 3`. Stronger band shade on Avg column.
4. Venue summary strip — weekly avg + WoW trend.
5. "Servers to review" list with reason chips.
6. Opportunity Factor editor — 7×5 grid, inputs clamped 0.7–1.4, persistent notice: *"Changes apply to this week's shifts only. Past weeks keep their original scores."*

## Permitted exceptions (no visual changes elsewhere)

1. Route tree — auto-registered by TanStack file router.
2. `src/components/manager-layout.tsx` — add nav item: `{ to: "/manager/lls", label: "Labor Leverage", icon: Gauge }`.
3. `venue_settings` migration — two threshold columns.
4. `src/routes/settings.tsx` — ONLY add two threshold input fields (green, amber) + minimal save wiring. No restyle, no rearrange, no other edits.

## Dependencies

- `xlsx` (SheetJS) for XLSX/XLS parsing.
- PapaParse for CSV (verify presence in `src/lib/csv.ts` first; add if missing).

## Out of scope (deferred to v2)

Section quality weighting, ML opportunity factors, server-facing LLS, cross-venue benchmarking, multi-week trends beyond WoW, native POS API integrations.

## Build order

1. Migration (DB schema + RLS + GRANTs + Postgres functions with correct formulas).
2. `lls.functions.ts` (parse, import, OF CRUD, scorecard).
3. `manager.lls.tsx` route + sub-components (upload, mapping modal, scorecard, OF editor).
4. Nav item in `manager-layout.tsx`.
5. Two threshold fields in `settings.tsx`.
6. Verify build, sanity-check with sample CSV.
