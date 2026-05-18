## What's wrong

**1. Coaching cites the wrong numbers (the "0% vs target 0%" tips).**
Chloe's actual stats for week 2026-03-30 are wine 33%, dessert 9%, cocktail 34%, SPC £46.85. But her cached coaching says:
- "Your cocktail conversion is 0% vs target 0%…"
- "Your dessert conversion is 0% vs target 0%…"

Why: the `server_coaching` handler in `supabase/functions/ai-assist/index.ts` checks `venue_categories`. Her venue has 9 rows there (6 auto-seeded legacy + 3 menu-item categories), so the code takes the "dynamic" branch and reads every category value from `server_category_stats`. Chloe has **zero** `server_category_stats` rows for that week (her data was uploaded in the legacy six-column shape into `server_stats`), so every category resolves to 0% and the AI writes nonsense built on those zeros.

**2. `/server/menu` shows no "Push these this week" items.**
The previous cleanup deleted all `weekly_priorities` rows for Chloe's venue and added auto-delete on every menu/pairing change. So whenever a manager uploads a new menu or regenerates pairings, the server's priorities go blank until the manager separately clicks "generate priorities". The empty-state copy reads correctly, but the user expects the priorities to refresh alongside pairings.

(Pairings themselves are fine — 72 rows exist in `venue_pairings` for the venue and the page does render them; only the top "Push these this week" block is empty.)

## Plan

### 1. Per-category fallback in `server_coaching` (ai-assist edge function)

In `supabase/functions/ai-assist/index.ts`, change the `cats.map(...)` block (≈ lines 391–405) so each category independently picks the best available source:

- If `dynCats` includes the key AND `curMap[key]` exists → use the dynamic conversion/target.
- Otherwise, if it's one of the legacy six (`wine`, `dessert`, `cocktail`, `sides`, `spirits`, `sparkling`) → fall back to `server_stats.<cat>_conversion`, `server_stats.<cat>_conversion` previous, and `server_targets.<cat>_target`.
- Skip the row entirely if both sources are zero/missing, so the AI never sees a fake "0% vs target 0%" line.

Also clear Chloe's existing cached row so the next page load regenerates fresh tips that cite the real numbers.

### 2. Auto-regenerate priorities when the menu/pairings change

In `src/routes/manager.menu.tsx`, after each of the three spots that already wipe `weekly_priorities` (post-parse, post-upload, post-delete), invoke `ai-assist` with `action: "generate_priorities"` for the current `weekStart` so the new menu produces fresh "Push these this week" entries instead of leaving the server view blank.

If the manager has no stats yet for that week, `generate_priorities` will still pick items from the menu — that's acceptable and matches the previous behaviour before the cleanup.

### 3. One-time refresh for Chloe's venue

After deploying, regenerate priorities once for `venue_id = cd6604ee-e149-4412-8f03-be479f38dcc5` for the current week so her `/server/menu` immediately shows priorities again, and delete her stale `server_coaching` row so the dashboard regenerates with the corrected numbers on next visit.

### What I am NOT changing

- No DB schema changes.
- No RLS changes.
- The `server.index.tsx` and `server.menu.tsx` rendering logic stays as-is — the fix is in data sourcing, not UI.
