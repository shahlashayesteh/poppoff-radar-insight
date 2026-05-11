## Goal
Make AI coaching strictly personal: each server gets tips derived from their own week's stats (vs targets and vs last week), surfaced both to the manager (on the server detail page) and to the server themselves (on their dashboard).

## What exists today
- Edge function `ai-assist` already has a `server_coaching` action that takes `userId` + `weekStart`, pulls that server's current week stats, previous week stats, their targets, and the venue menu, then returns 3–4 category-specific tips and caches them in the `server_coaching` table.
- Nothing in the app currently calls it — only the team-wide huddle endpoint (`coaching`) is used, on `/manager/coaching`.

## Changes

### 1. Manager — `src/routes/manager.server.$id.tsx`
- Add a new card under the category breakdown: "AI coaching for {name}".
- On load (after stats are fetched), invoke `ai-assist` with `action: "server_coaching"`, the venue id, `{ userId: id, weekStart: displayWeekStart }`.
- Render the returned `suggestions[]` as a list, each item showing its category badge + tip text.
- Add a "Regenerate" button that re-calls the function (bypassing cache by first deleting the cached row for that user/week, or by adding a `force` flag — see Technical Notes).
- Loading / empty / error states.

### 2. Server — `src/routes/server.index.tsx`
- Add an "Your coaching this week" card under the existing "work on" callout.
- After stats load, invoke `ai-assist` with `action: "server_coaching"` for the current user + `displayWeekStart`.
- Render the same suggestions list. No regenerate button on the server side — they consume what the cache holds (already populated for them by manager view or by their first visit).
- If no stats this week, hide the card (don't call the function).

### 3. Edge function — `supabase/functions/ai-assist/index.ts` (small tightening)
- The `server_coaching` action is already authored per-individual. Tighten the system prompt so each tip MUST cite the specific number from this server's week (e.g. "Your wine conversion is X% vs target Y%, down Z% from last week — try …") so output is provably tied to their stats, not generic.
- Add an optional `force: true` payload flag that skips the cache read and overwrites the cached row, used by the manager Regenerate button.
- Permission: the existing handler only verifies the caller manages the venue. Add a parallel branch so a server can request their own coaching (caller's `auth.uid()` === `userId`). Without this, servers calling the function are rejected.

### 4. Team huddle page — `src/routes/manager.coaching.tsx`
- No structural change. Keep team-wide talking points as-is (it's a different use case: pre-shift huddle).

## Technical notes
- `server_coaching` table already has RLS letting servers read their own row and managers read venue rows, so both surfaces can also re-read cached suggestions directly without re-invoking the function on every navigation.
- Caching key is `(user_id, venue_id, week_start)`. The cache check stays; only `force` bypasses it.
- The forbidden check in the edge function currently does `v.manager_id !== u.user.id` and 403s. We'll change `server_coaching` to also allow `u.user.id === payload.userId && is_venue_member(venueId)` (verified by a query against `venue_members`).
- No schema/migration changes required.
- No new dependencies.

## Acceptance
- On `/manager/server/{id}`: the coaching card shows 3–4 tips that reference that server's actual category percentages from the displayed week. Regenerate produces a fresh set.
- On `/server`: the same kind of tips render for the logged-in server's own week, hidden if no stats.
- Two different servers in the same venue see different coaching reflecting their own stats.
- Team huddle page (`/manager/coaching`) is unchanged.