## Goal

Right now the app only understands six fixed sales categories (wine, dessert, cocktail, sides, spirits, sparkling). Every upload — CSV or photo — is forced into those buckets, and anything else is dropped. After this change, whatever categories the venue uploads ("Beer", "Coffee", "Starters", "Pasta", "Mains", "Specials", anything) are captured, stored, and surfaced everywhere — dashboard rings, server dashboards, AI priorities, AI coaching, leaderboards — exactly the way wine/dessert/etc. work today. Categories are tracked per venue, so two venues can have completely different category lists.

Existing wine/dessert/cocktail/sides/spirits/sparkling data stays in place untouched (so history doesn't break), but the new dynamic pipeline runs alongside it and becomes the source of truth going forward.

## How it'll look to the manager

1. Upload a CSV or screenshot as normal.
2. The system reads every category column / row it can identify, not just the six legacy ones.
3. After import, the manager dashboard shows a conversion ring (or row) per category that the venue has data for. New categories appear automatically the first time they're uploaded.
4. Targets per category are calculated automatically per server using the same "what needs working on" logic as today (personal recent average × 1.10, floored at venue average). The manager doesn't have to set anything for new categories — the system picks a sensible starting target the first week and refines it as more weeks come in.
5. AI priorities and AI coaching read whichever categories exist for that venue and tailor advice around weak ones. No more "wine/dessert/cocktail/sides/spirits/sparkling" hardcoded everywhere.

## Database changes

New tables (per venue, dynamic):

```text
venue_categories
  venue_id, key (slug, e.g. "beer"), label ("Beer"),
  is_legacy (true for the original 6), sort_order, created_at

server_category_stats
  venue_id, user_id, week_start, category_key,
  sales, conversion (% of covers), created_at
  PK: (venue_id, user_id, week_start, category_key)

server_category_targets
  venue_id, user_id, category_key, target (numeric),
  created_at, updated_at
  PK: (venue_id, user_id, category_key)
```

RLS mirrors `server_stats` / `server_targets` (managers manage their venue, servers read their own rows, plus reading the venue's category list).

`server_stats` and `server_targets` are **not dropped** — they keep the legacy six columns alongside, so old dashboards and migrations still work and any historic data stays visible. Going forward, those columns are no longer read from by the UI for the dynamic categories; they're written for the legacy six only as a compatibility shim.

Updated/new DB functions:

- `process_csv_upload` extended: accepts a `categories` object on each row (e.g. `{ "beer_sales": 120, "coffee_sales": 40, ... }`), normalises the keys, upserts `venue_categories`, writes one `server_category_stats` row per (server, week, category). Still also writes legacy six columns when present.
- `recompute_ai_targets` extended: for every category that exists in `venue_categories`, recompute per-server targets into `server_category_targets` using the same `GREATEST(personal × 1.10, venue avg, 1)` rule.
- `delete_csv_uploads` extended to also clear `server_category_stats` (categories themselves are kept unless wiped).

## Upload pipeline

**CSV (`src/lib/csv.ts`)**
- Keep the existing aliases for the six legacy categories.
- Add a generic pass: any header that contains `_sales`, `sales`, or matches a category column heuristic (numeric column not already mapped to covers/total/date/check/server) is treated as a custom category. The category key = slugified header (e.g. `Beer Sales` → `beer`). Label = human-readable header.
- Long-form CSVs (one row per item with a `category` column) bucket every distinct category, not just the six.
- Output shape becomes: `{ server_name, total_covers, total_sales, week_start, categories: { [key]: { label, sales } } }`. Legacy six are still emitted at top level for backwards compatibility.

**Image OCR (`supabase/functions/ai-assist/index.ts`, `parse_stats_image`)**
- New prompt: extract ALL category columns visible in the report image, return as a dynamic map `categories: { "beer": { label: "Beer", sales: 120 }, ... }` plus total_covers / total_sales / server_name.
- Removes the hardcoded list in the schema.

**Manager dashboard upload UI (`src/routes/manager.index.tsx`)**
- Preview table becomes column-dynamic — one column per category detected, plus covers and total sales. Manager can edit values or remove rows as today.

## Dashboard & server views

- `manager.index.tsx`, `manager.server.$id.tsx`, `manager.team.tsx`, `server.index.tsx`, `server.stats.tsx`, `server.progress.tsx` all switch from the hardcoded `cats` array to fetching `venue_categories` + `server_category_stats` + `server_category_targets`.
- Rendering loop is the same shape (ring per category, traffic-light dot) — it just iterates over what's stored.
- If a venue has zero custom categories yet, the legacy six are shown so existing accounts look identical until they upload a new file.

## AI: priorities & coaching

- `generate_priorities` action: reads `venue_categories` + `server_category_stats` instead of the hardcoded list. Prompt now says "Given these categories: X, Y, Z and the team's conversion vs target for each…". Identifies the weakest categories dynamically.
- `server_coaching` action: same change — coaching tips reference whatever categories the venue tracks.

## Migration of existing data

- One-time SQL: for every existing `server_stats` row, copy the six legacy sales values into `server_category_stats` under category keys `wine`, `dessert`, `cocktail`, `sides`, `spirits`, `sparkling` (with `is_legacy=true` rows seeded in `venue_categories` for each venue that has stats).
- Existing targets in `server_targets` copied into `server_category_targets` the same way.
- Result: nothing visually changes for current venues until they upload a file with a new category, at which point that category just appears.

## Files changed

- `supabase/migrations/<new>.sql` — new tables, RLS, updated `process_csv_upload`, `recompute_ai_targets`, `delete_csv_uploads`, data backfill.
- `src/lib/csv.ts` — generic category extraction.
- `src/integrations/supabase/types.ts` — auto-regenerated.
- `src/routes/manager.index.tsx` — dynamic preview + dynamic category rendering.
- `src/routes/manager.server.$id.tsx`, `manager.team.tsx` — dynamic categories.
- `src/routes/server.index.tsx`, `server.stats.tsx`, `server.progress.tsx` — dynamic categories.
- `supabase/functions/ai-assist/index.ts` — new image prompt, dynamic priorities + coaching.
- Minor: `src/lib/server-data.ts` helpers if needed for fetching the category list.

## Out of scope (let me know if you want these too)

- Renaming/merging categories in the UI (e.g. "Beers" and "Beer" combining). For now they'd appear as two unless the CSV headers match after slugifying.
- Per-category targets editable by the manager in a settings page. Today targets are AI-calculated; the same applies to new categories. Editable targets can come later.
- Demo routes (`demo.manager.*`, `demo.server.*`) — left on the six fixed categories since they're just static demo content.
