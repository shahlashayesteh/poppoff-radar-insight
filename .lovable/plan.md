# Performance Intelligence Engine

Central module: `src/lib/performance-engine.ts` — the single source of truth for every server-performance number (home, stats, manager view, AI coaching).

## What it does

- **Venue-level loader** — `loadVenuePerformance({venueId, weekStart, userIds})` runs the engine for every server in parallel and returns ranked entries, totals, and an avg overall score. Manager surfaces consume this so the team table, server detail, and overview cards always agree with the server's own page.
- **Overall server score** (`overallScore`) — commercially-weighted avg of category scores (weight = expectedSales → sales → 1). Single number used for ranking and team-table colour.
- **Score tone / label** (`scoreTone`, `scoreLabel`) — central translation from 0–100 score to Focus / Improving / Strong / Crushing + colour, replacing every page's local `performanceColour` call on real surfaces.
- **Blended performance score** (0–100):
  - 35% target achievement
  - 30% trend vs 4wk avg
  - 25% commercial impact, **normalised vs expected category sales** (baseline conversion × opportunity × avg price) so dessert outperformance isn't outweighed by average wine just because wine has higher £.
  - 10% consistency — **neutral 0.5 when sample < 3 weeks or opportunity < 20**, so peak/difficult shifts aren't punished.
- **Revenue Influence** — `(current − venueBaseline) / 100 × opportunity × avgPrice`. Foundation for "who actually moves £" rather than "who sold most".
- **Fairness / context foundation** — `server_stats.context jsonb` and `server_category_stats.opportunity_count` columns. Engine threads them through; UI ignores when null.

## Pages wired to the engine

- `server.index.tsx` — Top 3 + Smashed + Work-on driven by `performanceScore`. Rings use target-based fill + elite tiers. Deltas show "vs 4wk avg".
- `server.stats.tsx` — bars use `ringPct`. Each row shows both "Xpp wk" and "Xpp 4wk". Items line uses `formatItems()`.
- `manager.server.$id.tsx` — fully rebuilt on the engine: overall-score KPI, totals strip with WoW + 4wk + revenue influence, category breakdown rows with status tone + dual deltas + revenue influence.
- `manager.team.tsx` — server cards ranked by engine overall score; each card shows score, status label, rank, WoW/4wk sales delta, revenue influence.
- `manager.index.tsx` — team-table category dots now come from `statusTone(engine row)` via `loadVenuePerformance`, so the manager dashboard matches the server's own status colour exactly. KPI tiles + upload flow unchanged.

## Legacy paths removed from real surfaces

- `performanceColour` no longer drives any real-surface dot/bar (only `demo.*` routes keep it for unrelated parity reasons, per scope).
- Manager-server detail no longer reads `server_stats.<cat>_conversion` directly — it consumes engine rows only.


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
