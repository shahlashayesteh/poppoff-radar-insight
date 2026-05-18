## Findings

The server leaderboard is still empty for some server accounts because the current leaderboard path is fragile in two ways:

1. **Leaderboard RPC only reads category stats**
   - `venue_weekly_leaderboard` builds rankings from `server_category_stats` only.
   - If an upload creates `server_stats` but no usable category rows, the leaderboard returns no rows even though manager stats exist.

2. **Matched server accounts and placeholder upload rows can diverge**
   - Manager uploads create placeholder profile rows when CSV names do not match a real signed-up server exactly.
   - The leaderboard can rank placeholder/upload identities while the logged-in server account may have no matching current-week row, so the server may not see themselves even when the venue has leaderboard data.

Current database snapshot confirms this risk:
- Venue `tere` has uploaded data for 8 stat users.
- Only 4 of the signed-up server accounts have matched stats.
- Some uploaded leaderboard rows are placeholders/no-role accounts.
- Other venues/accounts currently have no uploaded stats at all, so they correctly show empty.

## Plan

1. **Make the leaderboard database function robust**
   - Update `venue_weekly_leaderboard` so it ranks from `server_stats.total_sales` as the primary source of weekly overall sales.
   - Join category stats only for category breakdown tabs.
   - Keep the security rule: only venue members or the venue manager can call it.
   - Keep `latest_venue_stats_week` as the venue-wide latest uploaded week helper.

2. **Fix identity matching for signed-up servers**
   - Add or update a safe database repair/helper flow so when a signed-up server account exists with the same normalized name as a placeholder uploaded profile, the uploaded stats/category rows are merged into the real server account.
   - This uses the existing `merge_server_account_data` pattern rather than duplicating rows.

3. **Make the frontend expose backend errors instead of silently hiding them**
   - Update `loadVenueLeaderboard` so RPC errors are logged in development and can be diagnosed instead of returning an indistinguishable empty array.
   - Keep the server-facing UI simple: if there is genuinely no uploaded data, show the empty message; if data exists, show rankings.

4. **Align rank calculations**
   - Ensure `/server/leaderboard` overall ranking is calculated from uploaded venue sales for the selected week.
   - Keep category tabs based on parsed category data when present.
   - Note: `server.progress.tsx` still uses the older `get_leaderboard_position` function ranked by spend-per-cover. I will leave that unless you want this same fix extended there too.

## Expected result

- Servers in a venue with uploaded manager stats will see the weekly leaderboard.
- Rankings will be parsed from manager uploads automatically.
- Overall top-to-bottom order will be based on weekly uploaded sales.
- Category tabs will still work when category data was parsed.
- Server accounts whose uploaded stats were sitting on placeholder profiles will be merged so they can see their own position.