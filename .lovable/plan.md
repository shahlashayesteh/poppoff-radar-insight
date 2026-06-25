## Goal

Make sure managers uploading CSVs from **any POS system** never see a confusing "every row warned" message again — while keeping the data-trust guarantees from Phases 4/6/17 intact.

## Root cause (recap)

The validator in `src/lib/imports/validation.ts` warns on every row that's missing optional context columns (`outlet`, `revenue_centre`, `net_sales`, `sales_basis`, `labor_basis`). Different POS exports name and split these differently:

- Toast, Square, Lightspeed, Aloha — call net sales "Net Sales", "Subtotal", "Net Revenue", or omit it entirely.
- Outlet/RC is "Location", "Store", "RVC", "Department", or missing on single-site exports.
- Basis labels are almost never explicit columns — they're a property of the report type, not a field.

Your two CSVs hit all of these and produced 362 noisy warnings. Other POS exports will hit the same pattern unless we fix three layers.

## Plan — three coordinated changes (UI only, no calc/RLS/schema changes)

### 1. Smarter post-upload toast and per-row warning rollup
`src/routes/manager.lls.index.tsx` and `src/routes/manager.imports.$batchId.tsx`
- Replace the raw warning count with a grouped summary built from `ValidationSummary` (already returned by `stageImportBatch`): e.g. `362 staged, 0 rejected. Heads-up: missing outlet (362), gross-only sales (181), unknown basis (362). Safe to commit.`
- Add a "Warning breakdown" card on the batch page that groups warnings by reason with counts and a one-line plain-English explanation for each (what it means, whether it blocks commit, how to fix it at source).

### 2. Per-batch defaults to silence noise that isn't really missing
`src/routes/manager.imports.$batchId.tsx` + `src/lib/imports.functions.ts`
- Add a small "Batch defaults" panel on the batch page that lets the manager declare, once per upload:
  - **Default outlet** (defaults to the active venue's name — single-site users never see this warning again)
  - **Default revenue centre** (optional, e.g. "Main")
  - **Sales basis**: `net` / `gross` / `gross_with_tax` (declares what the file actually contains)
  - **Labour basis**: `wages_only` / `wages_plus_oncosts` / `fully_loaded`
- Saving the defaults re-runs `validateRows` against the staged data with those values pre-filled, and re-stamps `summary` + each row's reasons. Warnings that were only about "missing optional context" disappear; warnings about real data problems (duplicate rows, invalid dates, missing identity) stay.
- The defaults are persisted on `shift_import_batches_v2` (existing JSONB column — no migration needed; I'll confirm before editing) and applied during commit so the canonical `shifts_v2` rows get correct provenance.

### 3. Auto-detect basis and outlet from filename / column shape
`src/lib/import/column-intelligence.ts`
- When `sales_basis` / `labor_basis` columns are absent, infer a default from filename hints (`net_sales`, `gross`, `wages`, `loaded`, POS vendor names) and from which numeric columns are present (e.g. only `gross_sales` ⇒ `gross`; `gross_sales` + `tax` + tip column ⇒ `gross_with_tax`).
- When outlet/RC are absent and the venue has a single site, auto-apply the venue name as outlet at staging time so the warning never fires.
- Surface what was inferred in the upload toast so it's auditable, not silent ("Detected: Toast export, sales basis = gross, outlet = Riverside Bistro").

## What stays unchanged (deliberately)

- Validation rules themselves — duplicates, missing identity, bad dates still reject or warn.
- LLS formulas, provenance mapping, RLS policies.
- The Phase 6 staging gate — nothing auto-commits.
- Employee identity matching (Phase 7/19) — still blocks ambiguous commits.

## Why this generalises across POS systems

The fix moves the burden from "every row must carry every optional column" to "the manager declares context once per file, and we infer what we can". That works whether the CSV came from Toast, Square, Lightspeed, Aloha, Revel, Clover, or a hand-rolled export — because every POS export has the same shape problem (numbers + identity, missing context).

## Files I'd touch

- `src/routes/manager.lls.index.tsx` — improved toast
- `src/routes/manager.imports.$batchId.tsx` — warning breakdown + batch defaults panel
- `src/lib/imports.functions.ts` — `applyBatchDefaults` server fn (guarded with `requirePaidManagerEntitlement` + `assertVenueAccess`), re-runs validation, updates batch row
- `src/lib/imports/validation.ts` — accept optional `defaults` arg so context-only warnings are suppressed when defaults are declared
- `src/lib/import/column-intelligence.ts` — filename + column-shape inference for basis and outlet

## What I will NOT do

- No DB schema changes (uses existing JSONB on `shift_import_batches_v2`; will verify before editing)
- No new tables, no migration
- No changes to LLS math or provenance derivation rules
- No auto-commit, no silent merges

Approve and I'll implement in this order: (3) inference → (2) batch defaults + re-validate → (1) toast and breakdown card, then verify against your two uploaded CSVs end-to-end.
