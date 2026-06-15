# Calculator copy coherence pass — align framing with actual output

## Files changed
- `src/routes/calculator.tsx` (only)

## Protected files touched
None. (No edits to `src/integrations/supabase/*`, `.env`, `routeTree.gen.ts`, `src/router.tsx`, `src/routes/__root.tsx`, home, auth, signin, or any `/demo` routes.)

## Scope (copy-only — no calculation, currency, or layout changes)

### 1. Intro paragraph (under H1)
Replace the current market-aware second/third sentences with one shared, market-neutral string (no currency word, so UK/US render identically):

"Most operators manage labour as a cost. The best ones see what it produces: the revenue gap between their strongest and average server, and what closing it is worth. A few numbers you already know, twenty seconds, and you'll see the upside hiding in your own floor."

Removes the market conditional on this paragraph (currency is no longer mentioned here). Drops "see exactly where your floor stands" and the "leverage" framing in favour of the gap/upside preview the tool actually outputs.

### 2. Methodology heading
"How the score works." → "How this works."
Paragraph body unchanged except item 3 below.

### 3. Methodology benchmark sentence (apples-to-apples)
Replace the current sentence with:

"Benchmarks differ by market and by what's measured: UK total hospitality labour runs 30–35% of revenue, with front-of-house a portion of that; US front-of-house specifically runs 8–12% of sales in tipped-wage states and 14–16% in no-tip-credit states like California and Washington."

### 4. Sweep for "see exactly where your floor stands" / "standing" / "grade" / "score"
Audit confirms the phrase only appears in the intro paragraph (handled in 1) and the methodology heading (handled in 2). No other occurrences in the file. No further edits required from this sweep.

### 5. Name consistency on receipt header
Align the receipt flourish to the brand name:
- `*** FLOOR PERFORMANCE AUDIT ***` → `*** FLOOR LEVERAGE CHECK ***`

Flagged: changed (chose alignment over flourish, since the eyebrow already reads "Floor Leverage Check™" and the tool now has one consistent name).

## Keep unchanged
All calculation logic, market toggle, on-cost toggle, currency handling, per-cover headline, potential-upside range, floor-labour-% line, benchmark context lines (the in-receipt UK/US labour % paragraphs), US tipped-wage guard line, demoted leverage line, signup CTA, article link, layout, route registration, header nav, H1, eyebrow ("Floor Leverage Check™"), title tag, canonical, meta/OG/Twitter description tags.

Awaiting approval.
