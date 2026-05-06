## Expand the Server experience

Four additions to the server-side app, all UI/sample-data only (no backend).

### 1. Anonymous Leaderboard (new page + nav slot)

- New route `src/routes/server.leaderboard.tsx`, swap into bottom nav (replace "Rewards" or add as 5th — see Q1).
- Sample data in `sample-data.ts`: array of 8–10 servers with anonymous handles (`Server #07`, `Fox 22`, `Otter 14`…), weekly score, SPC, covers. Sarah is one of them, flagged `isYou: true`.
- Sections:
  - **Your rank card** — big "#3 of 9" with delta vs last week (↑2).
  - **Top 3 podium** — gold/silver/bronze tiles, anonymous handles only, scores visible.
  - **Full ranked list** — rows with rank, handle, score; the "you" row highlighted in Popp orange and pinned visible.
  - **Category leaderboards** — small tabs (Wine / Cocktails / Desserts) so they see where they rank per category.
- Privacy line at top: "Names are hidden. Only you see your handle."

### 2. AI Coaching with How-To's (upgrade `/server/menu`)

- Extend the existing AI tip card into a stack of **coaching cards**, one per weak category (driven by status from sample data).
- Each card includes:
  - Headline ("Wine is your biggest opportunity this week")
  - Why it matters ("You're selling 0.4 glasses/cover vs team avg 0.9")
  - **3 "Try saying…" scripts** — short suggestive-sell lines tailored to the category (e.g. wine: "Can I start you with a glass of Sancerre while you look at the menu?").
  - **Do / Don't** mini list.
  - "Mark as practiced" toggle (local state only).
- Add a compact coaching summary block on the home dashboard linking into this page.

### 3. Menu Pairing Integration

- Expand `menuItems` in `sample-data.ts` with: `pairing`, `pairingPitch`, `attachRate`, `marginTier`.
- New "Pairings" section on `/server/menu`: each main dish shows a paired drink/side card with the suggested pitch line and attach rate ("Servers who pair this lift cover by £6 avg").
- On Smart Recs (`/server/welcome`), add a "Pair it" badge on items that are pairings of today's specials.

### 4. Numbers-First Stats on Home + Progress

Replace percentage-only rings with **count + delta + percentage**.

- Update `sample-data.ts` weekly stats per category:
  ```
  { category, unitsSold, prevUnitsSold, deltaPct, attachRate, target }
  ```
- Home (`/server/index.tsx`):
  - Replace the "Top 3" rings with **stat tiles**:
    - Big number ("27"), unit ("wines sold this week"), delta chip ("↑12% vs last week"), thin progress bar to target.
  - Color rule: attach rate or target progress **< 60% → red (var(--opportunity))**, 60–80 → amber, ≥80 → green. Apply to tile background tint, delta chip, and bar.
  - Add a prominent **"This week's focus"** banner at top, auto-picked as the lowest-scoring category, with a CTA to the coaching card for it.
- Progress page (`/server/progress`): same stat tiles in a fuller grid + week-over-week sparkline per category.

### Shared changes

- `src/lib/sample-data.ts`: add leaderboard array, expanded category stats (units + previous), expanded menu pairings, coaching scripts per category.
- `src/components/status.tsx`: add `<StatTile />` (number, label, delta, threshold-driven color) and `<DeltaChip />`. Reuse on home, progress, and manager server detail.
- `src/components/server-layout.tsx`: add Leaderboard nav item (Trophy icon).
- No new dependencies. No backend, no Cloud, no real auth — sample data only, matching existing prototype scope.

### Open question

Q1. The bottom nav currently has 5 tabs (Home, Stats, Coaching, Rewards, Profile). For the leaderboard, do you want to **replace Rewards** (it's currently the Smart Recs page) with Leaderboard, or keep both and drop Profile from the bar (move Profile into a header avatar)?
