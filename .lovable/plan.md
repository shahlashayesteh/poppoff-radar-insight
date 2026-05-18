## Problem

On real server accounts the leaderboard shows "No leaderboard data for this week yet" even though the venue has uploaded sales.

Root cause: in `src/routes/server.leaderboard.tsx` the `displayWeekStart` is resolved by querying `server_stats` for the latest `week_start`. RLS restricts servers to their own rows, so:

- If the signed-in server has no row for the most recent uploaded week (common: CSV name didn't match, server joined after the last upload, or rows exist only for older weeks), the helper falls back to today's calendar Monday.
- The `venue_weekly_leaderboard` RPC is then called for an empty week and returns 0 rows → empty state.

The manager-facing surfaces don't have this bug because managers can read every row in the venue.

## Fix

Resolve "latest week with venue data" from a venue-wide source instead of the caller's own rows, so every server sees the same week the manager sees.

### Database

Add a `SECURITY DEFINER` SQL function:

```text
public.latest_venue_stats_week(p_venue_id uuid) returns date
```

- Authorize: caller must be `is_venue_member(p_venue_id)` OR `is_venue_manager(p_venue_id)`.
- Returns `max(week_start)` across `server_category_stats` for the venue (falling back to `server_stats` if category stats are absent), or `null` when the venue has no data yet.
- Stable, search_path locked to `public`.

This is read-only on existing tables. No schema changes, no data migration.

### Frontend

In `src/routes/server.leaderboard.tsx`:

- Replace the `latestStatsWeek(supabase.from("server_stats")...)` call with a call to the new `latest_venue_stats_week` RPC.
- If the RPC returns `null`, keep the current behaviour (show the current calendar week + empty state).
- Keep the rest of the page unchanged (tabs, hero, highlights, RAG copy).

Optionally apply the same RPC swap to `src/routes/server.index.tsx` and `src/routes/server.stats.tsx` so the server's own dashboard week selector also tracks the venue's true latest week rather than only weeks where the server has personal rows. This makes the "Ranks" chip on the home page consistent with the leaderboard page. (Manager surfaces stay as-is — they already see everything.)

### Out of scope

- No UI redesign.
- No changes to the demo account routes.
- No changes to scoring, RAG thresholds, or `performance-engine` logic.
- No changes to manager dashboards.

## Verification

1. Sign in as a real server who has zero `server_stats` rows for the most recent uploaded week. Leaderboard now shows that week's ranking instead of the empty state.
2. Sign in as a server who does have rows for the latest week. Same week and ranking as before — no regression.
3. Sign in as the manager. `manager.team` and `manager.server.$id` still resolve to the same latest week (they already used venue-wide data).
4. Brand-new venue with no uploads: leaderboard still shows the empty state (RPC returns null → fallback).