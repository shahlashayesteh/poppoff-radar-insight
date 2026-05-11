## Goal

Replace the hardcoded Wine / Cocktails / Desserts rings on the server home page with three rings chosen dynamically from the server's actual data each week:

1. **Best** — the category the server is crushing (cheerlead)
2. **Middle** — a solid / average category
3. **Needs work** — the weakest category (focus area)

Each ring keeps the existing red / orange / green threshold coloring already in place.

## How categories will be picked

The page already pulls all 6 tracked categories (wine, cocktails, desserts, sides, spirits, sparkling) from `server_stats` and the matching targets from `server_targets`. We will:

1. For each category, compute `ratio = actualConversion / target` (skip categories where target is 0 or there is no sales activity at all — those aren't meaningful for that venue's data this week).
2. Sort the remaining categories by ratio, descending.
3. Pick:
   - **Best** = highest ratio
   - **Needs work** = lowest ratio
   - **Middle** = the median-ranked category between them
4. If fewer than 3 categories have usable data, show only what's available (1 or 2 rings) and a small hint that more data is needed.

This makes the rings reflect whatever categories that venue actually tracks — a steakhouse with strong sides + spirits will see those surface; a dessert-led bistro will see desserts; etc.

## Visual changes on the ring card

- The card title changes from "Your Top 3" to a label that matches the new intent. Options to pick from when implementing: "This week's highlights", "Your week at a glance", or keep "Your Top 3" — happy to confirm with you before building.
- Each ring gets a tiny sub-label above the category name so the role is clear:
  - Best → "Crushing it"
  - Middle → "Solid"
  - Needs work → "Focus here"
- Ring color, fill percentage, items-sold number inside the ring, and the "vs last week" delta below all stay exactly as they are today (red/orange/green thresholds untouched).

## Knock-on effects to keep consistent

- The "You smashed X this week!" green card already auto-picks the biggest week-over-week winner — no change.
- The "You need to work on Y" orange card already auto-picks the weakest category — no change. It will naturally line up with the "Needs work" ring most of the time, which is the intended effect.

## Out of scope

- No DB schema changes. The 6 category columns on `server_stats` / `server_targets` already cover every venue's data; we're just choosing which 3 to surface.
- No changes to the manager pages.
- No changes to the threshold color logic.

## Technical notes (for implementation)

- All changes are in `src/routes/server.index.tsx`. Replace the fixed `top3` array with a computed `top3` derived from the existing `allCats` array, ranked by `ratio` with the filtering rules above.
- Re-use the existing `Ring`, `toneFor`, `estimateItemsSold`, and `pctDelta` helpers — no new utilities needed.

One quick question before I build: do you want me to **keep the card title as "Your Top 3"**, or rename it (e.g. "This week's highlights")? I'll default to keeping "Your Top 3" unless you say otherwise.
