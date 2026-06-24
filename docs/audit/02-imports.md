# Import & Parser Inventory

Every CSV/XLSX entry point in the app, the parser it actually uses, and whether it routes through the shared engine at `src/lib/import/column-intelligence.ts`.

## BLOCKER / HIGH

| # | Where | Issue |
|---|---|---|
| I-1 | `src/lib/server-gap/parse.ts:141-145` — `dateKey()` ambiguous-date branch | Copy-paste bug: `const day = a > 12 ? a : a` and `const mon = a > 12 ? b : b`. Both ternary branches return the same variable. Any `DD/MM/YYYY` upload where `DD≤12` parses identically to `MM/DD/YYYY` and lands on the wrong date. Affects `/calculator/server-gap` (the public marketing CTA). **BLOCKER · FORMULA_DRIFT** |
| I-2 | `src/routes/manager.lls.index.tsx:837` | `if (!m && canon === "labor_cost") m = det.mappings.fully_loaded_labor_cost;` Silently promotes fully-loaded labor cost into the base labor_cost slot when the latter isn't detected. No toast, no warning, no field-source label. Inflates LLS denominator 20–35%. **BLOCKER · LABOR_BASIS_DOWNGRADED** |
| I-3 | `src/routes/manager.lls.index.tsx:289-293` | `if (laborCost == null) laborCost = hours × hourlyRate` — derived silently, no provenance flag, no row marker. Used directly in the scorecard. **HIGH · UNLABELLED_DERIVED** |
| I-4 | `src/routes/manager.lls.index.tsx:71-85` (`parseFile`) | Local re-implementation of XLSX+CSV reader that bypasses the shared engine for the raw-row read step. Forks the Excel-date handling from `src/lib/server-gap/parse.ts` (`XLSX.SSF.parse_date_code` here vs `{cellDates:true}` there). Any date-parsing fix has to be applied twice. **HIGH · HARDCODED_OR_DEMO_LEAK** |
| I-5 | `src/lib/csv.ts:442-453` (`inferSalesHeader`) | Fallback picks the column with the most non-zero values. On a typical POS export `covers` or `check_id` densities exceed `total_sales` density. No range check, no currency-symbol check. **HIGH · COLUMN_MISREAD** |

---

## Entry points

### 1. `/manager/lls` — Sales export + Labor export drop zones
- File picker: `src/routes/manager.lls.index.tsx:785-794` (`<UploadZone>`); drag/drop `:772-779`.
- Raw parse: local `parseFile` `:71-85` (XLSX + papaparse, **not** the shared engine).
- Column mapping: `autoMap` `:817-845` calls `detectColumns` from `src/lib/import/column-intelligence.ts`. ✅ shared engine used here.
- Saved per-venue mapping override: `:212-224`.
- Row normalisation: hand-rolled `normalizeDate` `:87-106`, `normalizeTime` `:108-121`, `normalizeNumber` `:123-127` — all local. `normalizeNumber` strips `-` so `(1,234.56)`-style accounting negatives become positive. **MEDIUM · FORMULA_DRIFT**
- Server ingest: `src/lib/lls.functions.ts:188-302` (`importShifts`), then `dayPartFromTime` `:29-37` defaults to `"dinner"` for any unparseable time including the `"00:00:00"` sentinel injected at `:226`. **MEDIUM · FORMULA_DRIFT**
- Hardcoded canonical sets: `SALES_FIELDS`/`LABOR_FIELDS` `:47-67`, `LLS_FIELD_TO_CANONICAL` `:804-815`. Any field outside these lists is dropped even if detected.
- **Shared engine?** Partial — mapping yes, raw parse + normalisation no.

### 2. `/manager/` — CSV / image upload
- File picker via `fileRef` ref (`manager.index.tsx:117`).
- CSV: `parseStatsCsv` (`src/lib/csv.ts:513-658`) → `Papa.parse` with `transformHeader: canonicalHeader`.
- `canonicalHeader` `:303-327` first tries local `HEADER_ALIASES` (90+ entries, `:123-221`), then **falls back** to `detectColumns`. Engine is a fallback only.
- `inferServerHeader` `:423-440` — name-heuristic detection, independent of engine.
- `inferSalesHeader` `:442-453` — density heuristic, see I-5.
- `categoryBucket` `:457-463` — hardcoded six-bucket keyword classifier (`CATEGORY_KEYWORDS` `:223-297`).
- Cover-count priority chain `:635-638`: `sum-all → check-id count → max candidate → row total`. Result has no provenance flag. **MEDIUM · UNLABELLED_DERIVED**
- Image path `:357-389` POSTs base64 to `ai-assist` edge function.
- DB ingest: `supabase.rpc("process_csv_upload")` `:281-286`.
- **Shared engine?** Partial — fallback only.

### 3. `/calculator/server-gap` — Sales + Labour drop cards
- File picker: `<UploadCard>` in `calculator.server-gap.tsx` (~`:267-288`).
- Raw parse: `src/lib/server-gap/parse.ts:69-110` (papaparse + SheetJS `{cellDates:true}`).
- Header detection: full delegation to `detectColumns` (`:77-87`).
- Sales normalise: `src/lib/server-gap/merge.ts:39-76` reads typed `ParsedRow` (`net_sales`, `gross_sales`, times).
- Labour normalise: `:78-121` reads `hours`, `labour_cost`, derives hours from times when needed (`:90-91`).
- Merge: `:170-287`, 4-tier priority, flags ambiguous instead of guessing. ✅
- Metrics: `src/lib/server-gap/calc.ts`.
- `dateKey` bug at `parse.ts:141-145` — see I-1. **BLOCKER**
- `merge.ts:116` reads `r.labour_cost` (British) round-trip-mapped via `FIELD_MAP` at `parse.ts:17`. Silent null on any engine rename. **MEDIUM · LABOR_BASIS_DOWNGRADED**
- **Shared engine?** Yes — full delegation. Best-wired entry point in the app.

### 4. `/manager/menu` — multi-file uploader
- File picker `manager.menu.tsx:285-293` accepts `.txt,.csv,.md,.menu,.pdf,.png,…`.
- PDF: `pdfjs-dist`. Image: `FileReader` base64. Other: `file.text()`.
- AI parse: `ai-assist { action: "parse_menu" }` `:164-167`.
- Not tabular. **Shared engine?** N/A.
- LOW · HARDCODED_OR_DEMO_LEAK: a stats CSV mis-uploaded here is read as plain text and sent to the LLM verbatim (no MIME-type guard beyond extension).

---

## Helpers that exist but are NOT wired to the shared engine

| Helper | File | Imported by | Risk |
|---|---|---|---|
| local `parseFile` | `manager.lls.index.tsx:71-85` | inline only | `HARDCODED_OR_DEMO_LEAK`, duplicates server-gap reader |
| `normalizeDate` | `manager.lls.index.tsx:87-106` | inline only | `FORMULA_DRIFT` — independent of `dateKey` |
| `normalizeTime` | `manager.lls.index.tsx:108-121` | inline only | `FORMULA_DRIFT` — no AM/PM |
| `normalizeNumber` | `manager.lls.index.tsx:123-127` | inline only | `FORMULA_DRIFT` — drops parenthesised negatives |
| `inferServerHeader` | `csv.ts:423-440` | `parseStatsCsv` → `manager.index.tsx` | `COLUMN_MISREAD` |
| `inferSalesHeader` | `csv.ts:442-453` | `parseStatsCsv` → `manager.index.tsx` | `COLUMN_MISREAD` HIGH |
| `categoryBucket` | `csv.ts:457-463` | `parseStatsCsv` | `HARDCODED_OR_DEMO_LEAK` |
| `HEADER_ALIASES` | `csv.ts:123-221` | `canonicalHeader` | hard alias table; primary path, not fallback |
| LLS v2 ingest (`v2IngestBatch`, `v2RunReconciliation`, `buildIngestPayload`) | `src/lib/lls/v2/import.functions.ts`, `staging.ts` | **no route imports it** | shadow-mode entry points are unreachable from any UI |

The LLS v2 ingest pipeline exists and the migrations + reconciliation function are deployed, but no UI invokes them. They are effectively dead code today (intentional for shadow phase). Note for Stage 2.

---

## Summary

- 1 BLOCKER on a public marketing path (I-1, date parser).
- 1 BLOCKER on every customer's labor cost basis (I-2, fully-loaded promotion).
- 2 HIGH (I-3 derived labor cost, I-4 forked reader, I-5 sales-column heuristic).
- Best-wired path is `/calculator/server-gap` — model for Stage 2 consolidation.
- `/manager/lls` uses the engine for **mapping** but has its own reader and normalisers — the highest-leverage place to migrate after the BLOCKERs are fixed.
- `/manager/` (legacy stats upload) is the least-wired entry; its inference heuristics are independent of the engine and were the original cause of the alias-table sprawl.
