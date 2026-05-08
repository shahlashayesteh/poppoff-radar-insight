
# PoppOff — Full Build Plan

## Protected file check ✅
None of the files below appear in the protected list. The only permitted touches to protected files are:
- `src/routes/login.tsx` — update demo role-picker links to `/demo/*` only
- `src/routes/index.tsx` — replace only the 3 pricing tier cards (Starter/Pro/Enterprise) with new copy + CTAs
- `src/routes/checkout.success.tsx` — store `priceId` and forward to `/signup/manager`

All other protected files (root, router, supabase clients, paddle libs, styles.css, terms/privacy/refund, logo, etc.) are not touched.

## File plan

### Demo copies (verbatim duplicates of existing demo views)
- `src/routes/demo.server.tsx` ← copy of `server.index.tsx`
- `src/routes/demo.server.welcome.tsx` ← copy of `server.welcome.tsx`
- `src/routes/demo.server.progress.tsx` ← copy of `server.progress.tsx`
- `src/routes/demo.server.menu.tsx` ← copy of `server.menu.tsx`
- `src/routes/demo.manager.tsx` ← copy of `manager.index.tsx`
- `src/routes/demo.manager.team.tsx` ← copy of `manager.team.tsx`
- `src/routes/demo.manager.menu.tsx` ← copy of `manager.menu.tsx`
- `src/routes/demo.manager.priorities.tsx` ← copy of `manager.priorities.tsx`
- `src/routes/demo.manager.server.$id.tsx` ← copy of `manager.server.$id.tsx`

These keep showing the static sample data — no DB calls. The originals stay untouched until step 3.

### Permitted edits
- `src/routes/login.tsx` — change role-picker links to `/demo/manager` and `/demo/server`
- `src/routes/index.tsx` — replace 3 pricing cards only (Starter £99, Pro £199 Most Popular, Enterprise contact)
- `src/routes/checkout.success.tsx` — capture `priceId`, redirect to `/signup/manager?priceId=…`

### New auth/onboarding routes
- `src/routes/signup.manager.tsx` — post-payment account creation
- `src/routes/checkout.retry.tsx` — for managers without role/venue
- `src/routes/signin.tsx` — sign-in with role-based redirect
- `src/routes/join.tsx` — server join via 6-digit code

### Real authenticated routes (rewritten to use real data)
Manager (`_authenticated/_manager` layout, gated by `has_role(uid,'manager')`):
- `src/routes/manager.index.tsx` — dashboard with KPIs, team table, AI insight, CSV upload card, join code
- `src/routes/manager.team.tsx` — Trends page (charts)
- `src/routes/manager.server.$id.tsx` — individual server view
- `src/routes/manager.menu.tsx` — Menu Intelligence + AI parsing
- `src/routes/manager.priorities.tsx` — Weekly Priorities editor
- `src/routes/manager.coaching.tsx` — coaching page (NEW)
- `src/routes/manager.reports.tsx` — reports page (NEW)
- `src/routes/settings.tsx` — settings (rewrite to real data)

Server (`_authenticated/_server` layout, gated by `has_role(uid,'server')`):
- `src/routes/server.index.tsx` — Home with Top 3 rings, daily goal, streak, view-tracking insert
- `src/routes/server.stats.tsx` — Stats tab (NEW; replaces current `server.progress.tsx` content)
- `src/routes/server.menu.tsx` — Coaching tab + Got-it focus ack
- `src/routes/server.welcome.tsx` — Rewards tab (real picks)
- `src/routes/server.profile.tsx` — Profile tab (NEW)

### Layout / route guards
- `src/routes/_authenticated.tsx` — gates on Supabase session
- `src/routes/_authenticated._manager.tsx` — manager role guard
- `src/routes/_authenticated._server.tsx` — server role guard

(Real authed pages will move under these layouts. Demo and public stays at top level.)

### Components
- `src/components/manager-layout.tsx` — update to use real profile + signOut + dynamic nav
- `src/components/server-layout.tsx` — update bottom nav to include `/server/stats` and `/server/profile`
- `src/components/csv-upload-card.tsx` — date picker, template download, upload, error toasts
- `src/components/manager-kpi-card.tsx`
- `src/components/team-performance-table.tsx`
- `src/components/server-stat-ring.tsx`
- `src/components/perf-dot.tsx`
- `src/components/join-code-card.tsx`
- `src/components/role-redirect.tsx`

### Server functions / lib
- `src/lib/queries.functions.ts` — server fns: getManagerDashboard, getTeamPerformance, getServerOverview, getReports, getWeeklyPriorities, etc. (use `requireSupabaseAuth`)
- `src/lib/ai-coach.functions.ts` — Lovable AI Gateway calls (manager insight, talking points, menu parsing, verbal scripts) — keys server-only
- `src/lib/csv.ts` — CSV parse + template
- `src/lib/week.ts` — week_start helpers (Monday)

### Edge function
- `supabase/functions/ai-coach/index.ts` — proxy to AI Gateway (used by `ai-coach.functions.ts` or directly via supabase.functions.invoke)

## Database changes (single migration)

Existing tables stay. New work:

**Add columns** to `server_stats`: `sides_sales`, `spirits_sales`, `sparkling_sales` (numeric default 0) plus generated columns `sides_conversion`, `spirits_conversion`, `sparkling_conversion`. Existing generated `spend_per_cover`, `wine/dessert/cocktail_conversion` already there.

**Add columns** to `server_targets`: `sides_target` (30), `spirits_target` (20), `sparkling_target` (15), `daily_sales_target` (200).

**Add columns** to `server_milestones`: enforce `UNIQUE(user_id,venue_id,milestone_type)` if missing.

**New tables**
- `venue_settings(venue_id unique, cuisine, cover_capacity, green_threshold 80, amber_threshold 55, servers_see_percentages_only true, managers_see_estimated_uplift true, send_weekly_push_notifications true, allow_assistant_manager_priorities false, head_office_aggregated_only true, premium_mains_on, bottled_water_on, …)`
- `weekly_priorities(venue_id, week_start, item_name, category, priority_flag)` + composite index
- `server_stat_views(user_id, venue_id, week_start unique)`
- `server_focus_acks(user_id, venue_id, week_start unique)`
- `venue_menu` already exists — add `parsed_items jsonb`, `updated_at timestamptz`

**RLS** on every new table per spec (servers see own rows, managers full access on their venues via `EXISTS venues v WHERE v.manager_id = auth.uid()`).

**Functions** (extend existing)
- `calculate_performance_colour` — already exists, reuse
- `process_csv_upload` — already exists; extend to accept new sales columns, return `{matched_count, unmatched_names, success}`
- `update_streaks_and_milestones` — already exists; extend to evaluate new metrics

## AI Gateway usage
All AI calls flow through `LOVABLE_API_KEY` in a `createServerFn` handler (or edge function). Default model `google/gemini-3-flash-preview`. Use cases:
1. Manager dashboard insight (2-sentence weekly summary)
2. Individual server talking points
3. Menu parser → structured JSON via tool calling
4. Menu coaching recommendations (4 cards)
5. Server verbal script (Coaching tab + Rewards tab)

Tool-calling JSON schema for the menu parser to guarantee valid output.

## CSV upload flow
Client parses CSV with PapaParse → calls `process_csv_upload` RPC → toast results → invalidate React Query cache. Template download via Blob. Date picker forces Monday.

## Join code visibility
Manager dashboard has a prominent `JoinCodeCard` showing the 6-digit code, with copy button + "Regenerate" calling `regenerate_venue_join_code` RPC, plus instructions for servers to use `/join`.

## Role gating + redirects
- `/manager/*` requires manager role → else `/signin`
- `/server/*` requires server role → else `/signin`
- Cross-role hits redirect to the correct dashboard

## Global sweep
After authed pages are rewritten, grep for: Sarah, Maria, James, Ahmed, Chloe, "The Demo Restaurant", "Garden Table", URBAN PLATE, NORTH OAK, £58.40, 812, £1420, 484194, 295344, mock, hardcoded, sample — only inside authed routes (skip demo/landing/protected). Remove or replace with real-data bindings or empty states.

## Confirmations
1. ✅ File list above — none are protected (login.tsx, index.tsx, checkout.success.tsx changes are scoped to permitted edits only)
2. ✅ Demo files copied to `/demo/*` and not modified
3. ✅ New tables: `venue_settings`, `weekly_priorities`, `server_stat_views`, `server_focus_acks` + column additions to `server_stats`, `server_targets`, `venue_menu`
4. ✅ CSV upload flow with template, date picker, RPC call, unmatched-name warnings
5. ✅ Join code prominently shown on manager dashboard with copy + regenerate
6. ✅ Will proceed file-by-file once approved
7. ✅ Will confirm completion at end

## Build order
1. Migration (new tables/columns + RLS + function updates)
2. Demo copies
3. Update login.tsx links + checkout.success.tsx + index.tsx pricing cards
4. Auth layouts + signin/signup/join/checkout-retry
5. Shared components (csv upload card, join code card, kpi, perf dot, layouts)
6. Manager pages (dashboard → team → individual → menu → priorities → coaching → reports → settings)
7. Server pages (home → stats → menu → welcome → profile)
8. AI server functions + edge function
9. Global sweep + verify build
