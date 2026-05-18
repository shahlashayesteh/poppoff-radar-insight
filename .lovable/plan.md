# Performance Intelligence Engine

Central module: `src/lib/performance-engine.ts` — the single source of truth for every server-performance number (home, stats, manager view, AI coaching).

## What it does

- **Target-based rings** — `ringPct = clamp(current / target, 0, 100)`. Elite over-target tiers (1: 100–120%, 2: 120–150%, 3: 150%+) drive subtle glow + badge so top performers keep progressing past completion.
- **4-week rolling avg** as the primary behavioural benchmark. WoW remains as secondary signal. Status labels: Focus / Improving / Strong / Crushing, derived from `deltaVs4wk` (fallback WoW only when no history).
- **Category-aware denominator metadata** (`eligible_covers`, `adult_bev_opportunities`, `eligible_tables`, etc.) — labelled now, recomputable from a real `opportunity_count` later without page changes.
- **Quantity confidence** — `real` (POS qty), `estimated` (sales ÷ menu avg), `fallback` (default price). UI prefixes "~ est." when not real, never presents estimates as fact.
- **Blended performance score** (0–100):
  - 35% target achievement
  - 30% trend vs 4wk avg
  - 25% commercial impact, **normalised vs expected category sales** (baseline conversion × opportunity × avg price) so dessert outperformance isn't outweighed by average wine just because wine has higher £.
  - 10% consistency — **neutral 0.5 when sample < 3 weeks or opportunity < 20**, so peak/difficult shifts aren't punished.
- **Revenue Influence** — `(current − venueBaseline) / 100 × opportunity × avgPrice`. Foundation for "who actually moves £" rather than "who sold most".
- **Fairness / context foundation** — `server_stats.context jsonb` and `server_category_stats.opportunity_count` columns added. Engine threads them through; UI ignores when null. Future section/daypart/booking weighting plugs in here.

## Database migration

- `server_category_stats.opportunity_count numeric` (nullable)
- `server_stats.context jsonb` (nullable)

Both nullable, so historical data + every existing read continues to render unchanged.

## Pages wired to the engine

- `src/routes/server.index.tsx` — Top 3 + Smashed + Work-on driven by `performanceScore`. Rings use target-based fill + elite tiers. Deltas show "vs 4wk avg" (primary).
- `src/routes/server.stats.tsx` — bars use `ringPct`. Each row shows both "Xpp wk" and "Xpp 4wk" plus status label. Items line uses `formatItems()` ("123 sold" vs "~123 est."). Top tile shows real £ delta WoW + 4wk.
- `src/routes/manager.server.$id.tsx` — category breakdown bars now use the same target-based fill so manager + server views match exactly.

## AI coaching upgrade (`supabase/functions/ai-assist/index.ts → server_coaching`)

System prompt rewritten:
- Lead with trend/feel, not data-science phrasing.
- Ban "pp", "delta", "percentage points", "vs average", "conversion rate".
- Frame dips gently when 4-week trend is healthy.
- Sound like a floor manager, not a BI dashboard.

Deterministic stat block (built from DB, not AI) still appended verbatim to each tip so numbers are always exact.

## Out of scope (intentionally — foundations only)

- Demo routes (`src/routes/demo.*`) untouched.
- Section/daypart/booking-type UI inputs — schema ready, no UI yet.
- Backfill of historical `opportunity_count`.
- Leaderboards / predictive coaching / peak-hour weighting — engine ready, screens future work.

## Verification checklist

- Same conversion, delta, status label, ring fill on home / stats / manager-server / coaching for the same server+week.
- Chloe's dessert: ring fills to `current/target`; "vs 4wk avg" replaces volatile WoW noise; items label shows "~N est." when no real POS qty.
- No file under `src/routes/demo.` modified.
