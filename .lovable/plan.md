## Problem

Two issues on Chloe's server account after the new menu upload:

1. **`/server/menu` still shows old menu items** in the "Push these this week" section. That section reads from `weekly_priorities`, which was never cleared when the new menu was uploaded. Chloe's venue still has rows for `YUZU LEMON DROP`, `WAGYU BEEF DUMPLING`, `ASIAN PEAR STICKY TOFFEE PUDDING`, etc. for past weeks.
2. **Coaching looks "blank"** on the home page right after a menu change because the cache is invalidated immediately but new tips take a few seconds to generate, and there is no loading indicator during that gap. (Database now has fresh tips referencing the new Liberty & Oak menu, so generation itself works.)

## Fix

### 1. Clear stale weekly priorities for Chloe's venue (immediate cleanup)

Run a migration that deletes all `weekly_priorities` rows for venue `cd6604ee-e149-4412-8f03-be479f38dcc5` so Chloe sees a clean slate instead of items from the old menu.

### 2. Invalidate weekly priorities on menu changes (prevent recurrence)

Extend the existing menu-upload / menu-delete / pairing-regeneration flow in `src/routes/manager.menu.tsx` so it also deletes `weekly_priorities` rows for the venue whenever the menu or pairings change. This way no other venue ever ends up in Chloe's situation again.

### 3. Show a loading state for coaching on the server home page

Update `src/routes/server.index.tsx` so when `server_coaching` is being (re)generated, the UI shows a "Generating fresh coaching based on the new menu…" placeholder instead of an empty area. Trigger this state when:
- the coaching fetch is in flight, or
- a realtime menu/pairing change just invalidated the cache.

### 4. Make the `/server/menu` "Push these" section gracefully handle the empty case

Once weekly priorities are cleared, the page already shows "Your manager hasn't set this week's priorities yet." Confirm this copy is friendly and visible.

### 5. Verify

- Confirm `weekly_priorities` for Chloe's venue is empty after migration.
- Confirm the latest `server_coaching` row for Chloe references the new Liberty & Oak menu items (already true).
- Confirm `/server/menu` no longer shows YUZU LEMON DROP / WAGYU BEEF DUMPLING / ASIAN PEAR STICKY TOFFEE PUDDING.
- Confirm the server home page shows a loading state instead of a blank panel during regeneration.

## Technical details

- Migration: `DELETE FROM weekly_priorities WHERE venue_id = 'cd6604ee-e149-4412-8f03-be479f38dcc5';`
- `manager.menu.tsx`: after successful menu upload, menu delete, and `regenerate pairings`, additionally call `supabase.from('weekly_priorities').delete().eq('venue_id', venueId)` alongside the existing `invalidate_coaching` call.
- `server.index.tsx`: add `coachingLoading` state; set true while fetching or right after a realtime invalidation; render a spinner + "Generating fresh coaching…" message in the coaching card body until the new row arrives.
- No RLS or schema changes required — managers already have full ALL access to `weekly_priorities`.
