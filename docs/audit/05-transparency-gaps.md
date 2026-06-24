# Transparency Gaps

Every place a calculated metric is rendered without showing the user a formula, source field, basis, or tooltip. Each finding tagged `NO_TRANSPARENCY` plus extra risk codes where the missing context hides a numerical risk.

---

## Buyer-likely BLOCKER / HIGH gaps

| # | Visible path | What they see | What's invisible |
|---|---|---|---|
| T-1 | `/manager` and `/manager/team` — "Score" 0–100 per server | bare number / coloured chip | weighted-average formula + three-tier weight fallback (`expectedSales → currentSales → 1`) |
| T-2 | `/manager/server/$id` — "Revenue influence" | `+£47 vs venue baseline` | the formula, that "venue baseline" is an unweighted mean over 8 weeks, that price is a venue avg, that wine uses a covers-not-tables proxy |
| T-3 | `/manager/server/$id` — Category bars `42% / 65%` conversion | `42%` | denominator (`denominatorType` is computed in engine and never rendered). 42% wine vs 42% dessert are not comparable. |
| T-4 | `/server/profile` — "Total uplift £312" | one big number | sum-of-positive-only revenue influence over up to 12 weeks; inherits the baseline blocker |
| T-5 | `/server/leaderboard` — items column drives rank order | `24 items sold` | mixes real POS qty with `sales ÷ price` estimates with no `~est.` (the `/server/stats` page does mark estimates) |
| T-6 | `/manager` — "Avg Spend per Cover" KPI | `£58.40` | `Σsales / Σcovers`; whether sales is net or gross; that the per-server card uses a different source |
| T-7 | `/manager` — Team Performance table RAG dots | green/amber/red | dots = `statusFromDelta(Δpp vs 4wk avg)`, not "below target today" |
| T-8 | `/server/` — "What mattered most" rings `+18%` / `−12%` | a ring | "your usual" = 4-week rolling avg of conversion %; thresholds for WINNING/CLOSE/FOCUS |
| T-9 | `/server/` — "Roughly £45 in uplift" | rounded £ | `(target − actual items) × venueAvgUnitPrice` |
| T-10 | `/server/leaderboard` — "Up X% on usual" | `▲ 11%` | "usual" undefined; movementPct is a score delta, not a sales delta |

---

## Per-route findings

### `/manager`
- `Total Covers` `manager.index.tsx:185` — LOW. Source field obvious.
- `Avg Spend per Cover` `:187,762` — **HIGH**, see T-6.
- Team table category dots `:825-831` — **HIGH**, see T-7.

### `/manager/server/$id`
- `Overall score` `:104-107` — **BLOCKER**, see T-1.
- `Spend per cover` `:111` — **HIGH** (stored column read; differs from venue KPI calc; no source label).
- `Revenue influence` `:147-149` — **BLOCKER**, see T-2.
- Category breakdown bars `:170` — **BLOCKER**, see T-3.
- `vs last week` / `vs 4wk avg` `:135,140` — MEDIUM. Basis (net/gross) and "pp" unstated.
- Per-row `+X pp wk / 4wk / +£X infl.` `:173-184` — MEDIUM. Tooltip needed.

### `/manager/lls`
- "Venue Benchmark" card `:421-424` — MEDIUM. Helper text is tautological; doesn't say "current week venue total" vs the compare page's "prior 4 weeks".
- Daily LLS cells `:524` — MEDIUM. Cells have no tooltip; `—` ambiguous between "no shift" vs "no labor data".
- OF grid `:619-655` — LOW. AI-generated rationale only in toast, not inline; no confidence per cell.
- ✅ Weekly column headers carry `title` formula tooltips. Legend describes RAG bands.

### `/manager/lls/compare`
- v1 "Benchmark Adj LLS" — MEDIUM (pilot only). No footnote about 4-week prior basis.
- v2 "Modelled revenue opportunity" `:138` — MEDIUM. Formula not shown.
- No badge anywhere about v2 OF being averaged across the venue.

### `/manager/team`
- Score chip `:91` — **BLOCKER**, T-1.
- Revenue influence `:101-103` — **BLOCKER**, T-2.
- `+X% vs 4wk` `:97` — MEDIUM.

### `/manager/reports`
- SPC column `:62` — MEDIUM. No header tooltip; recomputed differently from the per-server page.

### `/server/`
- "What mattered most" rings `:290-293` — **HIGH**, T-8.
- "Roughly £X in uplift" `:398-399` — **HIGH**, T-9.
- "Outperforming X% of the team" `:255` — LOW. Basis (items sold, partly estimated) unstated.

### `/server/stats`
- Bar fill + WINNING/CLOSE/PUSH `:95-141` — **HIGH**. Bar formula not shown; denominator ambiguity per category; thresholds not labelled.
- "Up X% vs your usual" `:145` — MEDIUM. Basis = 4-wk rolling conversion %.

### `/server/leaderboard`
- Items column `:246` — **BLOCKER**, T-5.
- `Up X% on usual` + most-improved highlight `:141, 172` — **HIGH**, T-10.

### `/server/profile`
- Total uplift `:174-176` — **BLOCKER**, T-4.
- £500 milestone `:133` — **HIGH** (threshold based on opaque uplift).

### `/server/progress`
- "#pos of total" `:77` — MEDIUM. Ranking basis (items, estimated) not stated; inconsistent with team page.

### `/demo/manager/`
- "Estimated Uplift £1,420" `:71`, Wine Opportunity £620, Dessert +14% `:74-75` — MEDIUM (demo data; prospects probe these).
- Focus Acknowledgement 80% donut `:171` — LOW. Number meaning not labelled.

### `/demo/manager/server/$id`
- "Estimated uplift £…" `:34` — LOW.
- Category bar score % `:63` — MEDIUM. What `score` represents not labelled.

### `/demo/server/stats`
- Bar fill `:85` — MEDIUM. `r.conversion / 100 * 100%` used as width with no label.

### `/calculator/` (input calculator)
- Per-cover gap receipt line `:326-332` — LOW. 12–20% basis mentioned only in surrounding paragraph.

### `/calculator/server-gap`
- ✅ Most transparent route in the app. Methodology accordion, confidence pill, warnings list, net/gross toggle reflected in headers, shift preview, per-server rank pill, denominator explained per OF band.
- One LOW: `computeRecoverable` formula described in prose but not rendered as a formula.

---

## Severity totals (transparency-only)

| Severity | Count |
|---|---|
| BLOCKER | 6 (T-1 family across 4 surfaces, T-3, T-4, T-5) |
| HIGH | 9 |
| MEDIUM | 12 |
| LOW | 5 |
