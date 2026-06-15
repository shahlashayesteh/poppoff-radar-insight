# Calculator copy sweep — market-aware text, remove inert spread toggle

## Files changed
- `src/routes/calculator.tsx` (only)

## Protected files touched
None. (No edits to `src/integrations/supabase/*`, `.env`, `routeTree.gen.ts`, `src/router.tsx`, `src/routes/__root.tsx`, home, auth, signin, or any `/demo` routes.)

## Scope (copy + one inert-control removal only — no calculation changes)

### 1. Hourly rate field helper (market-aware)
- UK: "Base wage before NI, pension and tronc."
- US: "Base wage before payroll taxes and benefits."
- Implementation: pass a market-aware string to the `hint` prop on the `rate` `Field`.

### 2. Sweep other field/slider helper text for UK-only terms
Audit current helpers:
- `covers` — "All services combined, one venue." → neutral, keep.
- `spend` — "Food and drink, before service." → neutral, keep.
- `servers` — "Everyone who takes orders, full and part time." → neutral, keep.
- `rate` — handled in (1).
- `hours` — "Rough average across full and part time." → neutral, keep.

No other UK-only payroll terms or hardcoded "pound/pounds/£" words found in helpers. No changes beyond (1).

### 3. On-cost helper text (market-aware, single line)
Replace the current combined sentence with one of:
- UK: "Employer on-costs on top of base wage: National Insurance, pension and holiday pay (~15%). Adjust to match your payroll."
- US: "Employer on-costs on top of base wage: FICA, unemployment and workers' comp (~12%). Adjust to match your payroll."

### 4. Intro paragraph (under H1)
Rewrite the second sentence to be market-aware and drop the band reference:
- UK: "Most operators manage labour as a cost. The best ones measure it as leverage: how many pounds of revenue every pound of floor labour produces. Five numbers you already know off by heart, twenty seconds, and see exactly where your floor stands."
- US: same but "how many dollars of revenue every dollar of floor labour produces".

### 5. SEO meta + social tags
In `head()`, replace `description`, `og:description`, and `twitter:description` (add the twitter one if missing) with the single shared string:

"See how hard your restaurant's floor labour is working — and the upside if your whole team performed like your best server. Twenty seconds, no login. Works for UK and US venues."

Title, canonical, `og:url`, `og:title` unchanged. No image tags touched.

### 6. Methodology box ("How the score works")
- "venue-level, five inputs, directional" → "venue-level, a few quick numbers, directional".
- Replace the benchmark sentence ending "…and higher where servers earn full minimum wage." with:
  "Benchmarks differ by market: UK total labour runs 30–35% of revenue; US front-of-house runs 8–12% of sales in tipped-wage states and 14–16% in no-tip-credit states like California and Washington."

### 7. Remove the inert spread toggle
- Delete the entire "Spread between best and average server" `ToggleGroup` block (label + Conservative/Typical buttons).
- Delete the `Best vs avg spread` `ReceiptLine` from the receipt panel.
- Remove the `spread` state and its entry in the `tick` `useEffect` dependency list.
- Audit: `spread` is referenced only by (a) the toggle, (b) the receipt line, (c) the `useEffect` deps. The upside range uses hardcoded `0.12`/`0.20`, not `spread`. Safe to remove with no logic change.

## Keep unchanged
All calculation logic, market toggle, on-cost toggle, per-cover headline, potential-upside range, floor-labour-% line, US guard line, signup CTA, article link, layout, route registration, header nav, H1, eyebrow, title tag, canonical.

Awaiting approval.
