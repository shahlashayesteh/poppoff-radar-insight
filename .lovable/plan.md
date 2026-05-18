## Investigation findings

The live database shows Chloe Williams belongs to venue `tere`, and the newest uploaded menu is already stored correctly:

- Latest menu: `liberty-and-oak-menu`, uploaded May 18, with 96 parsed items.
- Latest generated pairings: 72 rows, using the new menu items like `Hand-Cut Steak Fries`, `Roasted Bone Marrow`, and `Lobster Mashed Potatoes`.
- Chloe's cached Home coaching row is still old and references `WOK FIRED ANGRY BIRD`, `YUZU LEMON DROP`, and `WAGYU BEEF DUMPLING`.
- Realtime publication is correctly enabled for `venue_menu`, `venue_pairings`, and `server_coaching`.

So the problem is not that the new menu or new pairings failed to save. The problem is that the old `server_coaching` cache row still exists for Chloe’s visible week and is being returned before regeneration.

## Plan

1. Clear the stale live coaching cache for this restaurant
   - Delete only `server_coaching` rows for Chloe’s venue.
   - Do not delete menus, pairings, stats, users, or uploaded data.
   - This immediately forces server accounts to regenerate coaching from the latest uploaded menu on next load.

2. Make server-side coaching self-healing
   - Update the `server_coaching` action so a cached coaching row is only reused if it was generated after the latest menu upload and after the latest pairing generation.
   - If the menu or pairings are newer than the coaching row, regenerate automatically instead of returning stale text.
   - This fixes existing and future stale-cache cases even if realtime events are missed.

3. Ensure pairing regeneration fully replaces old pairings
   - The current pairing save uses an upsert, which can leave old pairing rows behind when the new generated set no longer includes them.
   - Change the generation flow so old rows are cleared before inserting the newly generated set, and make the server view reload after the final insert.

4. Improve server Home refresh reliability
   - Keep the realtime listener, but also refetch coaching on page visibility/focus and when the stored coaching row is older than the latest menu/pairings.
   - This prevents a server account from being stuck with old data after tab sleep, mobile backgrounding, or missed socket events.

5. Verify against live data
   - Confirm Chloe’s venue has no stale coaching cache after clearing.
   - Confirm the latest menu and pairings remain intact.
   - Confirm new coaching generation would use `liberty-and-oak-menu` items, not the old menu.