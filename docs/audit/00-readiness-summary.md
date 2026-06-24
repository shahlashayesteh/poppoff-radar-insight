# Stage 1 — Presentation Readiness Risk Summary

Read-only audit. No code changed. Generated 2026-06-23.

Detail lives in:
- [01-calculations.md](./01-calculations.md)
- [02-imports.md](./02-imports.md)
- [03-benchmarks-and-ranking.md](./03-benchmarks-and-ranking.md)
- [04-opportunity-factor.md](./04-opportunity-factor.md)
- [05-transparency-gaps.md](./05-transparency-gaps.md)

---

## 🛑 MUST FIX before presentation (BLOCKERs on a buyer-likely path)

| # | Where the buyer sees it | What's wrong | Fix doc |
|---|---|---|---|
| 1 | `/calculator/server-gap` (public, the marketing CTA) — every uploaded shift | `dateKey()` in `src/lib/server-gap/parse.ts:141-145` has a copy-paste bug: both branches of the DD/MM vs MM/DD ternary return the same variable. Any ambiguous date with `DD≤12` lands on the wrong day, corrupting matching and the ranking. | 02 |
| 2 | `/manager/lls` — every venue's labor cost denominator | `manager.lls.index.tsx:837` silently promotes `fully_loaded_labor_cost` into the `labor_cost` slot when no plain `labor_cost` column is detected. No warning, no toast. Inflates the LLS denominator by 20–35% and deflates every server's score relative to the v1 threshold defaults. | 02 |
| 3 | `/manager/server/$id`, `/manager/team` — "Revenue influence", overall Score | `venueBaselineConversion` in `performance-engine.ts:463` is an unweighted `mean()` of weekly conversion rates AND uses raw `covers` as the opportunity proxy for every category — wine should divide by tables, dessert by eligible covers, etc. Feeds `expectedSales`, `revenueInfluence`, `commercialScore`, `overallScore`. Every server card is showing a number derived from this. | 01, 03 |
| 4 | `/manager/server/$id`, `/manager/team` — "Overall score" | `overallScore()` weight tier is `expectedSales → currentSales → 1`. Within a single server, some categories get commercial weighting, others raw-sales, others equal — so the headline score has no consistent basis. | 01, 03 |
| 5 | `/server/leaderboard` — rank order | `itemsForRow()` mixes real POS quantity with `sales ÷ avgPrice` estimates and shows them as the same number with no `~est.` marker (unlike `/server/stats` which does mark it). Servers are ranked against each other on incomparable units. | 01, 05 |
| 6 | `/manager/lls/compare` (pilot only, gated by `lls_compare_mode`) | Three blockers stack here: (a) v1 benchmark uses prior 4 weeks, v2 uses prior 8 weeks — same UI label "Venue Benchmark"; (b) v2 OF is a simple arithmetic mean of all 35 grid cells (`comparison.functions.ts:140`), not weighted by labor hours and applied to the whole week instead of per-shift, nullifying the point of v2; (c) v1 in-app "Venue Benchmark" is current-week, the compare page's v1 is prior-4-week — same label, different windows. | 01, 03, 04 |

**If any of those buyer paths will be shown live, fix before presenting.** Item 6 only matters if the pilot venue is being demoed.

---

## ⚠️ RISKY — safe to present only with a verbal caveat

| # | Where | Caveat to use on stage |
|---|---|---|
| 7 | `/manager/lls` — Adjusted LLS coloured badge | When `opportunity_factor` is `null`/`0`, `lls.functions.ts:543` silently uses `1.0`. No UI marker. Say "OF defaults to 1.0 for shifts before the grid was configured." |
| 8 | `/manager`, `/manager/server/$id`, `/manager/reports` — SPC | The KPI computes `Σsales / Σcovers` live, the per-server card reads the stored `spend_per_cover` column, the reports table recomputes again. Numbers can disagree across pages for the same server-week. Avoid quoting an exact SPC across two pages. |
| 9 | `/manager` and `/server/leaderboard` — ranking | Manager page ranks by composite score, server-facing leaderboard ranks by raw sales. Don't claim "the same leaderboard." |
| 10 | All conversion-driven UI | `performance-engine` reads `net_sales` when present, LLS module reads `gross_sales` exclusively. Category scores and LLS are not on the same sales basis. |
| 11 | RAG colours across pages | Three RAG systems coexist with different thresholds: `ragFromRing` (90/65 of target), `ragFromMomentum` (±3pp), `ragFromGap` (±10%). Same dot, different rules. |
| 12 | `/manager/lls/compare` "Modelled revenue opportunity" | Formula not shown. Pilot-only audience, but say "modelled, not realised." |
| 13 | `/calculator/server-gap` Opportunity Factor | Computed from a hardcoded 7×24 hour grid in `server-gap/opportunity.ts`. Independent of the v1 manager grid and the v2 COI/REI/LDI blend. Three OF systems, one app. |

---

## 🕒 CAN WAIT until after the presentation

- All transparency findings classified MEDIUM/LOW in [05-transparency-gaps.md](./05-transparency-gaps.md) (formula tooltips, "pp" spelled out, milestone-threshold reasoning, etc.).
- Hardcoded constants without per-venue config: composite-score `WEIGHTS`, `commercialScore` normalisation 0.25/2.0, `trendScore` ±5pp clamp, `consistencyScore` opp<20 floor, `DEFAULT_PRICES` £ table, `lls_green/amber_threshold` defaults 13/10.
- `scoreTone` vs `scoreLabel` threshold drift (75 vs 70 vs 85) — UX confusion but not numerically wrong.
- `/calculator/server-gap` ±5% rank band vs v2 ±10% RAG gap — different surfaces, low confusion risk.
- `/demo/*` "ELITE/TOP" tier glow thresholds (100/120/150) hardcoded but internally consistent.
- Menu uploader (`/manager/menu`) sending CSV-as-text to the LLM if a user mis-uploads a stats file.

---

## ✅ SAFE to present as-is

- `/manager/lls` weekly RPC, Base LLS, Adjusted LLS, Gap, RAG columns — formulas already in `<th title>` tooltips and a legend below the table.
- `/calculator/server-gap` Adjusted RPH, Team benchmark, Gap %, Recoverable — methodology accordion + confidence pill + warnings list + net/gross toggle disclosed in UI.
- `/calculator/` (input-driven calculator) — all assumptions are visible sliders with the 12–20% basis paragraph and a directional disclaimer.
- LLS v2 calculation library itself (`src/lib/lls/v2/`) — weighted totals throughout, per-shift OF, clamped, versioned (`of-v2.0.0`). The bug is in how the **compare page** consumes it, not the engine.
- `/manager/lls` Opportunity Factor grid edit flow — guidance text, clamped 0.7–1.4, low-confidence warning on suggested factors.
- Server-gap merge: 4-tier priority matching, flags ambiguous rows instead of silently guessing.

---

## What I still need from you

1. Will the demo path cover `/manager/lls/compare`? If yes, item 6 is a BLOCKER; if no, downgrade to HIGH.
2. Are any of the per-page formula deviations (e.g. SPC stored vs recomputed) intentional?
3. Default "recoverability factor" to use for Recoverable Opportunity, or keep the current `Σ max(0, teamRPH − serverRPH) × serverHours` exactly?
4. Tip/attach denominator preference when `eligible_*` is absent — approximate with a label, or hide the metric?

I have **not** changed any code. Awaiting your review before any Stage 2 work. Per your gate: I am surfacing the BLOCKERs above and asking before touching code.
