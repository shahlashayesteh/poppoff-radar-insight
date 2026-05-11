## Goal

Drop the "mode" logic. Each ring's sub-label is decided purely by its own colour, so the wording always matches what the ring is showing.

## Label mapping (per ring)

- **Green** → "Crushing it"
- **Amber** → "Could be better" (replaces "Solid")
- **Red** → "Focus here"

That's it — no all-green / all-red modes, no best/middle/worst slot wording. The three categories are still picked the same way (best, median, worst by ratio), but each ring labels itself from its own colour.

## Knock-on cleanup

- Remove the all-green green confirmation banner ("No weak spots this week — keep it up.") added in the previous pass.
- Restore the orange "You need to work on X" card to its original unconditional render (it already auto-picks the weakest category, which still makes sense even when everything is green — and you can decide separately if you want to hide it on all-green weeks).

Quick check before I build: on an **all-green week**, do you want the orange "You need to work on X" card to:
1. **Still show** (it always flags the relatively weakest category, even if that category is green) — simplest, matches today's behaviour.
2. **Hide** when every ring is green, since nothing genuinely needs work.

I'll default to option 2 (hide it on all-green) unless you say otherwise — it lines up with your earlier intent that "if they are crushing it in all three categories" the messaging should stay celebratory.

## Out of scope

- No DB or threshold changes.
- No changes to which 3 categories are picked or to ring colour/fill math.
- No changes to the green "You smashed X" card logic.

## Technical notes

In `src/routes/server.index.tsx`:

1. Narrow `RingRole` back to `"Crushing it" | "Could be better" | "Focus here"`.
2. Remove the `mode` variable and the slot-based `roleFor` switch. Compute each pick's role from `performanceColour(actualConv, tgt)`:
   - green → "Crushing it"
   - amber → "Could be better"
   - red → "Focus here"
3. Remove the all-green banner block. Gate the orange "work on" card with `mode !== "all-green"` → replace with a simple "every picked ring is green" check (derived inline from the same colours array) if going with option 2; otherwise restore unconditional render.
