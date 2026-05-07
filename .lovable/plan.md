# Make "Book a Demo" open a real demo dashboard

## Problem
The "Book a Demo" buttons on the landing page link to `/login`, so visitors land on the sign-in screen. There is no demo experience anymore — the previous sample data file was deleted in the recent cleanup, and `/manager` is auth-gated and shows only live DB data.

## Goal
Clicking "Book a Demo" opens a public, read-only preview of the manager dashboard (and key sub-pages) populated with sample data, with no login required. Authenticated pages stay clean (live data only).

## Approach

### 1. Restore sample data — but isolated to the demo
Recreate `src/lib/demo-data.ts` containing the hardcoded values (Sarah, Maria, James, Ahmed, Chloe, "The Demo Restaurant", join code 484194, £58.40, 812, £1,420, etc.). This file is only imported by `/demo/*` routes — never by `/manager/*`, `/server/*`, or `/settings`.

### 2. New public routes (no auth)
- `src/routes/demo.tsx` — layout wrapper that renders a "Demo mode" banner + a `<Outlet />`. Includes a "Back to site" link and a "Sign up" CTA.
- `src/routes/demo.index.tsx` → `/demo` — manager dashboard view using `demo-data.ts` (mirrors the look of `manager.index.tsx` but with sample venue, team list, and join code).
- `src/routes/demo.team.tsx` → `/demo/team` — team page with sample servers.
- `src/routes/demo.server.$id.tsx` → `/demo/server/:id` — sample server detail.
- `src/routes/demo.menu.tsx`, `src/routes/demo.priorities.tsx` — sample menu and priorities views.

All demo pages reuse the same visual components but pass demo data via props instead of querying Supabase. No design/colour/layout changes.

### 3. Update landing page
In `src/routes/index.tsx`, change both "Book a Demo" links (lines 60 and 236) and the inline CTA (line 83) from `<Link to="/login">` to `<Link to="/demo">`.

### 4. Keep authenticated pages untouched
No changes to `manager.*`, `server.*`, `settings.tsx`, layouts, or `RequireAuth`. The "no hardcoded data on authenticated pages" rule remains intact — sample data lives only under `src/lib/demo-data.ts` and is imported only by `/demo/*` routes.

## Files
- New: `src/lib/demo-data.ts`
- New: `src/routes/demo.tsx`, `demo.index.tsx`, `demo.team.tsx`, `demo.server.$id.tsx`, `demo.menu.tsx`, `demo.priorities.tsx`
- Edited: `src/routes/index.tsx` (3 link targets)

## Out of scope
Booking form, Calendly integration, analytics tracking, demo for the server-side (`/server/*`) views — can be added later if you want them.
