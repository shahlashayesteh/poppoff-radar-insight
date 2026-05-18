# Server Homepage Redesign — Motivation-First Dashboard

## Scope

Refine **`src/routes/server.index.tsx`** only. No changes to `performance-engine.ts`, leaderboard logic, or stats schema — all new sections derive from data the engine already returns (`CategoryMetric`, `LeaderboardRow`, `itemsToTarget`, `humanMomentum`, `humanTargetCall`). Minor tweaks to a couple of motivation helpers if a phrasing is missing, but no engine math changes.

## New Homepage Order

1. Greeting + "Stats just dropped 🎉" + week range *(keep)*
2. Rank card *(keep, tighten copy)*
3. **Top 3 performance circles** — restyled as strong RAG barometers
4. **Weekly Win card** ("You're crushing X") *(keep, sharpen)*
5. **Weekly Focus card** ("Push X and Y this week") *(keep, sharpen)*
6. **Tonight's Push** — NEW: 3–4 concrete actionable goals
7. **Leaderboard Pulse** — NEW: small competitive teaser
8. Coaching preview *(keep, moved lower)*
9. Streak / Leaderboard quick links *(keep)*

## Section Details

### Top 3 circles — stronger RAG barometers

- Increase ring stroke width and saturation. Green/amber/red now use full brand tokens, not pastels:
  - Green: `var(--brand-green)` solid stroke + soft halo when `eliteTier ≥ 1`
  - Amber: `var(--brand-orange)` solid
  - Red: `var(--opportunity)` solid + subtle pulse animation when `ringPct < 50`
- Track (unfilled) becomes much lighter (`8%` mix instead of `18%`) so the fill reads instantly.
- Label band above each circle: **WINNING / CLOSE / FOCUS** (rename `PUSH` → `FOCUS` to match brief), in the matching RAG color, bolder.
- Sub-line under circle keeps `humanMomentum()` text but adds a second micro-line with `humanTargetCall()` when present (e.g. "Only 1 more dessert to hit target"). Two lines max.
- Use `ragFromRing()` already in engine — no new math.

### Weekly Win card

- Keep the green "You're crushing X" layout.
- Always show **both** lines now (currently the target line only appears when momentum exists):
  - Line 1: momentum (`Up 21% on your usual`)
  - Line 2: target call (`Only 1 more dessert to hit target`)
- If at target → "Beat target by N — keep flying".

### Weekly Focus card

- Keep red/amber layout but auto-pick tone: red if any focus row has `ringPct < 50`, otherwise amber.
- Each bullet: `Wine: 2 more to hit target` / `Cocktails: 3 more to go green` (the "go green" phrasing fires when `ringPct` is between 65–89 and adding `itemsToTarget()` items would push past the 90% green threshold).

### Tonight's Push — NEW

Card titled **"Tonight's Push"** with a lightning/target icon. Generates up to 4 prioritized goals from existing data:

1. **Target-proximity wins** — for any category where `itemsToTarget() ≤ 5`: "Sell N more {category} to hit target".
2. **Go-green nudges** — for amber categories where adding `itemsToTarget()` crosses into green: "Sell N more {category} to turn it green".
3. **Streak protection** — if `streak > 0` and the current best category is at risk: "Sell 1 more {category} to keep your streak alive".
4. **Rank chase** — if not #1, compute item gap to the person directly above using `LeaderboardRow.current_by_category` totals: "Move up 1 rank by beating {Name} — N items to catch them".

Sorted by impact (target proximity first, then rank chase). Cap at 4 bullets. Each bullet has a colored dot (green/amber/orange) and bold action verb.

### Leaderboard Pulse — NEW

Small card (not full leaderboard). Shows:

- **"Next to catch"** — server one rank above with item gap: `Chloe — 4 items ahead`
- **"Watch out"** — server one rank below with item gap: `Ahmed — 2 items behind`

Edge cases: if #1 → only show "Watch out". If last → only show "Next to catch". Item totals come from summing quantities in `LeaderboardRow.current_by_category` (same logic already in `server.leaderboard.tsx`'s `itemsForRow`), so extract that helper into a small local function or inline it.

Whole card is a `<Link to="/server/leaderboard">` to drive engagement.

### Coaching preview

- Move below Leaderboard Pulse. No content change.

## Color Psychology Tweaks

- Bump card borders from `35%` mix → `50%` mix for stronger emotional read.
- Green soft-bg mix from `10%` → `14%`; red/amber soft-bg from `6%` → `12%`.
- All applied via the existing `ragSoftBg`/`ragBorder` helpers — bump the percentages in those two functions in `performance-engine.ts` (one-line change each, shared by all surfaces — confirm no manager surface regression by visual check).

## Technical Notes

- No new dependencies, no DB changes, no new RPCs.
- All new sections gated on `hasStat` like existing cards.
- Item-gap math for Pulse + rank-chase Push goal reuses the same `current_by_category` summation logic already proven in `server.leaderboard.tsx` — lift into a tiny `itemsTotal(row)` helper inside `server.index.tsx` (or co-locate next to `loadVenueLeaderboard` in the engine if you want it shared).
- Rename ring label `"PUSH"` → `"FOCUS"` in `ragLabel()` to match the user's spec.
- Coaching section keeps its existing realtime subscription.

## Out of Scope

- Stats page, leaderboard page, manager views, performance engine math, schema, RPC.
- Any new analytics events or persistence.
