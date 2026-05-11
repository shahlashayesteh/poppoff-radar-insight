# Threshold-based stat coloring

## Goal
Every stat (number, percentage, ring/circle, bar, dot) on the server and manager pages should reflect performance against target:
- Good → brand green (`var(--brand-green)`)
- Average → brand orange (`var(--brand-orange)`)
- Poor → red (`var(--opportunity)`)

No layout, content, or behavior changes.

## Thresholds (already in `src/lib/week.ts` `performanceColour`)
- `actual / target >= 80%` → green (good)
- `actual / target >= 55%` → amber/orange (average)
- otherwise → red (poor)

These thresholds are already the single source of truth and will continue to be reused.

## Audit + fixes per file

### `src/routes/server.index.tsx` (Server dashboard)
- "Your Top 3" rings: ring stroke + tinted background already use `toneFor`. ✅ verify the ring's inner background ring (the track) tints to the same tone so the circle visually adheres to the status color.
- Smashed/Work-on callouts: keep as-is (these are positive/negative deltas, not pass/fail).

### `src/routes/server.stats.tsx` (Server stats list)
- Per-category items-sold label and progress bar already use `performanceColour`. ✅ no change needed; confirm wording/structure untouched.

### `src/routes/manager.server.$id.tsx` (Manager → server detail)
- Category breakdown dot + bar already use `performanceColour`. ✅ verify only — no visual changes other than coloring.

### `src/routes/manager.index.tsx` (Manager dashboard)
- Team Performance table per-category cells: currently render a `<Dot>` via `performanceColour`. ✅ confirm Dot mapping: green→brand-green, amber→brand-orange, red→opportunity. (Already correct.)
- KPI tiles (Total Covers, SPC, Servers reporting, Viewed Stats): these are not target-graded metrics, but two are graded-able:
  - "Servers reporting" — color tone by `stats.length / members.length` using the same thresholds.
  - "Viewed Stats" — color tone by `viewedCount / members.length` using the same thresholds.
  - "Total Covers" and "Avg Spend per Cover" — leave neutral brand-green (no target to grade against). 

## Implementation notes
- Reuse `performanceColour` from `src/lib/week.ts` everywhere; do not introduce new threshold constants.
- Introduce a tiny shared helper `toneFromColour(c)` (in `src/lib/week.ts` or inline) returning the CSS var so all surfaces stay aligned.
- No changes to data fetching, route structure, copy, spacing, typography, or component layout.
- No changes to backend, edge functions, or Supabase schema.

## Out of scope
- Changing thresholds themselves.
- Restyling rings/bars beyond color.
- Changing delta (vs last week) coloring — those stay green-positive / red-negative.
