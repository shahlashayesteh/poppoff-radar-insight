# Calculation Inventory

One row per (visible page, metric). UI location is the path a user clicks, not just the file. Severity uses the rubric in [00-readiness-summary.md](./00-readiness-summary.md). Risk codes per the taxonomy in the plan.

Legend: `U` = uploaded, `D` = derived in code, `S` = stored DB column written by ingest, `H` = hardcoded, `M` = demo/sample data, `F` = fallback.

---

## `/manager/` — `src/routes/manager.index.tsx`

| Metric (UI label) | UI location | Code | Formula | Source | Cross-link | Tooltip? | Sev / Risk | Canonical |
|---|---|---|---|---|---|---|---|---|
| Total Covers | Top KPI tile | `manager.index.tsx:185` | `Σ server_stats.total_covers` | U | same field on `/manager/reports`, `/manager/server/$id` | no | LOW · NO_TRANSPARENCY | unchanged |
| Avg Spend per Cover | KPI tile | `manager.index.tsx:187, 762` | `Σtotal_sales / Σtotal_covers` (recomputed) | U totals | DIFFERS from per-server card (stored column) and `/manager/reports` (recomputed from week totals) | no | HIGH · NO_TRANSPARENCY · BENCHMARK_BASIS_MISMATCH · FORMULA_DRIFT | `Σgross / Σcovers`, recomputed everywhere |
| Team table category dots (Wine/Cocktails/…) | Team Performance table | `manager.index.tsx:825-831` | `statusFromDelta(Δpp vs 4wk avg)` | D from S | shared with `/server/stats` | no | HIGH · NO_TRANSPARENCY | label-and-tooltip the basis |

---

## `/manager/server/$id` — `src/routes/manager.server.$id.tsx`

| Metric | UI location | Code | Formula | Source | Cross-link | Tooltip? | Sev / Risk | Canonical |
|---|---|---|---|---|---|---|---|---|
| Overall score (0–100) | "Overall score" hero | `manager.server.$id.tsx:104-107` + `performance-engine.ts:613-626` | `Σ(row.score × w) / Σ w` with `w = expectedSales ?? sales ?? 1` | D | same on `/manager/team`, `/server/`, `/server/stats` | no | **BLOCKER · FORMULA_DRIFT · BENCHMARK_BASIS_MISMATCH** | single weight basis per server; weight by labor cost or by opportunity volume, never mixed |
| Spend per cover | Stat card | `manager.server.$id.tsx:111` | `server_stats.spend_per_cover` (direct read) | S | differs from `/manager` and `/manager/reports` recomputes | no | HIGH · UNLABELLED_DERIVED · FORMULA_DRIFT | recompute everywhere |
| Streak | Stat card | `manager.server.$id.tsx:116` | `server_streaks.current_streak` | D | — | no | LOW | unchanged |
| Sales this week | Totals bar | `manager.server.$id.tsx:130` | `Σ row.sales` where `row.sales = net_sales ?? sales` | U | LLS module uses gross only | no | MEDIUM · COLUMN_MISREAD | declare basis in UI |
| vs last week % | Totals bar | `manager.server.$id.tsx:135` | `(Σsales − Σprev) / Σprev` | D | — | no | LOW | unchanged |
| vs 4wk avg % | Totals bar | `manager.server.$id.tsx:141` | `(Σsales − mean(last4.sales)) / mean(last4.sales)` | D | — | no | LOW · AVG_OF_AVG | weight by covers if available |
| **Revenue influence** | Totals bar | `manager.server.$id.tsx:147-149` + `performance-engine.ts:480-485` | per cat: `(serverConv − venueBaseline) / 100 × opportunityProxy × avgUnitPrice` | D; baseline = unweighted mean of weekly rates; price = menu avg or `DEFAULT_PRICES` | F-01 in 03 | no | **BLOCKER · AVG_OF_AVG · BENCHMARK_BASIS_MISMATCH** | covers-weighted baseline; category-specific denominator (tables for wine, eligible covers for dessert, adult-bev opp for cocktails); per-row menu price |
| Category bar fill | Category breakdown | `performance-engine.ts:448` | `current / target × 100` clamped 0–100 | U | same `/server/stats` | no | LOW | unchanged |
| Category items shown | Category breakdown | `performance-engine.ts:394-407` | `quantity` if real, else `sales / avgUnitPrice`, else `estimateItemsSold(...)` | U/D/H | "~Est." marker IS shown here | yes (est.) | LOW | unchanged |
| pp delta WoW / 4wk + £infl per row | Category rows | `manager.server.$id.tsx:173-184` | same as Revenue influence | D | — | no | MEDIUM · NO_TRANSPARENCY | tooltip + spell out "pp" |

---

## `/manager/team` — `src/routes/manager.team.tsx`

| Metric | UI location | Code | Formula | Source | Tooltip? | Sev / Risk |
|---|---|---|---|---|---|---|
| Score per server card | Card body | `manager.team.tsx:91` + `performance-engine.ts:613-626` | weighted-cat-avg, weight tier | D | no | **BLOCKER · FORMULA_DRIFT** (same as `/manager/server/$id`) |
| Rank #N | Card header | `manager.team.tsx:56-58` | sort desc by `overall` | D | yes (label) | LOW |
| £N sales | Card | `manager.team.tsx:95` | `Σ net_sales` | U | no | MEDIUM · COLUMN_MISREAD |
| +X% vs 4wk | Card | `manager.team.tsx:97` | `(Σsales − mean4) / mean4` | D | no | LOW · AVG_OF_AVG |
| +£X revenue influence | Card | `manager.team.tsx:101-103` | `Σ revenueInfluence` | D (uses bad baseline) | no | **BLOCKER · AVG_OF_AVG** |

---

## `/manager/lls/` — `src/routes/manager.lls.index.tsx` + `src/lib/lls.functions.ts`

| Metric | UI location | Code | Formula | Source | Tooltip? | Sev / Risk |
|---|---|---|---|---|---|---|
| Venue Benchmark (current-week) | Summary card | `manager.lls.index.tsx:422` + `lls.functions.ts:558` | `Σ venueGross / Σ venueAdjLabor` (this week) | U | yes (header) | **BLOCKER · MANAGER_SERVER_DIVERGENCE** — `/compare` uses prior-4-wk with same UI label |
| Benchmark WoW % | Summary card | `lls.functions.ts:560-563` | `(cur − prev) / prev` | D | yes | LOW |
| Weekly RPC | Scorecard row | `manager.lls.index.tsx:529` + `lls.functions.ts:588` | `Σgross / Σcovers` | U | yes (th title) | LOW |
| Base LLS | Scorecard row | `lls.functions.ts:589` | `Σgross / Σlabor_cost` | U | yes | LOW |
| **Adjusted LLS (badge)** | Scorecard row | `lls.functions.ts:543, 590` | `Σgross / Σ(labor × OF)`; **OF defaults silently to 1.0 if null/0** | U + S | yes (formula, NOT the default) | **HIGH · LABOR_BASIS_DOWNGRADED · NO_TRANSPARENCY** |
| Daily adj-LLS cells | Scorecard daily | `manager.lls.index.tsx:524` + `lls.functions.ts:583` | per-day `Σgross / Σ(labor×OF)` | U | no | MEDIUM · NO_TRANSPARENCY |
| Performance Gap | Scorecard row | `lls.functions.ts:592-595` | `weekly_adj_lls / venue_benchmark − 1` | D | yes | LOW |
| RAG | Scorecard | `lls.functions.ts:484-488` | ±10% gap bands | D | yes (legend) | LOW |
| Absolute LLS green/amber fallback | Hidden in `getWeeklyScorecard` | `lls.functions.ts:167-169, 660-663` | hardcoded 13.0 / 10.0 | H/F | no | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| Suggested OF | "Generate suggested factors" | `lls.functions.ts:326-368` | `bucketAvgSales / venueAvgSales × confidence_weight`, clamped [0.75, 1.4] | D | yes (low-conf warn) | HIGH · FORMULA_DRIFT — totally different formula from v2 OF |

The labor-cost field on `shifts` carries no basis distinction (gross wage vs fully loaded). See 02 for the upload-side BLOCKER that promotes `fully_loaded_labor_cost` into this field. **Severity at the scorecard: HIGH · LABOR_BASIS_WRONG** (depends entirely on upstream import).

---

## `/manager/lls/compare` — `src/routes/manager.lls.compare.tsx` + `src/lib/lls/v2/comparison.functions.ts`

| Metric | Code | Formula | Sev / Risk |
|---|---|---|---|
| v1 Adjusted LLS (current wk) | `comparison.functions.ts:106` | `Σ v1Gross / Σ v1AdjLabor` current week | LOW |
| v1 Benchmark Adj LLS | `comparison.functions.ts:104` | `Σ histGross / Σ histAdjLabor` over **prior 4 weeks** | **BLOCKER · MANAGER_SERVER_DIVERGENCE** — label "Venue Benchmark" identical to scorecard's current-week meaning |
| v2 Adjusted LLS | `comparison.functions.ts:162` | `Σ v2Gross / Σ (v2Labor × venueAvgOF)` | **BLOCKER · AVG_OF_AVG** — `venueAvgOF` is `mean()` over 35 grid cells, applied to the whole week instead of per-shift |
| v2 Comparable Adj LLS (benchmark) | `comparison.functions.ts:188` | `Σ histGross / Σ (histLabor × venueAvgOF)` over **prior 8 weeks** default | **BLOCKER · THRESHOLD_DRIFT** (4 vs 8) **+ AVG_OF_AVG** |
| v2 Expected Sales | `comparison.functions.ts:189-190` | `v2AdjLabor × comparableAdjLls` | MEDIUM · FORMULA_DRIFT (less rigorous than `calculations.ts:76` per-shift version) |
| Modelled revenue opportunity | `calculations.ts:76`, rendered `compare.tsx:138` | `max(0, expectedSales − v2Gross)` | MEDIUM · NO_TRANSPARENCY |

The v2 calculation library (`src/lib/lls/v2/calculations.ts`, `opportunity.ts`, `benchmark.ts`) is correct — weighted, per-shift, clamped, versioned. The **compare page bypasses it** with a simpler aggregation. That's the root of these blockers.

---

## `/manager/reports` — `src/routes/manager.reports.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| Covers per week | `:21-24` | `Σ total_covers` grouped by week | LOW |
| Sales per week | `:22` | `Σ total_sales` | LOW · COLUMN_MISREAD (basis undeclared) |
| **SPC** | `:28` | `Σ total_sales / Σ total_covers` (recomputed) | HIGH · UNLABELLED_DERIVED · FORMULA_DRIFT — disagrees with stored-column SPC on `/manager/server/$id` |

---

## `/manager/priorities`, `/manager/coaching`, `/manager/menu`

No numeric derivations. Priorities is a manual list. Coaching is AI text. Menu is AI extraction (text/image). ✅ No calculation findings; menu upload has a minor data-leak risk if a CSV is mis-uploaded — see 02.

---

## `/server/` — `src/routes/server.index.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| Rank `#N of N` | `:208` + `performance-engine.ts:889` | sort desc by `current_sales` (gross) | LOW |
| Percentile rank | `performance-engine.ts:921-924` | `round((total − rank) / (total − 1) × 100)` | LOW |
| Top mover ring fill | `:274-298` + `performance-engine.ts:953` | `clamp(|momentumPct| × 4, 8, 100)` | LOW · NO_TRANSPARENCY (ring scale opaque) |
| Momentum % "vs your usual" | `performance-engine.ts:935-941` | `(sales − mean(last4.sales)) / mean(last4.sales)`; fallback WoW | LOW |
| "Roughly £X in uplift" | `:398-399` + `performance-engine.ts:1077` | `max(0, target − actualItems) × avgUnitPrice` | HIGH · NO_TRANSPARENCY |
| Items sold (driving rank) | `:70-82` | `Σ quantity` or `estimateItemsSold(sales,key,prices)` | MEDIUM · UNLABELLED_DERIVED — no `~est.` here, unlike `/server/stats` |

---

## `/server/stats` — `src/routes/server.stats.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| Items this week | `:57-58` | real `quantity` or `estimateItemsSold` | LOW (est. labelled) |
| Category bar fill / ring% | `performance-engine.ts:448` | `current / target × 100` clamped | LOW |
| WINNING/CLOSE/PUSH | `:95-98` + `performance-engine.ts:742-746` | `ragFromRing`: green ≥ 90% target, amber ≥ 65% | MEDIUM · NO_TRANSPARENCY |
| "Up X% on your usual" | `performance-engine.ts:786-789` | momentum % | LOW |
| "N more sold than usual" | `performance-engine.ts:832-839` | `items − items × (mean4Sales / sales)` ratio approx | MEDIUM · UNLABELLED_DERIVED |

---

## `/server/leaderboard` — `src/routes/server.leaderboard.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| Rank order | `performance-engine.ts:889` | sort desc by `current_sales` (raw) | **BLOCKER · FORMULA_DRIFT** — `/manager/team` ranks by composite score, here by raw £ |
| Items column | `:91-103, 246` | real OR estimated, no marker | **BLOCKER · NO_TRANSPARENCY · UNLABELLED_DERIVED** — `/server/stats` marks estimates, this page does not, and the same number drives ordering |
| Movement "Up X% on usual" | `performance-engine.ts:884-885` | leaderboard-score delta | HIGH · NO_TRANSPARENCY |
| Most improved | `performance-engine.ts:913-917` | same movementPct | LOW |
| Category items leaderboard | `:104-107` | real OR estimated | MEDIUM · UNLABELLED_DERIVED |

---

## `/server/progress` — `src/routes/server.progress.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| "Your position this week #pos of total" | `:77` | `get_leaderboard_position` RPC — by items sold (mostly estimated) | MEDIUM · NO_TRANSPARENCY · FORMULA_DRIFT vs team page |

---

## `/server/profile` — `src/routes/server.profile.tsx`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| **Total uplift £** | `:174-176` | Σ positive `revenueInfluence` over ≤12 weeks (negatives excluded) | **BLOCKER · NO_TRANSPARENCY** + inherits the BLOCKER baseline |
| £500 milestone | `:133` | `uplift ≥ 500` | HIGH · NO_TRANSPARENCY |

---

## `/calculator/` — `src/routes/calculator.index.tsx`

Largely transparent (sliders + methodology paragraph). One LOW finding: the `12–20% higher SPC` receipt line (`:326-332`) doesn't restate the assumption inline. LOW · NO_TRANSPARENCY.

---

## `/calculator/server-gap` — `src/routes/calculator.server-gap.tsx` + `src/lib/server-gap/*`

| Metric | Code | Formula | Sev |
|---|---|---|---|
| Per-shift OF | `server-gap/opportunity.ts:117-172` | minute-weighted mean over hardcoded 7×24 grid | **BLOCKER · OF_INCONSISTENT** (3 OF systems coexist; see 04) |
| Adjusted hours | `server-gap/calc.ts:57` | `hours × factor` | LOW |
| Adjusted RPH | `server-gap/calc.ts:103` | `Σsales / Σadj_hours` (weighted) | LOW |
| Team benchmark | `server-gap/calc.ts:111-121` | `Σ all_sales / Σ all_adj_hours` | LOW |
| Gap vs team % | `server-gap/calc.ts:127-128` | `(serverAdj − teamAdj) / teamAdj` | LOW |
| Recoverable weekly per server | `server-gap/calc.ts:131` | `max(0, −gapAbsRPH) × totalAdjHours` | LOW |
| Recoverable monthly/annual | `server-gap/calc.ts:138-149` | `weekly × 52/12` and `× 52` | LOW (`52/12` undisclosed) |
| Net vs Gross toggle | `:97-103` | user-selectable, auto-picks net | LOW · BENCHMARK_BASIS_MISMATCH (LLS dashboard is always gross) |
| Rank above/tracking/below | `server-gap/calc.ts:129-131` | ±5% gap bands | MEDIUM · THRESHOLD_DRIFT (v2 RAG uses ±10%) |
| Confidence pill | `server-gap/confidence.ts:30-43` | match≥90 & defaulted<10 & ambiguous=0 → High; thresholds independent of v2 | LOW · THRESHOLD_DRIFT |

---

## `/demo/*` — `src/routes/demo.manager.*`, `demo.server.*`, `src/lib/sample-data.ts`

All numbers are hardcoded constants from `sample-data.ts`. Routes are reachable to any authenticated user inside the production shell.

| Where | Hardcoded value | Sev |
|---|---|---|
| `/demo/manager/` | `totalCovers 812`, `avgSpc 58.4`, `uplift £1,420`, `£620 wine opportunity`, `4/5 viewed`, 80% donut | HIGH · HARDCODED_OR_DEMO_LEAK |
| `/demo/manager/` cats array | `cats = [{key:"spc", label:"Spirits"}, {key:"water", label:"Sparkling"}]` (lines 32-39) — keys wrong, the dot under "Spirits" actually shows SPC status | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| `/demo/manager/server/$id` | per-cat scores 42/88/64/81/67/38/60/31, uplift £140/60/320/180/50 | HIGH · HARDCODED_OR_DEMO_LEAK |
| `/demo/server/stats` | bar fill uses raw conversion as a width%, no "% of target" label | MEDIUM · NO_TRANSPARENCY |
| `src/lib/server-data.ts:13-15` | `DEFAULT_PRICES = {wine:9, cocktail:11, dessert:7, sides:5, spirits:8, sparkling:12}` GBP — fires on **production** routes when no menu uploaded | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| `src/lib/performance-engine.ts:181` | `WEIGHTS = {target:0.35, trend:0.30, commercial:0.25, consistency:0.10}` — no per-venue config, no model version string | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| `src/lib/performance-engine.ts:191-192` | `trendScore` `clamp(±5pp)` | LOW · HARDCODED_OR_DEMO_LEAK |
| `src/lib/performance-engine.ts:207` | `commercialScore` floor 0.25, ceiling 2.0 | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| `src/lib/performance-engine.ts:221` | `consistencyScore` < 20 opp → 0.5 neutral | LOW |
| `src/lib/performance-engine.ts:128-133` | `eliteTierOf` 100/120/150% | MEDIUM |
| `src/lib/performance-engine.ts:717-730` | `scoreTone` green ≥75; `scoreLabel` "Strong" ≥70, "Crushing" ≥85 | MEDIUM · THRESHOLD_DRIFT |
