## What's actually broken

`server_coaching` (the table that backs the "Your coaching this week" block on the server Home page) is **cached per `(user_id, venue_id, week_start)`** by the `ai-assist` edge function. Once a tip set is written for the current week, every subsequent visit returns the cached row — even after the manager uploads a new menu or regenerates pairings. That is why Chloe Williams still sees coaching tips referencing the previous menu items and 0% / £46.85 numbers from the old upload.

Pairings on the server **Coaching** page already update live (we wired `venue_pairings` realtime last turn). The remaining gap is the **AI coaching tips** on server Home, plus a small live-refresh on menu changes.

## Fix (no schema changes, no new RLS, no destructive edits)

### 1. Invalidate stale coaching at the source (edge function)

In `supabase/functions/ai-assist/index.ts`, after the admin client successfully:

- **`parse_menu`** inserts a new `venue_menu` row, **or**
- a manager regenerates pairings — specifically once at the start of the regen flow (the existing `list_food_items` action is the natural hook since `generatePairings` always calls it first), **or**
- a manager deletes a menu (covered by adding the same wipe to a new `invalidate_coaching` action that `manager.menu.tsx` calls after `venue_menu.delete`)

…run:

```ts
await admin.from("server_coaching").delete().eq("venue_id", venueId);
```

This wipes the cache for **every server in that venue**. Their next page load (or the live-refresh below) regenerates fresh tips that reference the new menu items and current stats. No schema/RLS change needed because the wipe runs under the service-role admin client inside the edge function.

### 2. Client trigger after manager deletes a menu

In `src/routes/manager.menu.tsx`, after the existing `await supabase.from("venue_menu").delete()` succeeds in `confirmRemoveMenu`, call the new `invalidate_coaching` action so removing a menu also clears stale tips.

### 3. Live refresh on the server Home page

In `src/routes/server.index.tsx`, add a small effect (mirrors the pattern we already use on `server.menu.tsx` for pairings):

- Subscribe to `postgres_changes` on `venue_menu` and `server_coaching` filtered by `venue_id=eq.${venueId}`.
- On any insert/update/delete, re-invoke `ai-assist` `server_coaching` for the current `(userId, venueId, weekStart)` and re-render the tips block.
- Also re-fetch on `window` focus as a fallback for dropped sockets.

This is the same realtime pattern already approved and shipped for `venue_pairings`.

### 4. One-line migration: publish `venue_menu` for realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_menu;
```

`server_coaching` is already inserted/updated by the edge function using the admin role, which is fine for realtime once added:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_coaching;
```

No table structure, no RLS, no triggers change.

### 5. Manager UX polish

After a successful menu upload in `manager.menu.tsx`, swap the existing toast to: **"Menu saved · coaching refreshed for your team"**. After regen pairings, keep the existing "Pairings ready · sent to your team" toast.

## Out of scope

- No changes to streaks, milestones, stats, weekly priorities, or CSV pipeline.
- No bulk pre-generation of coaching for every server up-front — invalidation + on-demand regeneration is cheaper and produces identical results the moment each server opens the app (and instantly via realtime if they're already on screen).
- No changes to `parse_menu` parsing logic, pairing generation logic, or AI prompts.

## Result

The moment the manager finishes uploading a new menu or regenerating pairings, every server's cached coaching is dropped. Any server with the app open re-fetches within ~1s via realtime; any server who opens the app later gets fresh, menu-aware tips on first load. Chloe Williams will stop seeing the old WOK FIRED ANGRY BIRD / YUZU LEMON DROP / £46.85 tips after the next upload or regen.
