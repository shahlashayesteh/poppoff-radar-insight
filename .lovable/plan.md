## Goal
Apply the safe fixes from the investigation: streaks/milestones must honour dynamic categories, metric-aware UI in `server.index.tsx` and `manager.server.$id.tsx`, and ensure legacy six only show when no dynamic data exists for a week. Do not rebuild extraction.

## Changes

### 1. SQL migration — `update_streaks_and_milestones`
Rewrite the `v_hit` calculation:

- Count dynamic rows for `(_user_id, _venue_id, _week_start)` in `server_category_stats`.
- **If any dynamic rows exist**: `v_hit` is `true` when `spend_per_cover ≥ spend_per_cover_target` AND every tracked category in `server_category_stats` for that week meets/exceeds its `server_category_targets.target` (joined on `category_key`). Missing target → treat as hit (don't punish unset targets).
- **If no dynamic rows exist**: keep the existing legacy logic (`wine/dessert/cocktail_conversion ≥ targets`) so old accounts still work.
- Everything else in the function (milestones, top performer, personal best, streak counter) is unchanged.

### 2. `src/routes/server.index.tsx` — metric-aware Top 3
- Replace alphabetical-by-`sort_order` slice with sorting categories by primary metric value descending (quantity for quantity rows, net_sales for sales rows, conversion for percentage). Take the top 3.
- For each ring:
  - **Display value**: quantity → `"N"` with `"sold"` sublabel; sales → `"£N"`; percentage → `"N%"`.
  - **Fill %**: quantity → `(qty / target) * 100`; sales → `(net / target) * 100` only if target > 0 else fall back to conversion; percentage → `conversion`.
  - **Delta vs last week**: use the primary metric (qty for quantity rows, net for sales/percentage), not always `.sales`.
- `smashed` / `workOn`: compute delta using the primary metric per category.

### 3. `src/routes/manager.server.$id.tsx` — metric-aware breakdown
For each category row, branch on `metric_type` from `catStats[c.key]`:
- **quantity**: bar fill = `min(100, conversion)` (per-cover %), right label = `"N sold · X per cover / target Y per cover"`.
- **sales/percentage**: keep current `"X% / Y%"` label.

Pull `metric_type` from `categories[i].metric_type` (already populated by `fetchCategoriesForWeek`) or `catStats[c.key].metric_type`.

### 4. Legacy fallback — already correct
`fetchCategoriesForWeek` already returns `LEGACY_DEFAULTS` only when zero rows exist for the week. No change needed. Verify by re-reading.

### 5. Verification
- Run TypeScript build.
- Manually trace test case: upload with only Salted Edamame / SESAME CRACKERS / Szechuan Edamame → `fetchCategoriesForWeek` returns only those 3 → dashboards show only those 3 with "N sold" labels → targets in `server_category_targets` use `metric_type='quantity'` → streak hit derived from those 3 categories vs their quantity targets.

## Files Changed
- `supabase/migrations/<new>.sql` — rewrite `update_streaks_and_milestones`
- `src/routes/server.index.tsx`
- `src/routes/manager.server.$id.tsx`

## Out of scope
- `src/lib/csv.ts`, `parse_stats_image` OCR prompt, `process_csv_upload`, `recompute_ai_targets` — unchanged.
- `server.stats.tsx`, `manager.index.tsx` — already metric-aware.
