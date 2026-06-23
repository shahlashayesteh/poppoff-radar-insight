## Stage 1 — Calculation & import audit (read-only, revised)

Approved scope: Stage 1 only. No app code changes. Deliverables are Markdown documents under `docs/audit/`. I will stop and wait for your review before any Stage 2 work, unless I discover a calculation blocker that would make the demo unsafe — in that case I flag it and ask before touching code.

### Audit surface

Every route in `src/routes/` (manager, server, demo manager, demo server, calculator, server-gap, LLS, reports, coaching, priorities, menu, team, scorecards), every helper in `src/lib/` (`lls/`, `lls/v2/`, `server-gap/`, `import/`, `performance-engine.ts`, `server-data.ts`, `sample-data.ts`, `csv.ts`, `lls.functions.ts`), the v2 calculation engine, and every CSV/XLSX upload entry point.

### Deliverables

All files written under `docs/audit/`. Nothing else changes.

1. **`docs/audit/00-readiness-summary.md`** — top-of-stack "presentation readiness risk summary":
   - ✅ Safe to present now
   - ⚠️ Risky — present with caveats
   - 🛑 Must fix before presentation (BLOCKERs)
   - 🕒 Can wait until after presentation
   Each item links into the detailed sections below.

2. **`docs/audit/01-calculations.md`** — one row per (page, metric):
   - **UI location/path** (e.g. `/manager/lls` → "Adjusted LLS" column in the weekly table; `/manager` → "Team RPH" KPI card) — visible path the user clicks to see it, not just the file.
   - Code file:line
   - UI label as shown
   - Exact formula in code today
   - Source fields and classification (uploaded / derived / hardcoded / demo / fallback)
   - Whether the same metric is calculated differently elsewhere (cross-link)
   - Whether the UI exposes formula / source / basis / tooltip (yes/no)
   - **Severity**: BLOCKER / HIGH / MEDIUM / LOW
   - Recommended canonical formula

3. **`docs/audit/02-imports.md`** — every CSV/XLSX entry point, parser/mapper used, whether it already routes through `src/lib/import/column-intelligence.ts`, gaps, severity.

4. **`docs/audit/03-benchmarks-and-ranking.md`** — every benchmark, ranking threshold, and flagging rule in code today; whether basis matches the metric being judged; weighted vs simple-average; threshold drift across pages; severity.

5. **`docs/audit/04-opportunity-factor.md`** — every read/derive/default of OF, application consistency across manager/server/reports/coaching, severity.

6. **`docs/audit/05-transparency-gaps.md`** — every place a metric is shown without a formula/source/basis/tooltip, with the UI path and severity.

### Risk taxonomy (applied across all sections)

Each finding is tagged with one severity AND one or more of these risk codes so you can scan by category:

- `LABOR_BASIS_WRONG` — wrong labour/labor cost basis used
- `LABOR_BASIS_DOWNGRADED` — gross wage used when fully loaded was available
- `BENCHMARK_BASIS_MISMATCH` — benchmark basis ≠ metric basis
- `AVG_OF_AVG` — simple averages used where weighted totals should be
- `FORMULA_DRIFT` — same metric, different formulas across pages
- `HARDCODED_OR_DEMO_LEAK` — hardcoded / demo values reachable in real flows
- `UNLABELLED_DERIVED` — fallback calculation not labelled as derived
- `COLUMN_MISREAD` — imported field misread because of column naming
- `MANAGER_SERVER_DIVERGENCE` — manager vs server dashboard inconsistency
- `OF_INCONSISTENT` — opportunity factor applied inconsistently
- `THRESHOLD_DRIFT` — ranking/flagging thresholds inconsistent
- `NO_TRANSPARENCY` — metric shown without formula/source/basis/tooltip

### Severity rubric

- **BLOCKER** — would show wrong numbers on stage or in a buyer demo path; must fix before presenting.
- **HIGH** — wrong on a path a buyer is likely to click; fix before presenting or hide that surface.
- **MEDIUM** — correct in common paths, wrong in edges; safe to present with a caveat.
- **LOW** — cosmetic / transparency only; fine after presentation.

### Method

- Read-only: `rg`, `code--view`, and one or more `acp_subagent--explore` passes to trace metric→component→route paths so the UI location column is accurate.
- Cross-reference every metric across manager, server, and demo trees to detect `FORMULA_DRIFT` / `MANAGER_SERVER_DIVERGENCE`.
- Run the existing test suite once to confirm baseline (no changes).

### Stop condition

After writing the six docs I stop and post the readiness summary in chat with links. No Stage 2 work, no schema changes, no UI changes, no calc changes — unless I hit a BLOCKER that makes the demo unsafe to run as-is, in which case I will ask you before touching anything.

### What I still need from you (can answer after reviewing Stage 1)

1. Whether any documented per-page formula deviations are intentional.
2. Target recoverability factor for "Recoverable Opportunity" (or default + venue setting).
3. Tip/attach denominator preference when `eligible_*` is absent (approximate label vs hide).