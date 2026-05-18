## Goal

When a manager regenerates pairings in **Menu Intelligence**, every server in that restaurant should see the new pairings on their **Coaching** page automatically — personalised to their own weakest categories — without having to refresh or wait for next week.

## What's broken today

- Pairings are written to `venue_pairings` correctly (venue‑wide, RLS already lets members read).
- `src/routes/server.menu.tsx` only reads `weekly_priorities`. It never reads `venue_pairings`.
- Result: managers regenerate pairings, nothing changes for servers. They only see "priorities" the manager manually pinned.

The data is already going to "all server accounts" (it's a single venue‑scoped table). The missing piece is **surfacing it** on the server side and **refreshing it live**.

## Changes (frontend only — no DB / RLS changes needed)

### 1. `src/routes/server.menu.tsx` — show pairings

Add a new "Suggested pairings for you" section below the weekly priorities block.

- Fetch `venue_pairings` for the server's venue on mount (ordered by `position`).
- Group by `item` (food item) and show 1–3 suggested `pair_with` rows underneath, including `why` and the wine/cocktail/etc. `category` chip already supported in the manager view.
- **Personalisation** (the "personal coaching and insights they need" part): use the server's own `server_category_stats` from the latest week vs. their `server_category_targets` to identify their **2 weakest categories**. Pairings whose `category` matches one of those weak categories get pinned to the top and labelled "Focus for you — boost your {category}". Everything else falls below under "All pairings".
- Filter input to search by item/drink (mirrors the manager‑side search behaviour).
- Empty state: "Your manager hasn't generated pairings yet."

### 2. Live refresh when the manager regenerates

Subscribe to Postgres changes on `venue_pairings` filtered by the server's `venue_id`. On any insert/delete, re‑run the pairings fetch. This makes the new set appear within seconds of the manager finishing — no reload, no waiting for next week.

Also re‑fetch when the tab regains focus, as a fallback for browsers that drop the realtime socket.

Requires one tiny migration step (publication only, no schema change):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_pairings;
```

### 3. Manager side — no behaviour change

`generatePairings` in `src/routes/manager.menu.tsx` already wipes + reinserts venue‑wide rows, so every server who is a member of that venue automatically sees the new set once (1) is wired up. No extra "broadcast" step needed.

A small toast tweak after success: "Pairings ready · sent to your team" so the manager knows it reached servers.

## Out of scope

- No changes to the AI/parse pipeline or the manager‑side pairing UI/logic.
- No changes to `weekly_priorities`, streaks, milestones, or stats.
- No new RLS policies — `Servers read venue pairings` already exists.
- No per‑server pairing rows — pairings stay venue‑wide; personalisation is purely a client‑side ranking based on each server's own stats.
