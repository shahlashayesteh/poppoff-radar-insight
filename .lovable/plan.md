## What I found

The uploaded sales data exists for the venue and week shown:

- Week: Mar 30 – Apr 5
- `server_stats`: 8 server rows, £14,839 total sales
- `server_category_stats`: 48 category rows
- The ranking query itself returns the correct 8 servers when run directly.

The mismatch is caused by the `venue_weekly_leaderboard` database function. Because it returns a column named `user_id`, the unqualified `SELECT user_id` inside the function is ambiguous in PL/pgSQL. When called as a signed-in server, it errors with:

```text
column reference "user_id" is ambiguous
```

The frontend catches that RPC error and returns an empty array, so the page shows “No leaderboard data for this week yet.” The “Longest streak: Unknown” still appears because streaks load from a separate table, but the leaderboard board is empty, so it cannot map that streak user to a name.

## Fix plan

1. Update the `venue_weekly_leaderboard` function
   - Qualify every column reference with table aliases, especially `user_id`, `week_start`, and `venue_id`.
   - Keep the ranking source as `server_stats.total_sales` so managers’ uploaded totals drive the leaderboard.
   - Keep category breakdowns joined from `server_category_stats` for tabs.
   - Keep access limited to authenticated venue members/managers.

2. Improve the frontend fallback behavior
   - If the leaderboard RPC fails, keep logging the real error instead of silently looking like “no data.”
   - Make the empty state distinguish between “no uploaded data” and “data could not load” so this problem is visible next time.

3. Fix the streak name mismatch
   - Only show “Longest streak” when that streak user exists in the leaderboard, or fetch profile names for streak users separately.
   - This prevents “Unknown” appearing above an empty board.

4. Validate the fix
   - Re-test `venue_weekly_leaderboard` as a simulated signed-in server account.
   - Confirm it returns all 8 ranked rows for Mar 30 – Apr 5.
   - Confirm the server leaderboard will show: #1 Maria Santos, #2 Sophie Turner, #3 Daniel Clarke, and so on down to #8.