# Fix Tool 2 link + add tab switcher at top of /calculator

## Root cause of the broken link

`src/routes/calculator.tsx` is currently a leaf page — it renders its full body directly. The child route `src/routes/calculator.server-gap.tsx` is correctly registered at `/calculator/server-gap`, but because the parent route has no `<Outlet />`, the child has nowhere to mount. Clicking the link matches the child route but renders nothing visible, so it looks like the link is dead.

This is the documented TanStack "parent without Outlet" pitfall. The fix is to promote `/calculator` into a true layout route.

## What changes

### File operations
1. **Rename** `src/routes/calculator.tsx` → `src/routes/calculator.index.tsx`
   - Inside, update `createFileRoute("/calculator")` → `createFileRoute("/calculator/")`
   - Remove the bottom "Try Tool 2: Server Revenue Gap Calculator →" footer block (now replaced by the tabs at the top)
   - Everything else (sliders, receipt, copy) stays identical
2. **Create new** `src/routes/calculator.tsx` as a thin layout:
   - `createFileRoute("/calculator")` with `component: CalculatorLayout`
   - Renders the shared page chrome: small PoppOff eyebrow, a **tab switcher** with two `<Link>`s, then `<Outlet />`
   - Tabs:
     - **Quick Check** → `to="/calculator"` (Tool 1 — the slider tool)
     - **Upload POS Data** → `to="/calculator/server-gap"` (Tool 2)
   - Active tab styling via `activeProps` + `activeOptions={{ exact: true }}` on the Quick Check link so it doesn't stay active on the child route
   - Tabs use the existing `ToggleGroup` component for visual consistency with the market/on-cost toggles already on the page
3. **Edit** `src/routes/calculator.server-gap.tsx`
   - Remove the duplicate page-level eyebrow / "Back to Floor Leverage Check" link if present (the layout now owns the header)
   - No logic changes — calculation, parsing, privacy block, confidence pill all stay
4. `src/routeTree.gen.ts` regenerates automatically — no manual edit

### Head/SEO
- Each leaf route keeps its own `head()` (title, description, og, canonical). The layout route does **not** define `head()`, so leaf metadata wins per page. `/calculator` keeps the Floor Leverage Check meta; `/calculator/server-gap` keeps the Server Revenue Gap meta.

### Visual layout
```text
┌──────────────────────────────────────────────────────┐
│ PoppOff · Floor Leverage Check™      (eyebrow)       │
│                                                      │
│   [ Quick Check ]  [ Upload POS Data ]   (tabs)      │
│                                                      │
│   <Outlet />                                         │
│     - / calculator       → slider tool               │
│     - / calculator / server-gap → upload tool        │
└──────────────────────────────────────────────────────┘
```

The eyebrow + tabs sit above whatever the child renders. Page-specific headlines (h1, intro paragraph) stay inside each leaf route, so each page keeps its own focused hero.

## What does NOT change

- No changes to Tool 2's logic, calculation contract, parsing libs, templates, or privacy block
- No changes to bundle splitting — TanStack still code-splits per route, so the heavy `xlsx` / `papaparse` only loads when the user opens the Upload POS Data tab
- No protected files touched (no edits to `src/integrations/supabase/*`, `.env`, `src/router.tsx`, etc.)
- No backend, no auth, no server functions
- Existing copy, sliders, receipt panel, market toggle, on-cost toggle, hint text — all preserved verbatim

## Verification after build

1. Load `/calculator` → slider tool renders, "Quick Check" tab shows active state
2. Click "Upload POS Data" tab → URL changes to `/calculator/server-gap`, Tool 2 renders, tab active state moves
3. Click "Quick Check" tab → returns to slider tool
4. Hard-refresh on `/calculator/server-gap` → loads directly, tab state correct
5. Confirm receipt panel, sliders, and on-cost toggle on `/calculator` still behave identically

## Files touched (summary)

- renamed: `src/routes/calculator.tsx` → `src/routes/calculator.index.tsx` (and `createFileRoute` path updated; footer Tool 2 link removed)
- created: `src/routes/calculator.tsx` (new layout with tabs + `<Outlet />`)
- edited: `src/routes/calculator.server-gap.tsx` (remove duplicate top-of-page chrome only)
- auto-regenerated: `src/routeTree.gen.ts`
