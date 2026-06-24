# Opportunity Factor — All Reads, Defaults, Applications

Three independent OF subsystems coexist. No metric in the UI tells the user which OF was applied.

## BLOCKERs

1. **`comparison.functions.ts:140`** — `venueOf = mean(factor_rows)` over the entire 7×5 venue grid, then applied to **the whole week** as `v2AdjLabor = v2Labor × venueOf`. This nullifies the per-shift point of v2 OF entirely. The v2 calculation library (`lls/v2/calculations.ts:10, 44-49`) applies OF per-shift correctly — the compare page bypasses it.
2. **`OF_INCONSISTENT` across the app** — three formulas, three clamp ranges, no shared config, no UI label. A server's "fairness adjustment" depends on which page the manager is on.
3. **`performance-engine` is OF-blind** — `expectedSales` / `revenueInfluence` / `commercialScore` use raw `covers` or `opportunityCount` with no OF. A server working only Friday-dinner Peak gets no credit for that vs a server working only Monday-lunch.

---

## All read/derive/default/apply sites

| # | Location | What | Default when missing | How it's multiplied in |
|---|---|---|---|---|
| 1 | `server-gap/opportunity.ts:117-172` | Minute-weighted mean across a hardcoded 7×24 hour grid | `1.0` if no times | `adjustedHours = hours × factor` |
| 2 | `server-gap/opportunity.ts:138-140` | Single start time → assume 4h, `estimated: true` | — | same |
| 3 | `server-gap/calc.ts:94-104` | `avgFactor = Σ(factor × hours) / Σhours` — hours-weighted ✅ | — | display only |
| 4 | `server-gap/confidence.ts:36-37` | Warns when `defaultedRate > 25%` | — | — |
| 5 | `lls/v2/opportunity.ts:43-133` | COI(0.4) + REI(0.35) + LDI(0.25), smoothed by `smoothingWeight(count)` 0.25–1.0 | `1.0` if `comparable_count < 5` or `<2` components | computed once per bucket |
| 6 | `lls/v2/opportunity.ts:131` | Clamp to `[0.75, 1.40]` | — | — |
| 7 | `lls/v2/calculations.ts:10` | `effective_of = override_of ?? system_of` | `system_of` (which defaults to 1.0) | `adj_labor_cost = labor_cost × effective_of` per shift |
| 8 | `lls/v2/calculations.ts:44-49` | Weekly: `adj_cost += labor_cost × eof` per shift, then `Σ` | ✅ | weighted Σ |
| 9 | `lls/v2/benchmark.ts:21-29` | `comparable_adjusted_labor = comparable_labor × effectiveSystemOf` per bucket | caller supplies | ✅ |
| 10 | `lls.functions.ts:543` (v1) | Reads `shifts.opportunity_factor` per shift | **`1.0` silently** if null or `≤0` | `adj_labor = labor × of` per shift |
| 11 | `manager.lls.index.tsx:619-655` (v1 editable grid) | 7×5 grid in `venue_opportunity_factors`, clamped `[0.7, 1.4]` (note: different clamp from v2's 0.75–1.40) | initial-load grid filled with `1.0` | written back to `shifts.opportunity_factor` via `recalculate_lls_for_week` RPC |
| 12 | `lls.functions.ts:326-368` `suggestOpportunityFactors` | `bucketAvgSales / venueAvgSales × confidence_weight (0.25–1.0)`, clamped `[0.75, 1.4]` | not applied automatically | manager review then save |
| 13 | `comparison.functions.ts:77-82` (v1 current week in compare) | reads shift OF, fallback `1.0` | `1.0` | `v1AdjLabor += labor × of` |
| 14 | `comparison.functions.ts:99-102` (v1 historical in compare) | same pattern | `1.0` | `v1HistAdj += labor × of` |
| 15 | **`comparison.functions.ts:135-140` (v2 in compare)** | **arithmetic mean of all venue_opportunity_factors.factor rows** | `1.0` if no rows | applied to **the whole week**, not per-shift |
| 16 | `performance-engine.ts:469-484` | No OF anywhere | — | OF-blind |

---

## Inconsistency flags

- **Two OF systems, no shared config.** LLS v2 (`lls/v2/`) and server-gap (`src/lib/server-gap/`) implement OF independently with different grids and different clamp ranges (0.75–1.40 vs ~0.825–1.35 effective).
- **Direction of multiplication differs.** v2 multiplies labor cost up by OF; server-gap multiplies hours up by OF. Mathematically equivalent in isolation; absolute magnitudes incompatible across views.
- **Performance-engine is OF-blind.** Category conversion and overall score get no OF adjustment, only the LLS module does.
- **v1 grid clamp [0.7, 1.4] differs from v2 clamp [0.75, 1.40].** Edited values in the grid can exceed what v2 would clamp.
- **v2 compare-page applies one venue-mean OF to a whole week**, instead of using the per-shift system OF the v2 library computes. This is the most consequential OF bug: the entire "v2 vs v1" comparison the pilot will look at is computed on a degenerate OF.
- **Default 1.0 is consistent across all systems** — that's the only thing that is.

---

## What the UI tells the user about OF

- `/manager/lls` Opportunity Factor grid panel: guidance text on what OF does ✅; "Generate suggested factors" toast explains the source.
- `/calculator/server-gap` methodology accordion: explains the time-grid factor in prose ✅; band values not disclosed.
- `/manager/lls/compare`: nothing. No badge, no formula, no disclosure that v2 is using an averaged OF.
- `/manager/lls` Adjusted LLS badge: shows the formula in `title` tooltip but does not disclose that null/0 OF defaults silently to 1.0.
- Every other metric (`/manager`, `/manager/server/$id`, `/manager/team`, `/server/*`): no OF surfaced at all.

---

## Recommended canonical (for Stage 2)

- Single shared `OFConfig` in `src/lib/lls/v2/config.ts` (already exists with `version: "of-v2.0.0"`). Mirror it in server-gap and performance-engine.
- v1 grid clamp [0.75, 1.40] to match v2.
- `comparison.functions.ts` v2 path must call `getSystemOpportunityFactor` per bucket and `calcWeekly` per shift, not `mean()` over grid rows.
- Performance-engine: thread bucket OF into `expectedSales` (`(venueWeightedConversion / 100) × opportunityVolume × avgUnitPrice × bucketOF`) — or at minimum document that category scores are OF-blind.
- UI: every page that shows an OF-adjusted number should expose `{ basis: "v1 grid" | "v2 system" | "time-grid" }` and the effective OF in a tooltip.
