## Goal

Make the Top 3 ring sub-labels (currently always "Crushing it" / "Solid" / "Focus here") reflect the server's actual week. If every category is strong, all three rings should cheer. If everything is struggling, all three should signal focus areas. Mixed weeks keep the current best / middle / worst framing.

## How the label mode is decided

Re-use the existing `performanceColour(actualConv, target)` helper (green / amber / red, already what colors each ring).

For each of the three picked categories, compute its colour. Then:

- **All-green mode** (every pick is green): show motivational labels on all three.
   - Best: "Crushing it"
   - Middle: "On fire"
   - Worst: "Keep going"
   - Plus: the orange "You need to work on X" card is suppressed this week (nothing actually needs work). A small green note replaces it: "No weak spots this week — keep it up."

- **All-red mode** (every pick is red): show focus labels on all three.
   - Best (least bad): "Closest to target"
   - Middle: "Needs work"
   - Worst: "Biggest focus"
   - The green "You smashed X" card stays only if there's still a positive week-over-week delta; otherwise it's suppressed.

- **Mixed mode** (default, what we have today): keep "Crushing it" / "Solid" / "Focus here".

The role label color already follows the ring's own tone via `toneFor`, so motivational labels render green when all green, and focus labels render red when all red — visually consistent.

## Edge cases

- Fewer than 3 usable categories: keep current behavior (1 or 2 rings, no mode switch — too little signal to justify it).
- Amber-heavy weeks (mix of amber + one green or one red): treated as Mixed.
- The picks themselves (which 3 categories) don't change — only the role wording changes.

## Out of scope

- No DB or threshold logic changes.
- No changes to the ring color/fill math.
- No changes to the smashed/work-on card logic beyond the all-green suppression noted above.

## Technical notes

All in `src/routes/server.index.tsx`:

1. After `top3` is built, compute `colours = top3.map(c => performanceColour(actualConv, tgt))`.
2. Derive `mode: "all-green" | "all-red" | "mixed"`.
3. Map roles per mode (table above) instead of hardcoding "Crushing it" / "Solid" / "Focus here" at pick time. Widen the `Top3Item["role"]` union to include the new labels.
4. In the all-green branch, gate the orange "work on" card off and render a small green confirmation line in its place.
