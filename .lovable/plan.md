## Addition: "Wine by the Glass" pairings + wine style labels

Small, isolated change to the pairing system. Nothing else touched.

### 1. Edge function (`supabase/functions/ai-assist/index.ts`)

In the `pair_chunk` action prompt:

- Split the existing `wine` category into two:
  - `wine_bottle` — premium bottle pairings (existing behavior, 3 most expensive)
  - `wine_glass` — by-the-glass pairings only (3 most expensive available by-the-glass options from the wine list)
- For both wine categories, require each `pair_with` entry to start with a style tag in brackets so the UI can render it consistently:
  - `[White]`, `[Red]`, `[Rosé]`, `[Champagne]` (also accept Sparkling/Prosecco mapped to Champagne for display)
  - Example: `"[White] Sancerre 2022"`
- Other categories (cocktail, sake, beer, spirit, dessert) unchanged.
- Each wine category still capped at 3 suggestions, prioritising the most expensive.

### 2. Frontend (`src/routes/manager.menu.tsx`)

- Extend `CAT_META` with two wine entries (replace the single `wine` entry):
  - `wine_bottle` — 🍷 "Wine (Bottle)", brand-orange tint
  - `wine_glass` — 🥂 "Wine (by the Glass)", brand-orange tint (lighter mix)
- Render order per dish: Wine (Bottle) → Wine (by the Glass) → Cocktail → Sake → Beer → Spirit → Dessert.
- Parse the leading `[Style]` tag from each wine `pair_with` and display it as a small coloured chip next to the wine name:
  - White → soft yellow chip
  - Red → deep red chip
  - Rosé → pink chip
  - Champagne → gold chip
- Search continues to match across dish, category label, pair_with, and why — so "white" or "champagne" finds matching wines.

### 3. Data / migration

No schema change. `venue_pairings.category` already stores free text, so `wine_bottle` and `wine_glass` slot in alongside the existing values. Old `wine` rows from previous runs will simply continue to display under "Wine (Bottle)" if we map unknown `wine` → `wine_bottle` for backwards compatibility, or be replaced on the next "Generate pairings" run.

### What stays exactly the same

- Chunked generation, progress bar, caching, RLS, search box, brand colours, emojis on dishes, layout, every other category.
- Upload flow, menu parsing, priorities, coaching — untouched.

### Outcome

Each dish now shows up to 3 premium bottle wines AND up to 3 by-the-glass wines, every wine clearly tagged White / Red / Rosé / Champagne so servers can pour the right thing immediately.