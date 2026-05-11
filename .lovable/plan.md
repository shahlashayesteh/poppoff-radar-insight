## Goal

Make the whole stats pipeline flexible so each venue tracks whatever categories appear in *their* CSV/image (e.g. edamame, water, nibbles) — not just the six legacy ones (wine, cocktail, dessert, sides, spirits, sparkling). Manager dashboard, server home, server stats, and coaching should all render the venue's own categories.

## Current state (why this is broken today)

The **database is already dynamic** — good news:
- `venue_categories` stores one row per category per venue (label + slug `key`)
- `server_category_stats` stores per-server-per-week sales/conversion for any category key
- `server_category_targets` stores per-server targets per category
- `process_csv_upload` already reads `_row->'categories'` jsonb and writes those tables

The **client is hardcoded to the six legacy buckets**:
- `src/lib/csv.ts` — `CATEGORY_KEYWORDS` only maps words it recognises into the six buckets; anything else (edamame, water, nibbles, bread basket…) is silently dropped. The output `CsvRow` only has the six `*_sales` fields.
- `src/routes/manager.index.tsx` — preview table has fixed Wine/Cocktail/Dessert/Sides/Spirits/Sparkling columns; `confirmPreview` sends those rows directly to `process_csv_upload` with no `categories` field.
- `src/routes/server.index.tsx` (Top 3) and `src/routes/server.stats.tsx` read the six legacy columns from `server_stats`, never `server_category_stats` / `venue_categories`.

Net effect: even though the DB can store "edamame_sales", nothing in the UI ever puts it there or reads it back.

## Plan

### 1. Parser: keep all categories the file gives us
File: `src/lib/csv.ts`
- Extend `CsvRow` with `categories: Record<string, { label: string; sales: number; quantity?: number; metric_type?: "sales" | "quantity" }>`.
- When the CSV has a `category`/`item` column, bucket each row under its **own** label (slugify for the key, keep original text as `label`). Stop forcing it into the 6 keyword buckets. The legacy six still get filled when keywords match, so old CSVs keep working.
- When the CSV has wide columns (e.g. `wine_sales`, `edamame_sales`, `water_sales`), every numeric `*_sales`/`*_qty` column becomes a category entry. Unknown columns are no longer ignored.
- `total_sales` still aggregates everything.

### 2. Manager preview: show the categories that were actually found
File: `src/routes/manager.index.tsx`
- Replace the hardcoded Wine/Cocktail/Dessert/Sides/Spirits/Sparkling columns with a dynamic set built from the union of `categories` keys across the preview rows.
- Manager can rename a column header (updates the `label`), delete a column ("we don't track this"), or add a new one before importing.
- `confirmPreview` passes the `categories` map straight through to `process_csv_upload`, which already handles it.

### 3. Server home — Top 3 from the venue's own categories
File: `src/routes/server.index.tsx`
- Load `venue_categories` for the venue + this server's `server_category_stats` and `server_category_targets` for the visible week (and previous week for delta).
- Drop the hardcoded `allCats` array; build it from the venue rows.
- Best / Mid / Focus picking, "Crushing it / Could be better / Focus here" labels and the all-green gating logic stay exactly as they are — they just iterate over the dynamic list.
- "You smashed X" and "You need to work on X" cards also read from the same dynamic list, so the label that shows up is the venue's real label (e.g. "Edamame", not "Sides").

### 4. Server stats page — same dynamic list
File: `src/routes/server.stats.tsx`
- Replace the fixed wine/cocktail/dessert array with the dynamic categories the venue tracks. Each row shows `conversion` vs `target` for that key, using the venue's label.

### 5. Coaching tips
File: `supabase/functions/ai-assist/index.ts` (server_coaching action)
- Pass the venue's actual category list + this server's per-category stats/targets to the model so tips talk about real categories (edamame, water…) instead of "try upselling wine".
- No schema change.

### Out of scope
- No DB migrations. `venue_categories` / `server_category_stats` / `server_category_targets` already cover this.
- The legacy six `*_sales` columns on `server_stats` stay (other code still uses them for SPC + the milestone trigger). They become a subset of the dynamic categories rather than the only ones.
- No changes to the ring fill / colour thresholds.

### Files touched
- `src/lib/csv.ts`
- `src/routes/manager.index.tsx`
- `src/routes/server.index.tsx`
- `src/routes/server.stats.tsx`
- `supabase/functions/ai-assist/index.ts`
