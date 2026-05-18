## Plan

1. **Remove manual seeding from Chloe’s venue**
   - Delete the manually inserted current-week `weekly_priorities` rows for Chloe’s venue.
   - Delete Chloe’s cached `server_coaching` row so it regenerates from the uploaded stats on the next load.
   - Do not update any `server_stats`, targets, conversions, or menu data by hand.

2. **Make server coaching use the exact stored stat values**
   - Update `ai-assist` so `server_coaching` builds coaching from the actual `server_stats` row when dynamic category stats are missing.
   - Keep the raw values precise internally, and only round when writing human-readable coaching text.
   - Add guardrails so the AI cannot invent category numbers: the prompt will receive a strict list of allowed stat lines and must cite only those values.

3. **Stop auto-generating priorities from the wrong week**
   - Change `manager.menu.tsx` so priority regeneration uses the latest uploaded stats week for the venue, not the real calendar week.
   - If the venue has no stats yet, skip priority auto-generation rather than creating guessed push items.

4. **Make `/server/menu` personalize pairings from the same data source**
   - Update the weak-category logic on `server.menu.tsx` to fall back to legacy `server_stats` categories when `server_category_stats` has no rows.
   - This makes the “what to push” / pairing focus reflect the server’s latest uploaded stats instead of appearing blank or generic.

5. **Deploy and verify**
   - Deploy the `ai-assist` function after code changes.
   - Verify with read-only database queries that Chloe’s visible week, cached coaching, priorities week, and menu page data all line up with uploaded stats.

## Technical notes

- Chloe’s uploaded latest row currently shows dessert conversion as `8.53788687299893276400`; the UI/coaching may display that as `8.5%` or `9%` depending rounding. I will not change that value.
- The previous manually inserted priority rows will be removed, because they were not produced from Chloe’s uploaded week data.
- No schema or RLS changes are needed.