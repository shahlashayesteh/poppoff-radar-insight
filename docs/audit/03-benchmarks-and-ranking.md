# Benchmarks, Thresholds, Ranking, RAG

Every benchmark, threshold, RAG band, classification rule, and ranking sort across the app.

## BLOCKER / HIGH

| # | Risk | Where |
|---|---|---|
| B-1 | `AVG_OF_AVG` + `BENCHMARK_BASIS_MISMATCH` | `venueBaselineConversion` (`performance-engine.ts:460-463`) is `mean()` of weekly conversion rates AND uses raw `covers` as the opportunity proxy for every category. Wine should be denominated by tables; the engine *declares* `categoryDenominator(...)` at `:153-163` and then ignores it in the baseline calc. Feeds expected sales, revenue influence, commercial score, overall score. |
| B-2 | `AVG_OF_AVG` + `OF_INCONSISTENT` | `comparison.functions.ts:140` `venueOf = mean(factor rows)` applied **to the whole week** instead of per-shift. Used as the OF basis on `/manager/lls/compare`. |
| H-1 | `THRESHOLD_DRIFT` | v1 historical benchmark = hardcoded `-28` days at `comparison.functions.ts:87`. v2 baseline = `venue.lls_v2_baseline_weeks ?? 8` weeks at `:61`. Same compare UI, two windows. |
| H-2 | `FORMULA_DRIFT` + `BENCHMARK_BASIS_MISMATCH` | `overallScore()` weight tier `expectedSales → currentSales → 1` (`performance-engine.ts:619-624`). Mixes three weight bases within a single server's score. |
| H-3 | `OF_INCONSISTENT` | Three OF subsystems coexist with no shared config — see [04](./04-opportunity-factor.md). |
| H-4 | `HARDCODED_OR_DEMO_LEAK` | `/demo/*` numbers (scores 42/88/64/…, uplift £140/60/320/…, KPIs £1,420/£620/+14%/+9%) are fabricated, surfaced via the authenticated manager shell. |
| H-5 | `THRESHOLD_DRIFT` | `scoreTone()` green ≥ 75; `scoreLabel()` "Strong" ≥ 70, "Crushing" ≥ 85 (`performance-engine.ts:717-730`). Three cut-points for the same quality signal. |

---

## Benchmark inventory

| Surface | File:line | Basis | Window | Weighting | Match with metric basis? |
|---|---|---|---|---|---|
| LLS scorecard "Venue Benchmark" | `lls.functions.ts:558` | `Σ venueGross / Σ venueAdjLabor` | **current week** | weighted Σ/Σ ✅ | label is identical to compare-page benchmark which uses a different window — **BLOCKER · MANAGER_SERVER_DIVERGENCE** |
| Compare-page v1 benchmark | `comparison.functions.ts:104` | same formula | **prior 4 weeks** (hardcoded `-28`) | ✅ | mismatched window vs scorecard — **BLOCKER** |
| Compare-page v2 comparable Adj LLS | `comparison.functions.ts:188` | `Σ histGross / Σ (histLabor × venueAvgOF)` | **prior 8 weeks default** | ❌ unweighted OF | **BLOCKER · AVG_OF_AVG + THRESHOLD_DRIFT** |
| LLS v2 library `getBenchmark` | `lls/v2/benchmark.ts:21-29` | `Σ histGross / Σ (histLabor × systemOf)` per bucket | configurable `baselineWeeks` (4/8/12) | per-shift system OF ✅ | ✅ — correct; bypassed by compare page |
| Server-gap team benchmark | `server-gap/calc.ts:111-121` | `Σ allSales / Σ allAdjHours` | uploaded shift set | ✅ | LOW |
| LLS absolute green/amber fallback | `lls.functions.ts:167-169, 660-663` | constants `13.0` / `10.0` | n/a | n/a | MEDIUM · HARDCODED_OR_DEMO_LEAK |
| Venue baseline conversion | `performance-engine.ts:460-463` | `mean(weekly conversion rates)` | up to 8 weeks × all servers | ❌ unweighted | **BLOCKER · AVG_OF_AVG** |

---

## RAG / classification thresholds

| Function | File:line | Bands | Used on |
|---|---|---|---|
| `ragFromGap` (LLS v1+v2) | `lls.functions.ts:484-488`; `lls/v2/config.ts:70` | green ≥ +10%, red ≤ −10%, amber otherwise | `/manager/lls`, `/manager/lls/compare` |
| `ragFromRing` | `performance-engine.ts:742-747` | green ≥ 90% of target, amber ≥ 65%, red below | `/server/stats`, `/manager/server/$id` |
| `ragFromMomentum` | `performance-engine.ts:945-950` | green ≥ +3%, amber ±3%, red ≤ −3% | `/server/stats`, `/server/` |
| `humanMomentum` dead-band | `performance-engine.ts:786-789` | <3% → "Right on your usual" | `/server/stats` |
| `statusFromDelta` | `performance-engine.ts:139-144` | Focus ≤0pp, Improving 0–2pp, Strong 2–5pp, Crushing >5pp (delta) | `/manager` team dots, returns same `TrendStatus` type as `scoreLabel` |
| `scoreLabel` | `performance-engine.ts:724-730` | Focus <55, Improving 55–70, Strong 70–85, Crushing ≥85 (score) | `/manager/team`, `/manager/server/$id` |
| `scoreTone` | `performance-engine.ts:717-722` | green ≥75, amber ≥55, red <55 | colour dots — out of step with scoreLabel cut-points |
| `eliteTierOf` | `performance-engine.ts:128-133` | 100/120/150% of target | `/server/stats` ELITE/TOP badges |
| Server-gap `rank` | `server-gap/calc.ts:129-131` | ±5% gap → above/tracking/below | `/calculator/server-gap` |
| Server-gap confidence | `server-gap/confidence.ts:30-43` | High: match ≥90 & defaulted <10 & ambiguous=0; Low: match <75 OR defaulted >25 OR ambiguous >10% | `/calculator/server-gap` |
| LLS v2 confidence (Benchmark/Result/Final bands) | `lls/v2/config.ts:37-67` | min periods/weeks/hours/covers, attrib quality | `/manager/lls/compare` (pilot) |

`MANAGER_SERVER_DIVERGENCE` — leaderboard ranking:
- `/manager/team`, `/manager/server/$id`: sort by `overall` composite score (`performance-engine.ts:686-688`).
- `/server/leaderboard`, `/server/`: sort by `current_sales` raw £ (`performance-engine.ts:889`).
- `/server/progress`: `get_leaderboard_position` RPC, by items sold (mostly estimated).
- Same "rank" word, three orderings. **HIGH · FORMULA_DRIFT**.

---

## Simple averages used where weighted totals are correct

| Location | Problem |
|---|---|
| `performance-engine.ts:463` | `venueBaselineConversion = mean(...)` — unweighted across server-weeks of unequal volume |
| `performance-engine.ts:698` | `avgOverall = mean(overalls)` — mean of weighted means, no hour/sales weighting |
| `comparison.functions.ts:140` | `venueOf = sum/count` of factor rows — not weighted by labour hours or shift count |
| `server-data.ts:54` | `avgUnitPrice = mean(prices)` — unweighted across category items (a £5 side and a £40 wine carry equal weight in "wine" estimates) |
| Per-week "vs 4wk avg" deltas across the app | `mean(last4.sales)` — fine for a quick trend but technically AVG_OF_AVG if used as a target |

---

## Hardcoded thresholds with no per-venue config (governance risk)

`WEIGHTS` `:181`, `commercialScore` floor/ceiling `:207`, `trendScore` ±5pp clamp `:191`, `consistencyScore` <20 opp `:221`, `scoreTone`/`scoreLabel` cut-points `:717-730`, `eliteTierOf` `:128-133`, `DEFAULT_PRICES` (`server-data.ts:13-15`), `lls_green/amber_threshold` defaults `13.0/10.0` (`lls.functions.ts:167-169`), server-gap `±5%` rank band, server-gap confidence cut-offs.

No model-version string on any of these. Changing them silently re-ranks history because scores are recomputed on read from stored stats. **MEDIUM** governance concern — log a "model version" alongside scores in Stage 2.

---

## Threshold duplication map

| Concept | Values | Locations |
|---|---|---|
| OF default | 1.0 (all) | server-gap, lls v2, comparison.functions |
| OF clamp range | 0.75–1.40 (v2) vs 0.825–1.35 effective (server-gap) | `lls/v2/config.ts:10-11` vs `server-gap/opportunity.ts:7-10` |
| Performance gap RAG | ±10% | `lls.functions.ts:484`, `lls/v2/config.ts:70` |
| Ring RAG | 90 / 65 % of target | `performance-engine.ts:744-745` |
| Momentum RAG | ±3% | `performance-engine.ts:947-948` |
| "Tracking" RPH band | ±5% | `server-gap/calc.ts:130` |
| v1 benchmark window | 4 wk (hardcoded -28) | `comparison.functions.ts:87` |
| v2 benchmark window | 8 wk default | `comparison.functions.ts:61`, `lls/v2/config.ts:19` |
| Score "green" entry | 75 (tone) / 70 (label) / 85 (label upper) | `performance-engine.ts:719/726/727` |
