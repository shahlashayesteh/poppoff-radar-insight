## Goal

Every manager-side delete action:
1. Shows a clear **warning dialog** explaining exactly what will be removed and that it's permanent.
2. Deletes **only the chosen thing** — no over-deletion of unrelated data.
3. Cleans up any data that is meaningless without the deleted thing (so nothing is left orphaned).

## Delete actions in scope

| # | Page | What is deleted | Warning today | Cascade today | What to do |
|---|---|---|---|---|---|
| 1 | `manager.index.tsx` → `deleteAllUploads` | **All** uploaded CSV stats (venue-wide, manager-initiated bulk wipe) | basic `window.confirm` | mostly complete, gaps in per-week branch | Replace confirm with dialog; fix cascade gaps |
| 2 | `manager.menu.tsx` → `removeMenu` | A single menu file | none | direct row delete only | Add dialog; **delete only that menu** |
| 3 | `manager.menu.tsx` → `generatePairings` | Wipes existing pairings before regen | none | n/a | Add dialog confirming regeneration |
| 4 | `manager.priorities.tsx` → `remove` | One weekly priority row | none | self-contained | Add dialog |

## Changes

### 1. Shared confirmation component — `src/components/confirm-delete-dialog.tsx`

Wrapper around the existing shadcn `AlertDialog`. Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel` (default "Delete permanently"), `onConfirm`, `loading`. Destructive red confirm + Cancel. Reused everywhere for consistent copy and look.

### 2. Wire the dialog into each delete site

Copy is scoped to exactly what is being deleted — no scary "everything" language for single-item deletes.

- **Delete all CSV stats** (bulk action): *"This permanently deletes every week of server stats, category stats, views, acknowledgements, coaching, milestones, streaks and weekly priorities for this venue. It cannot be undone."*
- **Delete a single menu**: *"Delete this menu? Only this menu file will be removed from the system. Your other menus, pairings, server stats and priorities are not affected. This cannot be undone."*
- **Regenerate pairings**: *"Regenerating will replace your current pairings with a new set. The old pairings will be discarded. Continue?"*
- **Delete a weekly priority**: *"Delete this weekly priority? Servers will no longer see it in their coaching. Other priorities are not affected."*

Each page tracks a small `pendingDelete` state and renders one `<ConfirmDeleteDialog>` at the bottom.

### 3. Database migration — only fix the real cascade gap (CSV per-week)

Update `delete_csv_uploads` so the **per-week** branch matches the completeness of the **delete-all** branch (manager already opted into removing those weeks; the badges/streaks tied to them should go too):

- Collect users who had `server_stats` rows in the targeted weeks.
- Delete `server_milestones` for those users in this venue with `unlocked_at >= min(deleted week_start)` — streak / personal-best / top-performer badges were earned from now-deleted weeks.
- Zero `server_streaks` for those users and re-run `update_streaks_and_milestones` for each remaining week per user in chronological order, so counters and badges reflect what's left.
- Call `recompute_ai_targets(_venue_id)` at the end of both branches so targets stop referencing deleted history.

Signature unchanged (`_venue_id uuid, _weeks date[] DEFAULT NULL`) — existing client call keeps working.

### 4. Menu delete stays surgical

`removeMenu` continues to call `supabase.from("venue_menu").delete().eq("id", id)` — **only that single row**. Pairings are venue-level, not per-menu, and represent a separate manager workflow; deleting one menu must not touch them. No new RPC needed.

### 5. Weekly-priority delete stays surgical

`remove(id)` continues to delete just the one `weekly_priorities` row.

## Out of scope

- No new "remove team member", "delete venue", or "delete account" flows — those UIs don't exist yet.
- No changes to RLS or auth.
- No deletion of pairings when a menu is removed (explicitly excluded per your message).

## Technical notes

- `delete_csv_uploads` keeps its current signature; only its per-week branch gains the milestone cleanup + streak recompute.
- Dialog uses existing shadcn `AlertDialog` primitive — no new dependencies.
- All cascade work is scoped to the specific item the manager chose; the only "wipes a lot" action is the existing explicit **Delete ALL uploads** button, and its dialog spells that out clearly.
