# Phase A.3 — Remaining Calculation Surface Audit

Scope: every file still computing metrics outside the canonical engine
(`src/lib/metrics/`), where it is used in the live app, and what to do
before presentation.

---

## 1. Legacy calculation files (still live)

| File | Lines | Status | Role |
|---|---|---|---|
| `src/lib/performance-engine.ts` | 1086 | Legacy, in use | Category targets, opportunity uplift, RAG ring, elite tier, leaderboard, weekly reflection. Server-gamified math + a small set of manager surfaces. |
| `src/lib/lls/v2/comparison.functions.ts` | 261 | Active, partially canonical | v1 vs v2 weekly comparison server fn. Gap math uses canonical `performanceGap`, but the **benchmark window differs by model** (see §4). |
| `src/lib/server-data.ts` | 141 | Live (server pages) | Personal server feed shape. Pass-through; not a calculation source. |
| `src/lib/sample-data.ts` | 135 | Demo only | Hardcoded fixtures used exclusively by `/demo/*` routes. |
| `src/lib/server-gap/calc.ts` | — | Canonical (migrated A.2) | Uses engine. |
| `src/lib/lls.functions.ts` | — | Canonical (migrated A.2) | Uses engine. |
| `src/lib/lls/v2/calculations.ts` | — | Canonical (migrated A.2) | Uses engine. |

No other legacy math files were found under `src/lib`.

---

## 2. Where `performance-engine.ts` is imported

| Route | UI location | Audience | Symbols used | Visible metrics powered |
|---|---|---|---|---|
| `src/routes/manager.index.tsx` | `/manager` dashboard | **Manager-facing** | `loadVenuePerformance`, `scoreTone`, `scoreLabel`, `statusTone`, `VenuePerformance` | Team list "score" pill + tone, status indicator next to each server. |
| `src/routes/manager.team.tsx` | `/manager/team` | **Manager-facing** | `loadVenuePerformance`, `scoreTone`, `scoreLabel`, `VenuePerformance` | Server cards: overall score, status tone. |
| `src/routes/manager.server.$id.tsx` | `/manager/server/:id` (drill-down) | **Manager-facing** | `loadServerPerformance`, `overallScore`, `formatItems`, … | Category table per server: current %, target, item count, overall score header. |
| `src/routes/server.index.tsx` | `/server` home | Server-only (gamified) | full surface | Hero score, momentum, focus cat. |
| `src/routes/server.stats.tsx` | `/server/stats` | Server-only | full surface | Per-category rings, deltas, "items to target". |
| `src/routes/server.leaderboard.tsx` | `/server/leaderboard` (Ranks) | Server-only | `categoryLeaderboard`, `percentileRank`, `weeklyMovers` | Rank chips, percentile, movers. |
| `src/routes/server.profile.tsx` | `/server/profile` | Server-only | `eliteTierOf`, `overallScore` | Elite tier, lifetime stats. |
| `src/routes/server.welcome.tsx` | `/server/welcome` | Server-only | `weeklyReflection`, `nextWeekOpportunity` | Coaching prompts, opportunity uplift line. |
| All `src/routes/demo.*.tsx` | `/demo/*` (marketing) | **Buyer-visible** | sample-data + engine | Marketing fixtures. |

Routes that **do not** import the legacy engine (already clean):
`manager.coaching`, `manager.priorities`, `manager.menu`, `manager.reports`,
`manager.lls.index`, `manager.lls.compare`, `calculator.server-gap`.

---

## 3. Classification of every remaining legacy metric

### MUST migrate before presentation (manager-facing)

| Metric | Where it shows | Why it must move |
|---|---|---|
| `loadVenuePerformance` → server score pills on `/manager` and `/manager/team` | Team grid score + tone | Uses `performanceScore` (target/trend/commercial/consistency weights), **not** canonical RAG/Gap. A manager comparing this against `/manager/lls` will see a different verdict for the same server. |
| `overallScore(perf)` header on `/manager/server/:id` | Top-of-page score | Same scoring formula as above; manager-facing. |
| `formatItems(row)` per category row on `/manager/server/:id` | "X items" cell | Mixes evidenced vs derived item counts with **no `est.` label**. |

Recommendation: **wrap, do not rewrite, before the presentation.**
Add a thin adapter that calls the canonical engine for the headline number
and keeps the legacy detail rows behind a `data-legacy` flag. Full migration
is a Phase B/C task, but the headline must agree with `/manager/lls`.

### Safe if labelled estimated/directional (manager-facing, low risk)

| Metric | Where | Label required |
|---|---|---|
| Category "items to target" on `/manager/server/:id` | drill-down table | "est. items" tooltip + footnote: derived from avg item price. |
| Opportunity uplift £ on `/manager/server/:id` (if shown) | column | "modelled uplift" wording. |

### Server-gamified only — OK to leave visually, must not contradict manager

| Surface | Action |
|---|---|
| `/server`, `/server/stats`, `/server/leaderboard`, `/server/profile`, `/server/welcome` | Keep the gamified UI, but: (a) anywhere a numeric "items count" is shown that came from price-derivation, prefix `est.`; (b) total uplift line in `weeklyReflection` and `nextWeekOpportunity` must read "modelled / directional"; (c) the elite tier / rank order must use the same RAG bands as the manager (`strong / tracking / monitor / priority` thresholds at +10 / ±5 / -5..-10 / <-10) so a server ranked "green" here is not "amber" on manager-side. |
| `/server/menu`, `/server/progress` | No labour, no scheduling, no LLS, no labour cost — verified clean. |

### Not currently used / dead code

| Symbol | Notes |
|---|---|
| `humanTargetCall`, `reflectionLine`, `opportunityLine`, `targetItems`, `humanItemsDelta` | Defined in `performance-engine.ts`; ripgrep shows no callers outside the file itself. Safe to leave for now; delete in Phase D cleanup. |

---

## 4. `/manager/lls/compare` benchmark window — structural mismatch

Confirmed in `src/lib/lls/v2/comparison.functions.ts`:

- **v1 benchmark** (line 87): hardcoded prior **4 weeks** of `shifts`.
- **v2 benchmark** (line 60–61, 171): `venues.lls_v2_baseline_weeks` (default **8 weeks**) of `shifts_v2`.

Even though the gap math `performanceGap(adjLls, benchmark)` is now canonical,
the two sides are computing the gap against **different historical windows**.
A v1 vs v2 "gap difference" on the same week can be caused entirely by the
window length, not by the model.

### Required before presentation — pick one

1. **Make windows consistent.** Change v1's benchmark loop to use the same
   `baselineWeeks` value (`addDays(ws, -7 * baselineWeeks)`), so both
   models compare against the same prior window.
2. **Label both windows in the UI and the audit.** Render the window length
   next to each headline value: "v1 benchmark: last 4 weeks", "v2 benchmark:
   last N weeks". Add a yellow info banner on the page explaining the
   methodology gap.
3. **Hide `/manager/lls/compare` for the presentation.** Remove the nav
   entry; keep the route reachable by URL for internal QA only.

Lowest-risk pre-presentation choice: **option 1** (one-line change in
`comparison.functions.ts`). Option 2 is the right long-term answer once
provenance badges land in Phase B.

Until one of the three is done, `/manager/lls/compare` is **NOT** safe to
describe as "fully calculation-safe."

---

## 5. Cross-cutting risk checklist

| Risk | Status |
|---|---|
| Average-of-averages where weighted totals required | **Clean** on `/manager/lls`, `/manager/lls/compare`, `/calculator/server-gap` (all use engine `aggregate`). Legacy `performance-engine.ts` uses simple averages for category metrics — only visible on server-gamified + manager.team scoring; flagged above. |
| Raw sales ranking where adjusted ranking is needed | `categoryLeaderboard` ranks by raw `sales` (line ~894). **Server-only surface** (`/server/leaderboard`); acceptable as gamified, but rank position must not be referenced on any manager view. Verified — manager team grid does not import `categoryLeaderboard`. |
| Mixed real + estimated item counts without labels | **Present** on `/manager/server/:id` and `/server/stats` via `formatItems`. Needs `est.` label (see §3). |
| Hardcoded / demo values in live buyer paths | `sample-data.ts` is only imported by `/demo/*` routes. **Marketing-only**, expected. No live manager or `/calculator` route uses it. |
| Opportunity Factor applied after aggregation | **Clean** post-A.2. Engine enforces shift-level application; legacy `performance-engine.ts` does not deal with OF at all. |
| Benchmark basis mismatching score basis | **Clean** for LLS (engine guard). **Mismatch** on `/manager/lls/compare` window (§4). |

---

## 6. Per-page safety verdict (post-A.2, pre-A.3 fixes)

| Page | Verdict |
|---|---|
| `/manager/lls` | **Safe to demo.** Canonical. |
| `/calculator/server-gap` | **Safe to demo.** Canonical. |
| `/manager/lls/compare` | **Not safe** until §4 is resolved. Recommend option 1 or hide. |
| `/manager` (home), `/manager/team` | **Demo with caveat.** Score pill uses legacy `performanceScore`. Either (a) replace the pill with an engine-derived RAG band, or (b) avoid clicking into team/score on stage. |
| `/manager/server/:id` | **Demo with caveat.** Same as above + needs `est.` label on item counts. |
| `/manager/coaching`, `/manager/priorities`, `/manager/menu`, `/manager/reports` | **Safe to demo** — no legacy engine import. |
| `/server/*` (all six) | **Safe to demo as gamified.** Apply `est.` / "modelled" labels in Phase B; do not expose any of these screens as "the analytics view." |
| `/demo/*` | **Marketing only.** Keep, but do not mix into the live calc story. |

---

## 7. Recommendation for the next phase

Before starting Phase B (tooltips/badges):

1. **One-line fix** in `comparison.functions.ts` to align v1 benchmark
   window with `baselineWeeks` (or explicit decision to label / hide).
2. **Adapter** so `/manager` and `/manager/team` score pills derive from
   `engineRagBand`/`enginePerformanceGap` instead of `performanceScore`.
   Keep legacy detail rows untouched.
3. **Labels pass** on `/server/*` and `/manager/server/:id`:
   `est.` on derived item counts, "modelled / directional" on uplift lines.

These three are small, surgical changes — no UI redesign, no Scheduling
Leverage Matrix, no server-dashboard restructuring. Once they ship, every
manager-facing number in the product is either canonical or explicitly
labelled directional, which is the precondition you set for Phase B.

Then Phase B: provenance/tooltips/basis badges on the canonical surfaces.
Then Scheduling Leverage Matrix on `/manager/lls`.
