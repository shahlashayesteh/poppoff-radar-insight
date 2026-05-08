# Server home page rework

Scope: `src/routes/server.index.tsx` only. No DB or layout changes.

## 1. Top 3 rings show item counts, not percentages

- Fetch venue average prices via `fetchVenueAvgPrices(venueId)` (already in `@/lib/server-data`).
- For each of Wine, Cocktails, Desserts, compute `estimateItemsSold(stat[<cat>_sales], <cat>, prices)`.
- Update `Ring` to accept an optional `displayValue` (e.g. `78`) and `displayUnit` (e.g. `sold`) so the centre text shows `78` with a tiny `sold` label, while the arc still fills based on conversion% vs target (so ring length stays meaningful).
- Keep the `↑ +12%` / `↓ -8%` delta line under each ring (already item-count based after this change — compare current items vs previous-week items).

## 2. Red colour for low performance

- Already wired through `toneFor(actual, target)` → `performanceColour()`:
  - ≥80% of target → green
  - 55–79% → amber
  - <55% → red (`var(--opportunity)`)
- Confirm both the ring arc colour AND the centre number use this `tone`, so a low value renders in red.
- Delta line keeps green for ↑ and red for ↓ (already correct).

## 3. Replace "This week's coaching" card with "You smashed X" card

- Remove the existing bottom Link-to-`/server/menu` "This week's coaching" card.
- Replace it with a green-tinted insight card: **"You smashed {category} this week!"** + `+X% vs last week` + ✓ chip.
- Category picked = the one with the highest **positive** week-over-week delta across all 6 categories (wine, cocktail, dessert, sides, spirits, sparkling). If no positive delta exists, hide this card.
- This replaces the existing "insight" card logic that currently shows either smashed OR focus — split into two separate cards (see #4).

## 4. New "You need to work on" card underneath

- Directly below the smashed card, add a red-tinted card: **"You need to work on {category} this week!"** + `-X% vs last week` styled in red (`var(--opportunity)`).
- Category picked = the one with the **lowest** week-over-week delta (most negative), OR if all deltas are positive, the category furthest below its AI target (lowest `actual/target` ratio, must be amber/red).
- Always shown when stats exist (so server always sees what to improve), styled with red border + red icon (e.g. `TrendingDown` from lucide-react).

## Order of cards on the page (top to bottom)

1. Greeting + "Stats just dropped" header (unchanged)
2. Top 3 rings card (now showing item counts, red when low)
3. **You smashed {X} this week!** (green, only if any positive delta)
4. **You need to work on {Y} this week!** (red, always shown when stats exist)
5. Streak link (unchanged)

## Technical notes

- Uses existing helpers: `pctDelta`, `estimateItemsSold`, `fetchVenueAvgPrices`, `performanceColour`, `toneFor`.
- No new imports beyond `TrendingDown` from `lucide-react`.
- No DB migration, no edge function, no manager-side changes.
