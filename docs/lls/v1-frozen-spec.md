# Labor Leverage Score — v1 Frozen Specification

**Status:** Read-only behavioural snapshot of the production v1 LLS engine as of Phase 1 freeze.
**Purpose:** Pin every input, equation, side-effect, default, and known flaw so v2 work cannot silently drift v1 outputs.
**Scope:** `/manager/lls` — UI route, server functions, and the SQL functions invoked from them.
**Non-goals:** This document does NOT define desired v2 behaviour. Several items below are documented **as flaws** and must NOT be treated as the v2 spec.

---

## 1. Code locations (pinned)

| Concern | File | Symbol | Lines (at freeze) |
|---|---|---|---|
| Page route + UI | `src/routes/manager.lls.tsx` | `LlsPage`, `parseFile`, `normalizeDate/Time/Number`, `llsBand`, `bandBg`, `formatGap` | 1–866 |
| Column mapping CRUD | `src/lib/lls.functions.ts` | `getColumnMapping`, `saveColumnMapping` | 64–93 |
| Opportunity Factor CRUD | `src/lib/lls.functions.ts` | `getOpportunityFactors`, `updateOpportunityFactor` | 97–152 |
| Thresholds | `src/lib/lls.functions.ts` | `getLlsThresholds` | 156–170 |
| Import pipeline | `src/lib/lls.functions.ts` | `importShifts` | 188–302 |
| OF suggestions | `src/lib/lls.functions.ts` | `suggestOpportunityFactors` | 306–370 |
| Rollback | `src/lib/lls.functions.ts` | `rollbackBatch` | 372–425 |
| Batches list | `src/lib/lls.functions.ts` | `listRecentBatches` | 427–439 |
| Weekly scorecard | `src/lib/lls.functions.ts` | `getWeeklyScorecard` + helpers `safeDiv`, `ragFromGap`, `formatGapPct`, `operatorMeaningFor` | 479–658 |
| Shift recalculation (DB) | `supabase/migrations/20260531152242_…sql` | `public.calculate_lls_for_shift(uuid)` | 1–53 |
| Week recalculation (DB) | `supabase/migrations/20260531124719_…sql` | `public.recalculate_lls_for_week(uuid, date)` | 188–212 |
| Tables (DB) | `supabase/migrations/20260531124719_…sql` | `shifts`, `shift_import_batches`, `venue_column_mappings`, `venue_opportunity_factors`, `venue_settings.lls_*_threshold` | full file |

Two migrations define `calculate_lls_for_shift`. The **later** one (`20260531152242…`) is authoritative: `final_lls = base_lls / opportunity_factor`. The earlier definition's `(base_lls × rpc) / opportunity_factor` formula is **superseded** and no longer runs in production.

---

## 2. Data model (frozen)

`public.shifts` — one row per (venue, server, date, start time):

| Column | Type | Notes |
|---|---|---|
| `shift_id` | uuid PK | generated |
| `venue_id` | uuid | FK venues |
| `server_id` | text | imported ID if present, else `name:<lowercased_underscored>` (see §4.2) |
| `server_name` | text | last-imported display name |
| `shift_date` | date | required |
| `shift_start_time` | time | **defaulted to `00:00:00` on import when missing** — see §4.3 flaw |
| `shift_end_time` | time | nullable |
| `daypart` | text | `breakfast|brunch|lunch|dinner|late` |
| `day_of_week` | smallint | 0=Mon … 6=Sun |
| `covers_served`, `gross_sales`, `labor_cost` | numeric | nullable |
| `rpc`, `base_lls`, `opportunity_factor`, `final_lls` | numeric | written by `calculate_lls_for_shift`; **`final_lls` holds Adjusted LLS** (legacy column name) |
| `sales_batch_id`, `labor_batch_id` | uuid | FK `shift_import_batches` |
| `created_at`, `updated_at` | timestamptz | |
| **UNIQUE** | `(venue_id, server_id, shift_date, shift_start_time)` | collision risk — see §4.3 |

`public.venue_opportunity_factors` — 7×5 grid per venue, `factor numeric CHECK (0.7…1.4)`, default 1.0. UNIQUE `(venue_id, day_of_week, daypart)`.

`public.venue_settings.lls_green_threshold` (default `13.0`), `lls_amber_threshold` (default `10.0`). **These are display-band thresholds for an absolute Adjusted LLS value; the RAG used on the scorecard is driven by a different metric — see §6.4.**

`public.shift_import_batches` — audit trail per upload; `source_type ∈ {'sales','labor'}`.

`public.venue_column_mappings` — saved per-venue header → field mapping per source type.

---

## 3. Constants and defaults (frozen)

| Constant | Value | Source |
|---|---|---|
| Daypart enum | `breakfast, brunch, lunch, dinner, late` | `DAYPARTS` (functions.ts L7), DB CHECK |
| Day-of-week | 0 = Monday … 6 = Sunday (ISO) | `dayOfWeekISO` (L22–27) |
| Daypart from start hour | <10 breakfast, <12 brunch, <16 lunch, <22 dinner, else late | `dayPartFromTime` (L29–38) |
| Default daypart when start time blank | `dinner` | `dayPartFromTime` (L30) — **flaw, §4.4** |
| Default OF when no row / non-positive | `1.0` | `calculate_lls_for_shift`, `getOpportunityFactors`, scorecard accumulator |
| Default missing start time on import | `'00:00:00'` | `importShifts` L226–228 — **collision risk, §4.3** |
| OF clamp | `[0.7, 1.4]` API / `[0.75, 1.4]` suggestions | `updateOpportunityFactor` L131, `suggestOpportunityFactors` L343 |
| OF suggestion gating | venue must have ≥ 20 worked shifts | `suggestOpportunityFactors` L322–325 |
| OF suggestion per-bucket floor | <5 shifts in bucket → 1.00 | L358–360 |
| OF suggestion confidence weight | ≥200→1.0, ≥100→0.75, ≥50→0.5, else 0.25 | L346–350 |
| OF suggestion rounding | nearest 0.05 | L342 |
| OF suggestion "low confidence" toast | totalCompleted < 50 | L351 |
| Scorecard RAG green | `performance_gap ≥ +0.10` | `ragFromGap` (L484–489) |
| Scorecard RAG red | `performance_gap ≤ -0.10` | same |
| Scorecard RAG amber | strictly between | same |
| Server `lowSample` flag | `shifts_worked < 3` | L632 |
| `toReview` heavy week | `shifts_worked > 5 && rag === 'amber' && gap < 0` | L641–643 |
| Sort order in scorecard | desc by `weekly_adjusted_lls`, `null → -Infinity` | L647 |

---

## 4. Calculation chain (frozen)

### 4.1 File parsing (client)
`parseFile` (route L71–85): `.xlsx/.xls` → `xlsx` sheet 1 to JSON; CSV → PapaParse with header row.
`normalizeDate` accepts Excel serials, `YYYY-M-D`, `D/M/YY(YY)`, else `new Date(s)` (browser-locale risk on unrecognised formats).
`normalizeTime` accepts Excel fractions, or extracts the first `HH:MM` substring; returns `HH:MM:00`.
`normalizeNumber` strips everything but digits/`.`/`-`.

### 4.2 Server identity (import)
`importShifts` L224: `serverId = (r.server_id?.trim() || hashServerId(r.server_name)).slice(0, 200)`.
`hashServerId(name)` (L56–60) returns `name:<trim().toLowerCase().replace(/\s+/g,'_')>` — **deterministic synthetic id from name only; no fuzzy matching, no alias table consulted.**

### 4.3 Start-time defaulting and unique-key collision (FLAW — preserved in v1)
L226–228: when `shift_start_time` is missing or shorter than 5 chars, it is set to `'00:00:00'`. Two distinct shifts on the same date for the same server, both with missing start times, collapse into a single canonical row under the UNIQUE key `(venue_id, server_id, shift_date, shift_start_time)`. The second import does an UPDATE on the first row, silently overwriting it. **Documented as a known flaw — do not rely on this behaviour for v2.**

### 4.4 Daypart inference (FLAW — preserved in v1)
`normalizeDaypart(r.daypart) ?? dayPartFromTime(startTime)` (L230). When the file has no daypart column AND the start time was defaulted to `'00:00:00'` (§4.3), the daypart silently becomes `breakfast` (hour `0 < 10`). When start time is truly absent in the row but daypart column exists, the uploaded value wins. **Documented as a known flaw.**

### 4.5 Per-shift recalculation (DB)
After every import, `importShifts` L292–294 calls `calculate_lls_for_shift(shift_id)` for every touched shift. The current production function body (`20260531152242…sql`):

```
v_of  := factor from venue_opportunity_factors(venue, dow, daypart)   default 1.0 (also when ≤ 0)
v_rpc := gross_sales / covers_served                                  (NULL unless covers_served > 0 AND gross_sales NOT NULL)
v_base:= gross_sales / labor_cost                                      (NULL unless labor_cost > 0 AND gross_sales NOT NULL)
v_adj := v_base / v_of                                                 (NULL when v_base NULL)
UPDATE shifts SET rpc=v_rpc, base_lls=v_base, opportunity_factor=v_of, final_lls=v_adj
```

`shifts.final_lls` therefore stores per-shift **Adjusted LLS** despite the legacy column name. Comment on column confirms this.

### 4.6 Per-week recalculation (DB)
`recalculate_lls_for_week(venue, week_start)` loops over `shift_date ∈ [week_start, week_start + 7)` and re-runs `calculate_lls_for_shift` for each row. Invoked only from `updateOpportunityFactor` (functions.ts L146–149).

### 4.7 Weekly scorecard (server fn, **authoritative for the UI**)
`getWeeklyScorecard(weekStart)` does **not** read `shifts.final_lls`, `base_lls`, or `rpc`. It reads only the raw inputs + the per-shift `opportunity_factor` cached column. Steps:

1. Range pulled: `shift_date ∈ [week_start − 7d, week_start + 7d)` — current week + prior week (prior week only feeds the venue-benchmark WoW trend).
2. "Worked" filter: `gross_sales != null AND > 0 AND labor_cost != null AND > 0`. Rows missing either side are silently excluded (no warning surfaced — **§6.1**).
3. Accumulator per row: `of = max(opportunity_factor || 1.0, 0 falls back to 1.0); gross += gross_sales; covers += covers_served ?? 0; labor += labor_cost; adjLabor += labor_cost × of; shifts += 1`.
4. Venue benchmark (current week): `venue_benchmark = Σ_gross / Σ_adjLabor` over all worked shifts in the venue this week — **self-referential, §6.2**.
5. Prior-week venue benchmark computed identically over prior-week worked rows.
6. WoW trend pct: `((cur − prev) / prev) × 100` when both > 0, else `null`.
7. Per server, grouped by `server_id`:
   - Per day (dow 0..6): `daily_adjusted_lls = Σ_gross_day / Σ_adjLabor_day` (null when no shifts that day).
   - Weekly totals: `weekly_rpc = Σg/Σcovers`, `weekly_base_lls = Σg/Σlabor`, `weekly_adjusted_lls = Σg/ΣadjLabor`.
   - `performance_gap = weekly_adjusted_lls / venue_benchmark − 1` when both > 0, else null.
   - `rag_status = ragFromGap(performance_gap)` (≥+10% green, ≤−10% red, else amber, null → none).
   - `lowSample = shifts_worked < 3`.
8. `toReview` list: skip lowSample; add reason "Below venue benchmark (xx%)" when red; add "Heavy week, tracking below benchmark" when `shifts_worked > 5 && rag === 'amber' && gap < 0`.
9. Servers sorted desc by `weekly_adjusted_lls` (nulls last).

`safeDiv(num, den)` returns null when `den ≤ 0` or either operand non-finite.

### 4.8 OF suggestions (`suggestOpportunityFactors`)
Reads all `shifts` for venue with `gross_sales NOT NULL`, then filters to `> 0` as "worked". Computes `venueAvg = Σ_gross / Σ_n`, then per (dow, daypart) bucket `raw = bucket_mean_gross / venueAvg`, smooths `smoothed = 1 + (raw − 1) × confidenceWeight`, clamps to `[0.75, 1.4]`, rounds to nearest 0.05. **Self-referential: gross sales used to estimate the factor that will then divide that gross sales' labor.** Documented for v2.

### 4.9 OF update + recalc
`updateOpportunityFactor` clamps to `[0.7, 1.4]`, upserts, then calls `recalculate_lls_for_week` for the displayed week only. Historical weeks are not touched.

### 4.10 Rollback
`rollbackBatch` clears the per-source columns on shifts that reference the batch, deletes shift rows where both batch ids are now null, and deletes the batch row. **Does not recompute `final_lls` for shifts that retained one side** — leaves stale `final_lls` values until the next recalc trigger. Documented for v2.

---

## 5. UI surfaces driven by the scorecard
- "Venue Benchmark" card → `scorecard.venue_benchmark`
- "Benchmark WoW Trend" card → `scorecard.venue_benchmark_trend_pct`
- "Servers Tracked" card → `scorecard.servers.length`
- Per-server table → `weekly_adjusted_lls`, `performance_gap`, `rag_status`, `operator_meaning`
- Daily heat-row → `daily[dow].adjusted_lls`
- "To review" panel → `toReview`
- OF grid → `getOpportunityFactors.grid`
- `llsBand(value, thresholds)` (route L129–134) compares an **absolute** Adjusted LLS value against `lls_green_threshold` / `lls_amber_threshold`. **This bander is used for display chip colouring elsewhere on the page; the scorecard's primary RAG is `ragFromGap` based on the ±10% gap, NOT these thresholds.** — see §6.4.

---

## 6. Known v1 flaws (preserved by Phase 1 — do NOT carry into v2)

1. **Silent `worked()` exclusions** (functions.ts L552–554). Any shift missing either sales or labor is dropped without counting or surfacing to the manager.
2. **Self-referential venue benchmark** (L572–584). Servers are compared to an average they themselves contribute to in the same week.
3. **Start-time collision** (L226–228 + UNIQUE constraint). Two same-day shifts for the same server with no start time UPSERT onto each other.
4. **Two divergent banding systems**. `lls_*_threshold` (default 13.0 / 10.0) bands an **absolute** Adjusted LLS, while the scorecard RAG bands a **relative gap** (±10%). Both are exposed in the UI but answer different questions.
5. **Synthetic identity minted from name only** (`hashServerId`). No fuzzy match, no alias table, no manager confirmation; name changes spawn a second canonical server silently.
6. **Daypart `dinner` fallback** when start time is missing AND no daypart column — combined with `'00:00:00'` defaulting, produces `breakfast` for those rows instead.
7. **OF suggestion is self-referential** (gross sales drives both numerator and denominator).
8. **Per-shift cached columns drift after rollback** (`final_lls`/`base_lls` not recomputed when one source removed).
9. **`opportunity_factor` cached on shift row** can lag the OF grid until `updateOpportunityFactor` triggers `recalculate_lls_for_week`. The scorecard reads this cached column, so newly imported weeks reflect whichever OF was current at the moment of `calculate_lls_for_shift`.
10. **Daypart inference disregards shift end time** — only the start hour is bucketed; cross-daypart shifts collapse to a single bucket.
11. **`covers += covers_served ?? 0`** silently treats missing covers as 0, distorting `weekly_rpc`.
12. **No POS control totals** — venue-level revenue not reconciled with sum of server-attributed revenue.
13. **Service duration not modelled** — there is no notion of true open/close times; only individual shift start/end columns exist.

---

## 7. Full dependency list (read-only inventory)

### Code that reads or writes `public.shifts`
- `src/lib/lls.functions.ts`:
  - `importShifts` — SELECT, INSERT, UPDATE on `shifts` (L253–278).
  - `suggestOpportunityFactors` — SELECT `day_of_week, daypart, gross_sales` (L312–317).
  - `rollbackBatch` — UPDATE (clears columns), DELETE empty rows (L388–421).
  - `getWeeklyScorecard` — SELECT `server_id, server_name, shift_date, day_of_week, gross_sales, covers_served, labor_cost, opportunity_factor` (L534–540).
- `supabase/migrations/20260531124719_…sql` — CREATE TABLE + RLS; defines old `calculate_lls_for_shift` and `recalculate_lls_for_week`.
- `supabase/migrations/20260531152242_…sql` — REPLACES `calculate_lls_for_shift` and re-comments `final_lls`.
- `src/integrations/supabase/types.ts` — generated row typings only (no runtime).

### Code that reads `shifts.final_lls`
- **None at runtime.** Searched across `src/**`. Only the column COMMENT in migration `…152242…sql` references it, plus the generated `types.ts`. The UI consumes `weekly_adjusted_lls` recomputed in `getWeeklyScorecard`, not the cached `final_lls` column. `rollbackBatch` writes `null` into it on partial rollback but no consumer reads it.

### Code that reads `shifts.base_lls` / `shifts.rpc`
- **None at runtime.** Same as above. Written by `calculate_lls_for_shift`, cleared by `rollbackBatch`, never read by the application code.

### Code that touches Opportunity Factors
- Table `venue_opportunity_factors`:
  - `getOpportunityFactors` — SELECT.
  - `updateOpportunityFactor` — UPSERT; then RPC `recalculate_lls_for_week`.
  - `calculate_lls_for_shift` (DB) — SELECT inside the function.
- Cached per-shift `shifts.opportunity_factor`:
  - Written by `calculate_lls_for_shift`.
  - **Read by `getWeeklyScorecard`** (the only consumer at runtime).
- Suggestions:
  - `suggestOpportunityFactors` (no DB write) → consumed by `manager.lls.tsx → generateSuggestedFactors`, which then calls `updateOpportunityFactor` 35× (7 × 5) sequentially.

### Code that reads the current benchmark
- Computed inline in `getWeeklyScorecard` (L572–584). The benchmark is **not** stored anywhere in the database — it is recomputed on every call. No other consumer. Returned values are surfaced in:
  - `src/routes/manager.lls.tsx` → "Venue Benchmark" + "Benchmark WoW Trend" summary cards.
  - Each server row's `performance_gap` and `rag_status` (derived in the same function).

### External dependencies
- `xlsx`, `papaparse` — file parsing (UI only).
- `sonner` — toasts (UI only).
- TanStack server fn middleware `requireSupabaseAuth` + `is_venue_manager(uuid)` RLS function (defined in earlier migrations).

---

## 8. Discrepancies between documented v1 behaviour and the actual code

Recorded for Phase 1 closure. None of these change v1 behaviour; they are noted so v2 design cannot quietly inherit them.

1. **Column comment vs runtime intent.** `shifts.final_lls` is commented "Adjusted LLS = Base LLS / Opportunity Factor" and the active SQL writes exactly that — but **no UI code reads it**. The UI's adjusted LLS comes from on-the-fly weighted aggregation in `getWeeklyScorecard`. The cached column is effectively dead data.
2. **Two versions of `calculate_lls_for_shift`.** Migration `…124719…sql` writes `final_lls = (base_lls × rpc) / opportunity_factor`; migration `…152242…sql` later replaces it with `final_lls = base_lls / opportunity_factor`. The later one wins at runtime, but any docs/screenshots taken between those two migrations describe a formula no longer in effect.
3. **Threshold defaults vs scorecard RAG.** `getLlsThresholds` returns `{green:13, amber:10}` and is plumbed into the scorecard payload (`thresholds`), but the scorecard's primary RAG (`rag_status`) uses `ragFromGap` (±10%) — not the thresholds. The thresholds drive only the `llsBand` chip colouring in the UI for absolute Adjusted LLS values. A reader of the threshold setting would reasonably expect it to drive the RAG; it does not.
4. **Start-time defaulting changes the daypart bucket.** `importShifts` writes `'00:00:00'` for missing start times (L226–228), then `dayPartFromTime('00:00:00')` returns `breakfast` (h=0 < 10). Yet `dayPartFromTime`'s own fallback (when called with a null/empty string) returns `dinner`. The two defaults are inconsistent and only the `breakfast` path is reachable from the import flow.
5. **OF clamp inconsistency.** API write path clamps to `[0.7, 1.4]`; suggestion path clamps to `[0.75, 1.4]`. The DB CHECK is `[0.7, 1.4]`. Suggestions can never produce a value below 0.75 even though the system can store one.
6. **`covers ?? 0` semantics.** `weekly_rpc = Σ gross / Σ covers` silently treats missing covers as 0 in the denominator sum, inflating RPC for servers whose covers column is partially populated, without any warning.
7. **Sales-only rows are "not worked" but still trigger OF lookup.** A row with `gross_sales > 0` but `labor_cost = NULL` gets `opportunity_factor` cached by `calculate_lls_for_shift`, is then filtered out of every scorecard total, but still contributes to `suggestOpportunityFactors` (`worked = gross_sales > 0`). The two functions use different definitions of "worked".
8. **`rollbackBatch` partial-rollback dead state.** When only one side is rolled back, the row keeps the other side's data, but `base_lls`, `final_lls`, `rpc` are cleared and never recomputed (no recalc call). Since no consumer reads those columns at runtime today this is invisible — but it is also why `final_lls` should not be relied on by future readers.

---

## 9. Phase 1 deliverables (this commit)

- `docs/lls/v1-frozen-spec.md` (this file).
- `src/lib/lls/__tests__/v1-regression/v1-pure.ts` — pure-JS replica of `getWeeklyScorecard`, `calculate_lls_for_shift`, `dayPartFromTime`, `hashServerId`, `normalizeDaypart`, `ragFromGap`. Imported by tests only. Does not replace production code.
- `src/lib/lls/__tests__/v1-regression/fixtures.ts` — three deterministic datasets: `cleanWeek`, `missingTimesWeek`, `ambiguousDayWeek`.
- `src/lib/lls/__tests__/v1-regression/v1-regression.test.ts` — bun-test snapshot of the expected outputs (including the documented flaws). Failure means v1 behaviour drifted.
- `scripts/lls/audit-v1.ts` — read-only audit dump for a given venue + week. Not wired into the app.

Phase 1 makes **no** changes to: production server functions, DB migrations, the `/manager/lls` route, the OF grid behaviour, or any user-visible surface.
