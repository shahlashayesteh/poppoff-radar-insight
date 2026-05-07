# Full Cleanup: Real Data Only, No Hardcoded Content

Scope: bind two missing DB triggers, then rewrite every manager and server page (plus shared layouts and sample-data file) to query live data with empty states. No design / colour / font / layout changes.

## Step 1 — Database triggers (migration)

One migration that:

- Drops + recreates `on_auth_user_created` BEFORE INSERT trigger on `auth.users` calling `public.handle_new_user()`.
- Drops + recreates `set_venue_join_code_trigger` BEFORE INSERT trigger on `public.venues` calling `public.set_venue_join_code()`.

Both use `CREATE OR REPLACE TRIGGER` style (`DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ...`).

## Step 2 — Delete the hardcoded data module

Delete `src/lib/sample-data.ts`. After this step nothing in the app may import from it; build will catch any stragglers.

## Step 3 — Rewrites (file-by-file)

For every page below: keep the existing layout shell, Tailwind classes, Card components, headings styling. Replace inner content with React Query against Supabase. Show a Skeleton/`Loading…` while pending and the prescribed empty-state copy when no rows.

### `src/routes/manager.index.tsx`
- Query venue: `venues` filtered by `manager_id = auth.uid()` limit 1.
- Render venue `name` + `join_code` prominently at top (already partially handled by `JoinCodeCard`; reuse it).
- Query `venue_members` where `venue_id = venue.id` for server count.
- Empty states:
  - No venue → "No venue yet. Complete checkout to set one up."
  - No servers → "No servers yet. Share your join code with your team."
- No performance section rendered (placeholder removed entirely).

### `src/routes/manager.team.tsx`
- Query: `venue_members` where `venue_id = manager's venue id`, then second query `profiles` where `id IN (member user_ids)`. (Two queries because no FK declared between them.)
- Render rows with `profiles.full_name` (fallback "Unnamed server" if null).
- Empty: "No servers have joined yet."
- Strip Sarah/Maria/James/Ahmed/Chloe and any fake stats columns.

### `src/routes/manager.server.$id.tsx`
- Read `:id` from params.
- Verify membership: select 1 from `venue_members` where `user_id = :id AND venue_id = manager's venue id`. If not found render `404` empty state ("Server not found in your team.").
- Query `profiles` where `id = :id`, render `full_name`.
- All stats sections show "No data yet."

### `src/routes/manager.menu.tsx`, `src/routes/manager.priorities.tsx`
- Remove all hardcoded items/charts.
- Single empty state per page: "No data yet. Data will appear here once your team starts logging shifts."
- (No "trends" or "reports" route exists in this project — listed in the request but not present; nothing to do for those.)

### `src/routes/server.index.tsx`
- Query venue via `venue_members` join: `.from('venue_members').select('venue:venues(name, join_code)').eq('user_id', uid).maybeSingle()`.
- Query `profiles` where `id = auth.uid()` for `full_name`.
- Show greeting with real name and venue name.
- Empty states for stats / streak / milestones blocks: "No data yet."
- Strip all hardcoded numbers.

### `src/routes/server.progress.tsx`, `src/routes/server.menu.tsx`, `src/routes/server.welcome.tsx`
- Replace any hardcoded stats / menu items with the empty-state line above.
- `server.welcome.tsx` may keep onboarding copy (no fake names/numbers); review and strip the listed strings only.

### `src/components/manager-layout.tsx`, `src/components/server-layout.tsx`
- Remove any hardcoded user name / venue name / avatar text from the chrome; replace with live `profiles.full_name` query (or hide if not loaded).

## Step 4 — Global string sweep

After edits, run `rg` for: `Sarah|Maria|James|Ahmed|Chloe|Demo Restaurant|Garden Table|URBAN PLATE|NORTH & OAK|£58\.40|812|£1,420|484194|295344|\bdemo\b|\bsample\b|\bplaceholder\b|\bmock\b|\bfake\b` across `src/`. Required result: zero matches in app code (excluding shadcn `placeholder` HTML attribute usage in `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `ui/command.tsx` — those are valid React props, not content; will be left untouched).

If any non-shadcn match remains, fix before declaring done.

## Files changed (final list)

Migration:
- `supabase/migrations/<new>.sql`

Deleted:
- `src/lib/sample-data.ts`

Rewritten:
- `src/routes/manager.index.tsx`
- `src/routes/manager.team.tsx`
- `src/routes/manager.server.$id.tsx`
- `src/routes/manager.menu.tsx`
- `src/routes/manager.priorities.tsx`
- `src/routes/server.index.tsx`
- `src/routes/server.menu.tsx`
- `src/routes/server.progress.tsx`
- `src/routes/server.welcome.tsx`
- `src/components/manager-layout.tsx`
- `src/components/server-layout.tsx`

## Out of scope

- Design tokens, colours, fonts, spacing, layout structure.
- Auth flow, checkout flow, Paddle webhook, RLS policies (already correct).
- Adding new tables for shifts/stats — those don't exist yet, so pages just show empty states.

## Technical notes

- `venue_members → profiles` has no FK, so PostgREST embedded selects (`profiles(*)`) won't work. Use two sequential queries and join in JS.
- For the `auth.users` trigger we use `CREATE TRIGGER` (Postgres has no `CREATE OR REPLACE TRIGGER` before v14; project is PG14.5 per types but `DROP IF EXISTS` + `CREATE` is portable and safe).
- Trigger on `auth.users` is allowed because it only calls a `public` SECURITY DEFINER function and does not mutate auth schema objects (matches Supabase's documented `handle_new_user` pattern).
