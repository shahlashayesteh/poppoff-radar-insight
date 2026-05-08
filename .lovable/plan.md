## Problem

Clicking **Generate pairings** calls the `ai-assist` edge function, which asks Gemini Flash to produce, in one shot, pairings for every food item × 6 categories × up to 3 suggestions. That response is so large it doesn't finish in time and the edge function connection is dropped — surfacing as `non-2xx status code` in the UI.

We do **not** need to revert. The pairing quality you asked for is fine; the call just needs to be split into smaller chunks so each one finishes well within the time limit.

## Fix: chunked pairing generation

### High-level

1. The edge function first asks the AI for the **list of food item names** only (fast, ~1–2s).
2. The frontend then loops over those food items in **batches of 5–8** and calls a new `pair_chunk` action, which generates premium pairings for that small batch only.
3. Results are merged in the UI as each chunk returns. A progress indicator ("Generating 12/40…") shows live progress.
4. Pairings are cached in a new `venue_pairings` table so repeat opens are instant and don't re-bill the AI.

### Technical changes

**Edge function `ai-assist/index.ts`** — replace the single `generate_pairings` action with two:
- `list_food_items` — returns `{ items: string[] }` from menu text only. Tiny prompt, tiny output.
- `pair_chunk` — input `{ items: string[] }` (max 8). Same premium-pairing rules as today (3 most expensive per category when applicable, real menu names, emojis-friendly fields). Returns `{ pairings: [...] }` for just that batch.

**New table `venue_pairings`** (migration):
- `venue_id uuid`, `item text`, `category text`, `pair_with text`, `why text`, `priority text`, `position int`, `generated_at timestamptz`
- RLS: managers of the venue can read/write.
- Unique on `(venue_id, item, category, pair_with)` so re-runs upsert cleanly.

**Frontend `manager.menu.tsx`**:
- "Generate pairings" button now:
  1. calls `list_food_items` once,
  2. chunks the result into groups of 6,
  3. fires `pair_chunk` requests sequentially (or 2 in parallel) with a progress bar,
  4. upserts each chunk into `venue_pairings` and merges into local state immediately so the user sees pairings appear progressively,
  5. stops gracefully if any chunk fails — already-generated pairings remain.
- On page load, read existing rows from `venue_pairings` so prior results show instantly.
- Existing search + grouped card UI is unchanged.

### What stays the same

- Premium-pricing logic, 3-per-category cap, emoji styling, search, brand colours — all unchanged.
- `parse_menu`, `generate_priorities`, `coaching`, `server_coaching` actions — unchanged.

### Why this works

Each `pair_chunk` call handles ~6 dishes, so the AI returns in ~5–15 seconds — comfortably under the edge function limit. Total wall time for a 40-dish menu is ~1–2 minutes, but the user sees results streaming in instead of waiting on one giant call that times out.

## Outcome

- No revert needed.
- "Generate pairings" reliably completes for menus of any realistic size.
- Pairings persist between sessions.
- Progress is visible to the manager while it runs.