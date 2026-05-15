## Problem

On the demo manager pages (current route `/demo/manager`, viewport 390px), the sidebar is hidden because `src/components/manager-layout.tsx` uses `hidden md:flex`. There is no mobile nav, so Dashboard, Team, Individual, Trends, Menu Intelligence, Weekly Priorities, Coaching, Reports, and Settings are unreachable on mobile.

## Note on shared layout

`ManagerLayout` is the same component used by both real `/manager/*` and demo `/demo/manager/*` pages. The mobile dropdown will therefore appear on both — there's no clean way to add it to only the demo pages without duplicating the layout, and the fix is equally desirable on the real manager pages. Visually nothing changes on desktop (≥768px). If you want it strictly demo-only, say so and I'll branch on `isDemo` (already available in the component) so the mobile bar only renders on demo routes.

## Change (single file: `src/components/manager-layout.tsx`)

Add a mobile-only top bar (`md:hidden`) above the existing `<main>`:

- Logo on the left, linking to `prefix("/manager")`.
- A clickable dropdown trigger on the right showing the current page label + chevron.
- Dropdown lists the same `items` array already in the file, using the same `prefix()` so links work in both demo and real modes.
- Active item uses the existing `bg-brand-green/10 text-brand-green` style.
- Footer of the dropdown reuses the existing "Need help?" mailto and "Sign out" button (sign out is already a no-op in demo mode).

Built with the existing shadcn `DropdownMenu` (`@/components/ui/dropdown-menu`). No new dependencies. Desktop sidebar (`hidden md:flex`) is untouched.

## Out of scope

Desktop layout, sidebar design, colors/typography, routes, ServerLayout, any other page or component.

## Verification

- 390px on `/demo/manager`: top bar visible, dropdown opens, every sidebar destination reachable, active item highlighted.
- ≥768px: layout identical to today.
