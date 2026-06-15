# Tool 2 — surface how it works

The calculation already runs end-to-end (matching → opportunity inference → ranking → recoverable revenue). The page just doesn't tell users that before they upload, so it looks like "nothing happens." This plan adds the explanation, mirrors the LLS page's framing for opportunity, and improves the empty state. **No calculation logic changes. No new files. Still 100% client-side.**

## 1. New collapsible "How this works" panel

Insert directly **above the Upload cards** in `src/routes/calculator.server-gap.tsx` (after the Currency selector, before the `grid md:grid-cols-2` upload block). Built with the existing shadcn `Accordion` primitive — no new dependencies.

Four sections, in this order:

**1. What you upload (and why two files)**
- Sales export: per-server, per-shift sales rows (server, date, net or gross sales; optionally shift start/end).
- Labour export: per-server shift rows (server, date, shift start, shift end or hours).
- Two files because almost no POS exports both together. Download buttons for both templates live in each Upload card below.

**2. How the two files are matched**
- Join key: server identity (ID preferred, name fallback, case/punctuation-normalised) + shift date.
- Multiple shifts in a day:
  - Sales row has a start time → pair with the overlapping labour shift.
  - No start time + exactly one labour shift that day → auto-match.
  - No start time + multiple labour shifts → flagged **Ambiguous** and **excluded** from the calculation (never guessed).
- Unmatched rows on either side are reported in the warnings list.

**3. How shift opportunity is determined (you don't upload it)**
Mirror the LLS framing from `src/routes/manager.lls.tsx` and the bands in `src/lib/server-gap/opportunity.ts`:
> Opportunity is inferred from the **actual start and end times** of each labour shift. Daypart labels in your file are never used for calculation.
>
> Each hour of the shift is scored against a day-of-week × hour grid, then averaged across the shift to produce one **Opportunity Factor**:
> - **Low** 0.75–0.90 — off-peak hours
> - **Normal** 0.95–1.05 — average trading hours
> - **Strong** 1.10–1.25 — busy lunch/dinner windows
> - **Peak** 1.30–1.40 — Fri/Sat dinner-style windows
>
> Adjusted hours = hours × factor. A server who worked Friday dinner is held to a higher bar than a server who worked Tuesday lunch.

(Same band labels and numeric ranges as the LLS reference page, so the two tools speak the same language.)

**4. What you'll see after both files are uploaded**
A numbered list previewing the sections that render below:
1. **Confidence score** (High / Medium / Low) + any warnings (unmatched rows, ambiguous shifts, missing start times).
2. **Ranking table** — every server ordered by opportunity-adjusted revenue per hour vs the team weighted benchmark.
3. **Top vs bottom gap** — the £/$ difference per adjusted hour between your best and weakest performer.
4. **Recoverable revenue** — what lifting the bottom half toward the benchmark would project weekly / monthly / annually.

Closing line inside the panel: *"All of this is computed in your browser. No row of your data leaves this page."*

Default state: **closed**. Header label: **"How this works — matching, opportunity, results."**

## 2. Better pre-upload empty state

Replace the single-line "Upload both files to see results" (line ~403) with a short card that says: "Upload both exports above. You'll then see a confidence score, server ranking, top-vs-bottom gap, and projected recoverable revenue — without any data leaving your browser." This makes the post-upload flow visible before the user commits.

## 3. Files touched
- `src/routes/calculator.server-gap.tsx` — add Accordion import, insert the panel, replace empty-state copy.

That's the whole change. No edits to `src/lib/server-gap/*`, no edits to Tool 1, no protected files, no routing changes.
