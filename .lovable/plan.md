
## Goal

Match the server home page to the uploaded reference (and `/demo/server/`): show Top 3 category rings with red/amber/green colours based on AI targets, a per-category delta vs last week, and a "You smashed X this week!" insight card directly below — replacing the current "Upsell rate this week" card. Keep all surrounding layout/spacing identical. Confirm manager views correctly reflect server activity and stats.

## Reference (uploaded image)

```text
Your Top 3
   Wine        Cocktails     Desserts
  ( 78% )      ( 72% )       ( 64% )      <- ring colour = perf vs AI target
  +12% vs LW   +8%  vs LW    +18% vs LW   <- green if up, red if down

[ 🏆  You smashed desserts this week!     ✓ ]
       +18% vs last week
```

## Changes

### 1. `src/routes/server.index.tsx` — Top 3 rings (no layout change)

- Replace the three hard-coded ring colours (`var(--brand-orange)`, `var(--brand-green)`, fixed yellow) with the result of `performanceColour(actual, target)` per category, mapped to:
  - `green` → `var(--brand-green)`
  - `amber` → `var(--brand-orange)`
  - `red` → `var(--opportunity)` (already used elsewhere as the site's red token)
- Under each ring add the per-category delta vs previous week (using the `prevStat` already loaded), styled `↑ +X%` in `var(--brand-green)` or `↓ -X%` in `var(--opportunity)`, plus `vs last week` muted line — exactly like the demo and the uploaded image.
- Targets read from `server_targets` (already loaded as `target`); fall back to category `?? 0` when target is null so colour defaults to amber.

### 2. `src/routes/server.index.tsx` — Replace "Upsell rate this week" card with "You smashed …" insight

- Remove the entire "Upsell rate this week" card.
- In its place (same spacing — `px-5 mt-4`) render the `You smashed <category> this week!` card from the demo, sized and styled identically (green-tinted border + background, trophy icon, ✓ chip).
- Pick the category dynamically: the category among `wine / cocktail / dessert / sides / spirits / sparkling` with the highest positive `pctDelta(currentConversion, previousConversion)`. If no positive delta exists, show `Focus on <category>` with the worst delta in the `var(--opportunity)` style (still same card shape).
- Show `+X% vs last week` (or `-X%` for the focus variant) under the headline.

### 3. Manager parity check (no visual changes unless data is missing)

- `src/routes/manager.team.tsx` — already shows SPC, covers, £ sales, login count per server. Keep as-is.
- `src/routes/manager.server.$id.tsx` — already shows SPC, streak, stats viewed, focus ack'd, full category breakdown. Add total-logins line to the existing Engagement card (one extra `<div>` inside the same card, no layout shift) so manager sees: stats viewed, focus ack'd, total logins.
- Verify `record_login` is fired on every server route load (`server.index.tsx`, `server.stats.tsx`, `server.progress.tsx` already call it via `recordLogin()`); add to `server.menu.tsx` if missing.
- Verify `claim_placeholder_data` runs on each server load so Shahla-style sign-ups inherit pre-uploaded CSV rows. Already in `server.index.tsx` and `server.stats.tsx`. Confirm presence in `server.progress.tsx` and `server.menu.tsx`; add if missing.

### 4. No other changes

- No DB migrations.
- No edge function changes.
- No restyle of headers, fonts, paddings, or cards — only the swap described above.
- Manager-side layout untouched aside from the one extra "Total logins" line in the existing Engagement card.

## Files touched

- `src/routes/server.index.tsx` (ring colour from AI target, per-ring deltas, replace upsell card with smashed/focus insight)
- `src/routes/manager.server.$id.tsx` (add total logins to existing Engagement card)
- `src/routes/server.menu.tsx`, `src/routes/server.progress.tsx` (only if `recordLogin` / `claimServerCsvData` not already wired)
