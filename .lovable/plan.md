# Calculator overhaul — market toggle, on-cost, range-based upside, no band

## Files changed
- `src/routes/calculator.tsx` (only)

## Protected files touched
None. (No edits to `src/integrations/supabase/*`, `.env`, `routeTree.gen.ts`, `src/router.tsx`, `src/routes/__root.tsx`, home, auth, signin, or any `/demo` routes.)

## Scope (supersedes the earlier on-cost-only plan)

### State (top of `CalculatorPage`)
- `market: 'UK'|'US'` — default `'UK'`.
- `onCost: number` — default `0.15`.
- Effect on `market` change: set `onCost` to `0.15` (UK) or `0.12` (US); user can override afterward.
- `currency = market === 'UK' ? '£' : '$'`.
- Replace `gbp0`/`gbp2` formatters with currency-agnostic helpers that prefix `{currency}` — numbers are not converted, only the symbol changes.

### New inputs (in this order on the page)
1. **Market toggle** — placed above the first existing input (Covers/week). `ToggleGroup` styled like the spread toggle; options `UK (£)` / `US ($)`; eyebrow label "Market". `onValueChange` ignores empty values.
2. **Employer on-costs toggle** — placed directly below "Average hours per server, per week" and above the spread toggle. Eyebrow "Employer on-costs". Options: `Off · 0%` (`"0"`), `Low · 10%` (`"0.10"`), `Standard` (value = market default, `"0.15"` UK / `"0.12"` US), `High · 20%` (`"0.20"`). Empty-value guard.
3. Helper text under it: "Employer on-costs on top of base wage. UK: National Insurance, pension, holiday pay (~15%). US: FICA, unemployment, workers' comp (~12%). Adjust to match your payroll."

### Calculation
- `labour = servers * rate * hours * (1 + onCost)`.
- `floorLabourPct = (labour / weeklyRev) * 100`.
- Range-based upside, independent of spread toggle position:
  - `perCoverGap(s) = spend * s`
  - `coversFromRest = covers * (servers - 1) / servers`
  - `weeklyUpside(s) = (spend * s / 2) * coversFromRest`
  - `annualUpside(s) = weeklyUpside(s) * 52`
  - `upsidePctOfRev(s) = weeklyUpside(s) / weeklyRev * 100`
  - Evaluate at `s = 0.12` (low) and `s = 0.20` (high).
- Remove `bandFor`, `band`, `stampToneClass`, `gapLabel`, `gapValue`, and the old single-spread `upliftPct/weekly/annual` derivation.
- Add `onCost`, `market` to the `useEffect` dependency list that bumps `tick`.

### Output panel restructure (replaces band + gap-to-green + "left on the table")
In order, inside the receipt card:
1. Receipt lines: Weekly revenue; **"Floor labour, fully loaded (est.)"** (renamed); Servers as % of revenue; Best-vs-avg spread (unchanged label, keeps toggle context).
2. **Headline — per-cover gap**: "Your strongest server runs about {currency}{perCoverGap(0.12) 2dp} to {currency}{perCoverGap(0.20) 2dp} higher spend per cover than your team average."
3. **Potential upside (range)**: "If the rest of your floor closed half that gap, that's roughly {currency}{annualUpside(0.12) 0dp} to {currency}{annualUpside(0.20) 0dp} a year — about {upsidePctOfRev(0.12) 1dp}% to {upsidePctOfRev(0.20) 1dp}% of revenue." Labelled "Potential upside" (not "left on the table").
4. **Floor labour as % of revenue**: "Floor labour, fully loaded: {currency}{labour 0dp}/week — {floorLabourPct 1dp}% of revenue."
5. **Market-aware benchmark line** directly under (4):
   - UK: "UK hospitality labour typically runs 30–35% of revenue; front-of-house runs higher than the US because servers earn full minimum wage, not a tipped rate."
   - US: "Full-service front-of-house labour commonly runs 8–12% of sales in tipped-wage states. In no-tip-credit states (CA, WA, OR, NV and others) servers earn full minimum wage, so floor labour runs higher — often 14–16%. Yours is {floorLabourPct 1dp}%."
6. **US-only guard line** (render only when `market === 'US'`): "In tipped-wage states, low cash wages make floor labour % look lean — tips are customer-funded, so read this alongside total server earnings."
7. **Shared directional line**: "Directional — your own P&L tells the real story. Every assumption here is shown."
8. **Demoted leverage**: one small supporting line, no colour band: "Leverage: {lls 1dp}x revenue per {currency}1 of floor labour."

Removed entirely: red/amber/green stamp, band name, "gap to green" line, "Left on the table / year" headline figure, per-server-per-year line tied to it.

### Methodology box copy
Replace the band-thresholds explanation with: "Labour is shown fully loaded — base wage plus employer on-costs — so figures reflect true cost, not gross pay. The upside estimate assumes your strongest server lifts spend per cover by 12–20% and the rest of the floor closes half that gap; it is a directional estimate, and your own POS gives the exact figure. Benchmarks differ by market: UK total labour runs 30–35%, US front-of-house 8–12% in tipped-wage states and higher where servers earn full minimum wage."

Keep the surrounding paragraph (quick-check intro, half-the-gap reference, article link).

### Unchanged
Spread toggle (still rendered, now contextual — the upside range no longer depends on its position), signup CTA → `/signup`, article link, H1, eyebrow, SEO meta/head, layout, route registration, header nav, slider hints, currency hint text (only symbol swaps).

Awaiting approval.