## Scope

Single file: `src/routes/server.index.tsx` (the live server dashboard with the "Your Top 3" rings and "You need to work on" card). No other pages or components change.

## 1. Re-base ring colour and fill on week-over-week delta

Today each ring is coloured by `performanceColour(conversion, target)` and the fill arc is `(conversion / target) * 100`. Change the per-ring `tone` and `fillPct` inside the `top3.map(...)` render to be driven by the `d` value (`pctDelta(items, prevItems)`):

- `d >= 20` → `var(--brand-green)`, `fillPct = min(100, d)`
- `1 <= d < 20` → `var(--brand-orange)` (amber), `fillPct = min(100, d)`
- `d <= 0` or `d === null` → `var(--opportunity)` (red), `fillPct = min(100, abs(d ?? 0))`

Target-based logic is no longer used for ring colour/fill. The number inside the ring (`displayValue={c.items}`) and the existing `↑/↓ %` label below stay the same.

The `role` label above each ring ("Crushing it / Could be better / Focus here") is currently derived from target colour. Re-derive it from the same delta buckets so the label matches the ring:
- green → "Crushing it"
- amber → "Could be better"
- red → "Focus here"

`allGreen` (used to hide the "work on" card when everything is green) is recomputed from the same delta rule so a fully-green Top 3 still hides the card.

## 2. "You need to work on" reflects the Top 3, not the full category list

Today `workOn` is computed from all `uniRows`. Change it to be derived from the `top3` items only, and surface every red one (up to three), not just the single worst.

- Filter `top3` to items whose delta is `<= 0` (the "red" bucket from rule 1). Call this `workOnList`.
- Render the card only when `workOnList.length > 0` and not `allGreen`.
- Headline: "You need to work on {labels} this week!" where `{labels}` joins the names with commas / "and" (e.g. "Desserts and Sides", or "Desserts, Sides and Wine").
- Below the headline, list one small line per item: `{Label} {signed delta}% vs last week` in the existing red tone, so the user sees each category's own number.
- Keep the existing red border/background and `TrendingDown` icon. The single `smashed` card above is unchanged.

Remove the old single-worst `workOn` calculation that pulled from `uniRows`.

## Out of scope

- `/demo/server` (static mock), `/server/stats`, manager pages, layouts, colour tokens, ring component shape/size, the "You smashed" card, coaching list, streak card.
- Target-driven logic elsewhere on the page (e.g. anything outside the Top 3 rings + work-on card).

## Verification

On `/server` with real data:
- A category up 25% wow renders a green ring filled ~25%.
- A category up 10% wow renders an amber ring filled ~10%.
- A category flat or down renders a red ring filled by `|delta|%` (0% delta = empty red ring).
- If two of the three Top 3 are red, the "work on" card lists both with their own deltas; if none are red, the card is hidden.
