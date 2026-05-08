## Scope

Rework only the data shown and the targets/coaching/leaderboard logic per your spec. Keep every layout, card, color, font, spacing, and visual element exactly as-is. No restyling.

## 1. Server views — swap data only (no layout changes)

Files: `src/routes/server.index.tsx`, `src/routes/server.stats.tsx`, `src/routes/server.progress.tsx`

- Remove all £ values from server pages. Replace the existing text in place:
  - "Sales this week £X / £Y" card → "Upsell rate this week" with current % and `↑/↓ X% vs last week` (red if down, green if up). Same card, same position.
  - "Spend per cover £X" row on stats → "Items sold this week" count with delta vs last week. Same row, same styling.
  - Each category row keeps its existing progress bar and ring; the right-hand label changes from `actual% / target%` to `<count> sold · ↑/↓X% vs last week`.
- Ring colours: keep as-is, but driven by AI target (see §3) instead of manual.

## 2. Manager views — additive only

Files: `src/routes/manager.server.$id.tsx`, `src/routes/manager.team.tsx`

- Existing "Engagement" card stays. Add two lines inside it (no new cards): `Total logins` and `Last login`.
- Team table: add one extra column `Logins` to the right of existing columns. No other visual change.
- All £, covers, totals, server names — kept exactly as today.

## 3. AI targets (backend only, no UI change)

- New SQL function `recompute_ai_targets(_venue_id)`: target = max(personal 8-week avg × 1.10, venue avg). Runs at end of `process_csv_upload`.
- Settings page target editor: leave the UI as-is but make inputs disabled with a small note "AI-managed" under the section heading. No layout change.

## 4. AI coaching (backend + reuse existing card)

- New edge function `ai-coaching` (Lovable AI Gateway, `google/gemini-3-flash-preview`).
- New table `server_coaching (user_id, venue_id, week_start, suggestions jsonb)`.
- The existing "This week's coaching" card on `/server/menu` and the manager coaching page render the AI text into the cards that already exist. No new cards, no restyle.

## 5. Anonymous leaderboard (text-only swap)

File: `src/routes/server.progress.tsx` (or wherever leaderboard currently renders).

- New RPC `get_leaderboard_position` returns `{ my_position, total }` only.
- Replace any rendered names/avatars with `You're #3 of 12`. Same card container, same fonts.

## 6. Engagement tracking

- New table `server_logins` and RPC `record_login` called on server dashboard mount (no UI).
- Manager engagement card reads from it.

## What will NOT change

- No layout, spacing, colour, font, card, or component restyle.
- No new pages, no removed pages.
- No nav changes.
- Demo routes untouched.
- Manager dashboard £ figures untouched.

## Questions

1. **Items sold count** — OK to derive as `category_sales ÷ avg_menu_price` (from parsed menu)? Or extend CSV to include per-category item counts?
2. **Settings target editor** — disable inputs in place (preferred, zero layout change), or hide the section entirely?
