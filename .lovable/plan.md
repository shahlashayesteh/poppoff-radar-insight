# Stage 2 — Canonical Calculation Engine + Dashboard Separation

Stage 1 audit (docs/audit/*) and the two emergency patches (dateKey + labor basis) are already in. This plan executes the rest in **5 controlled phases**, each independently reviewable. I will stop after each phase for your sign-off.

---

## Phase A — Canonical Calculation Engine (foundation, no UI change)

Create `src/lib/metrics/` as the single source of truth. Every page must import from here.

**Files (new):**
- `src/lib/metrics/types.ts` — `Basis` enums (`SalesBasis`, `LaborBasis`, `HoursBasis`, `Provenance: "uploaded" | "derived" | "estimated" | "defaulted"`).
- `src/lib/metrics/sales.ts` — `netSales()`, `grossSales()`, `leakageAmount()`, `leakageRate()`.
- `src/lib/metrics/labor.ts` — `laborCost()` with hierarchy (fully_loaded → total → wage+oncost → wage → rate×hours), `hoursWorked()` hierarchy, returns `{value, basis, provenance}`.
- `src/lib/metrics/productivity.ts` — `rph()`, `rpc()`, `avgCheck()`, `coversPerHour()`, `itemsPerCover()`, `laborPct()`.
- `src/lib/metrics/lls.ts` — `baseLLS()`, `adjustedLLS()` (shift-level OF only), `teamBaseLLS()`, `teamAdjustedLLS()`, `serverWeeklyBaseLLS()`, `serverWeeklyAdjustedLLS()`. **All use weighted sums, never avg-of-avg. RPC is never multiplied in.**
- `src/lib/metrics/opportunity.ts` — `applyOFAtShift()`, `aggregateAdjustedLaborCost()`. Enforces shift-level application.
- `src/lib/metrics/benchmark.ts` — `venueBenchmark({basis, period, scope})` — returns benchmark **with the same basis as the metric being compared**. Mismatched basis throws.
- `src/lib/metrics/gap.ts` — `performanceGap()`, `ragBand()` (>+10 strong / ±5 tracking / -5..-10 monitor / <-10 priority).
- `src/lib/metrics/tips.ts` — `tipPct()`, `serviceChargePct()`, `attachRate()` — preferred eligible-denominator, fallback labelled approximate.
- `src/lib/metrics/trend.ts` — `trendPct()`.
- `src/lib/metrics/recoverable.ts` — `recoverableOpportunity()` with configurable `recoverabilityFactor` (default 0.5, labelled modelled).
- `src/lib/metrics/index.ts` — barrel export + `MetricResult<T>` wrapper `{value, basis, provenance, formula, sourceFields}` used by tooltips.
- `src/lib/metrics/__tests__/*` — unit tests for every formula incl. avg-of-avg regression, OF-at-shift, basis-mismatch guard.

**Removals/refactors (replace in-place to call the engine):**
- `src/lib/lls/v2/comparison.functions.ts` — replace mean-of-OF with shift-level.
- `src/lib/lls/v2/performance-engine.ts` — replace `mean()` baselines with weighted.
- `src/routes/manager.lls.index.tsx` — pull all calcs from engine.
- `src/routes/calculator.server-gap.tsx`, `src/lib/server-gap/*` — pull from engine.
- Any other manager/server/report file recomputing these metrics (audit list in `docs/audit/01-calculations.md`).

**Deliverable:** all existing pages work identically; tests prove math is now centralised. **No UI change yet.**

---

## Phase B — Basis & Provenance Transparency (manager UI)

Add tooltip + badge system on every manager metric.

**Files (new):**
- `src/components/metrics/MetricTooltip.tsx` — wraps a number, shows formula / source fields / basis / provenance.
- `src/components/metrics/BasisBadge.tsx` — small inline label (`fully loaded` / `wage only` / `derived` / `estimated` / `scheduled est.` / `approx.`).
- `src/components/metrics/RagPill.tsx` — canonical RAG bands.

**Wire-up:** every metric on manager-facing routes listed in `docs/audit/05-transparency-gaps.md` gets `<MetricTooltip>` + `<BasisBadge>` where relevant.

**Server-facing routes do NOT get these** — kept simple.

---

## Phase C — Manager LLS upgrade: Scheduling Leverage Matrix

In `src/routes/manager.lls.index.tsx` (or a new `manager.lls.scheduling.tsx` child route) add the six sections you described.

**New files:**
- `src/lib/scheduling/match-score.ts` — `matchScore(server, shiftType)` with the documented weights (configurable via `src/lib/scheduling/config.ts`).
- `src/lib/scheduling/indices.ts` — `AdjustedLLSIndex`, `RPHIndex`, `RPCFit`, `ThroughputFit`, `CategoryFit`, `ConsistencyScore`.
- `src/lib/scheduling/recommendations.ts` — classifier producing labels: Best peak / Slow-shift lifter / High RPC specialist / Throughput / Category specialist / Development / Protect from mismatch.
- `src/lib/scheduling/__tests__/*` — covers marginal-value logic (best server ≠ always best for peak).
- `src/components/scheduling/StrongestLeverageCards.tsx` — Section 2.
- `src/components/scheduling/ShiftMatchTable.tsx` — Section 3.
- `src/components/scheduling/RotaOpportunityMatrix.tsx` — Section 4 (green/amber/red/grey cells).
- `src/components/scheduling/SuggestedTests.tsx` — Section 5.
- `src/components/scheduling/Guardrails.tsx` — Section 6.
- `src/components/scheduling/WhatTheScoreMeans.tsx` — Section 1.

Language strictly uses "modelled / estimated opportunity / suggested test" — no "guaranteed revenue".

---

## Phase D — Server Dashboard hardening (keep gamified, strip manager intel)

Audit every `/server/*` route and remove anything that leaks manager-only intelligence: LLS, labour cost, fully loaded cost, benchmark formulas, scheduling logic, other servers' efficiency.

**Touched files** (read-only audit first, then surgical edits):
- `src/routes/server.*.tsx` — keep: rank, streaks, items, categories, coaching prompts, milestones, "vs your usual week" framing.
- `src/components/server/*` — add `EstimatedBadge` for estimated item counts; ensure no `<BasisBadge>`/`<MetricTooltip>` imports here.
- Rewrite any leaked labour/LLS UI into personal-progress language.

Server dashboard stays visually as-is — only sanitise content.

---

## Phase E — Universal import intelligence wiring

Stage 1 already created `src/lib/import/column-intelligence.ts`. This phase makes **every** upload route call it.

**Audit & refactor:**
- `src/lib/csv.ts`, `src/lib/server-gap/parse.ts` — already on engine; verify.
- All other CSV/XLSX entry points listed in `docs/audit/02-imports.md` — switch to the shared engine.
- Add **join-confidence panel** for manager uploads: matched / unmatched POS / unmatched labour / ambiguous, surfaced in upload review modal only — not on server pages.
- Block uploads only on genuinely missing/ambiguous required fields; never on missing optional metric columns.

---

## Stop conditions & rollout

- After **each phase**, I stop, run tests, post a short diff summary, and wait for approval before the next phase.
- Phase A is the riskiest — all subsequent phases depend on it. If Phase A breaks any existing page, I will roll back and fix before continuing.
- Nothing in this plan touches DB schema. No migrations.
- Server dashboard never imports from `src/lib/metrics/labor.ts`, `lls.ts`, `benchmark.ts`, or `scheduling/*` — enforced by a lint check added in Phase D.

## Final deliverables (after Phase E)

The full list you specified: formulas inventory, pages using the engine, removed calculations, labelled metrics, benchmarks + basis, manager/server separation confirmation, weighted-totals confirmation, no-RPC-in-LLS confirmation, fully-loaded preference confirmation, basis-match confirmation, import robustness confirmation, ambiguous-join flagging confirmation, Scheduling Leverage Matrix confirmation, server-dashboard sanitisation confirmation, screenshots of tooltips and server dashboard.

---

**Approve to start Phase A**, or tell me to reorder / drop / expand any phase before I begin.
