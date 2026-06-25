## What's actually happening

The 115 "duplicates" are **not** leftovers from your earlier re-uploads. Each upload creates a separate batch, and the duplicate check only looks within a single batch — it never compares against prior batches.

The real cause is the dedupe key in `src/lib/imports/validation.ts`:

```text
key = (server_id OR server_name) | shift_date | shift_start_time
```

Your sales CSV has no `shift_start_time` column, so for every server who worked **two shifts on the same date** (e.g. brunch + dinner), the key collapses to `name|date|` and the second row gets flagged as a duplicate. That's why ~1 in 3 rows tripped it — it's a false positive, not real duplication.

The "missing revenue centre" flag is also noise for a single-outlet venue with no revenue-centre config.

## Plan

### 1. Fix the dedupe key (root cause)

In `src/lib/imports/validation.ts`:

- Include `source_kind` (sales vs labour) in the key so the two files never collide with each other.
- When `shift_start_time` is missing, fall back to `(amount + hours)` as a tiebreaker instead of treating all same-day rows for one server as duplicates.
- Add a unit test covering "same server, same date, two shifts, no start time" → must produce zero duplicates.

Expected outcome: the 115 false-positive duplicates drop to 0 (or to a small genuine number, which would be a real data problem worth surfacing).

### 2. Silence "missing revenue centre" when the venue has no revenue centres configured

In `validateRows` (`src/lib/imports/validation.ts`) and the batch-defaults inference (`src/lib/imports/defaults.ts`):

- If the venue has no revenue-centre dimension declared in `batch_defaults` or `venue_settings`, suppress the `missing_revenue_centre` reason entirely instead of flagging every row.
- Keep it as an optional advisory only for multi-revenue-centre venues.

### 3. Honest toast wording

In `src/routes/manager.lls.index.tsx` (the staged-summary toast):

- Replace the current breakdown with a tiered message:
  - If `accepted == total` and only auto-detected context flags remain: `"Staged 362/362 rows · ready to commit. Auto-detected: outlet=Fight, sales basis=gross. Review in Imports."`
  - If real issues exist (true duplicates, ambiguous identity, bad dates): list only those, with counts.
- Stop counting `missing_revenue_centre` as an "advisory flag" once #2 lands.

### 4. Cross-batch duplicate awareness (optional, lightweight)

In `src/lib/imports.functions.ts`, during staging, compare each row's `(venue_id, source_kind, server_id|name, date, start_time)` against already-committed rows in `shifts_v2` and against rows in other **unrolled-back** batches. Mark those as `duplicate_status = 'duplicate_candidate'` so the commit step naturally skips them. This means if you ever do re-upload the same file, the system handles it cleanly instead of silently double-counting.

### 5. Verify

- Run the existing 838-test suite plus the new dedupe-key test.
- Re-stage your two CSVs (no DB migration needed) and confirm the toast reads cleanly.

## Files touched

- `src/lib/imports/validation.ts` — dedupe key, suppress revenue-centre noise
- `src/lib/imports/defaults.ts` — expose `hasRevenueCentres` flag
- `src/lib/imports.functions.ts` — cross-batch duplicate check during staging
- `src/routes/manager.lls.index.tsx` — tiered toast wording
- `src/lib/imports/__tests__/validation.test.ts` — new regression tests

No schema migration required.

## Out of scope

- Changing LLS formulas or commit logic.
- Touching server-side game mechanics.
- Reworking the import detail page beyond what the toast change implies.
