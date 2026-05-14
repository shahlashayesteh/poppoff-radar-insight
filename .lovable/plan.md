
# AI/SEO Visibility Expansion — Approved Plan

Additive only. All existing root metadata, og:image, sitemap entries, robots.txt blocks, llms.txt, Organization + WebSite JSON-LD, canonicals, and page metadata are preserved byte-for-byte. No changes to existing visuals, copy, layout, flows, or functionality.

## 1. Live verification meta tags

Edit `src/routes/__root.tsx` — append two entries to the existing `head().meta` array. No reordering, no removals.

```ts
{ name: "google-site-verification", content: "kjmYUsmYS04cI_cW3dhNqwH7bRDklUeE3mykdOpLcc4" },
{ name: "msvalidate.01", content: "0DF4DCBD32F9E898166EC9481187CCD" },
```

After deploy: run the Search Console verification + site-add API calls via the Google connector. Bing requires user-side confirmation in Bing Webmaster Tools.

## 2. Homepage FAQPage + WebPage + Breadcrumb JSON-LD

Edit `src/routes/index.tsx` — append entries to the existing `head().scripts` array. No visual or copy changes to the page itself.

FAQ Q&A pairs (manager-intent terms woven in naturally; framing strictly around **visibility, coaching consistency, performance management, and operational clarity** — never surveillance or punitive language):

- *What is restaurant server performance software?* — Defines the category; mentions "server performance tracking" and "restaurant staff performance management" once.
- *How does PoppOff work?* — POS data → per-server scorecards → weekly coaching priorities; mirrors the existing homepage 5-step flow.
- *Can restaurant servers see their own performance?* — Yes; personal scorecards give servers visibility into their own numbers.
- *Does PoppOff use POS sales data?* — Yes; describes the data flow factually with no integration name-drops.
- *How does PoppOff help restaurants improve sales?* — Coaching priorities + menu-mix visibility; mentions "restaurant coaching" naturally.
- *How can managers keep restaurant teams accountable?* — Framed as shared visibility, consistent coaching, and operational clarity built on the same numbers — not monitoring. Uses "restaurant employee accountability" once in a constructive context.

Plus `WebPage` (referencing the existing root WebSite `@id`) and `BreadcrumbList` (Home).

## 3. Five SEO landing pages

Each route reuses the existing homepage header, footer, `Logo`, phone-frame mockup CSS, and brand tokens. No new visual style, no invented stats, no fabricated integrations or customer claims. Copy is reframed from existing PoppOff homepage messaging.

```
src/routes/restaurant-server-performance-software.tsx
src/routes/restaurant-sales-coaching-software.tsx
src/routes/hospitality-performance-software.tsx
src/routes/restaurant-leaderboard-software.tsx
src/routes/restaurant-upselling-software.tsx
```

Per page:
- Unique H1 targeting the keyword
- Hero subhead reusing existing PoppOff positioning
- 3–5 sections built from existing homepage feature copy (More Money, Build Streaks, Smart Coaching, etc.), reframed for the keyword
- Manager-intent terms woven in where the angle fits — always framed around visibility, coaching consistency, and operational clarity (leaderboard page = shared scoreboard, not ranking-as-punishment; performance-software page = consistent management cadence)
- Existing CTAs only: "See Demo" → `/login`, "Start Your Pilot" → `/login`, "Contact" → `/contact`

Per-page `head()`:
- Unique `title`, `description`, `og:title`, `og:description`, `og:url`, `twitter:title`, `twitter:description`
- Unique `<link rel="canonical">` to its own absolute URL on `https://poppoffstats.com`
- Reuses existing `/og-image.jpg`
- JSON-LD: `WebPage` + `BreadcrumbList` (Home → Page)

## 4. Two public demo overview pages

```
src/routes/demo.manager-dashboard.tsx     → /demo/manager-dashboard
src/routes/demo.server-scorecard.tsx      → /demo/server-scorecard
```

Static, public, SSR-friendly. Existing `/demo.manager.*` and `/demo.server.*` interactive routes are untouched. New pages contain:

- Same header/footer as homepage
- H1 + intro paragraph
- 3–4 "Inside the demo" blocks using existing phone-frame visuals (re-rendered statically) covering scorecards, leaderboards, coaching insights, menu pairing suggestions
- CTA row: "See the live demo" → `/login`, "Talk to us" → `/contact`
- Unique metadata + canonical + `WebPage` + `BreadcrumbList` JSON-LD

## 5. Breadcrumb + WebPage JSON-LD on existing public pages

Additive only — append to existing `head().scripts`. No edits to existing meta, links, or page bodies:
- `src/routes/contact.tsx` — append `BreadcrumbList` (existing ContactPage JSON-LD preserved)
- `src/routes/privacy.tsx` — append `WebPage` + `BreadcrumbList`
- `src/routes/terms.tsx` — append `WebPage` + `BreadcrumbList`

## 6. Sitemap + robots.txt + llms.txt extensions

**`src/routes/sitemap[.]xml.ts`** — existing 4 entries preserved verbatim; append 5 landing pages (priority 0.7, monthly) + 2 demo overview pages (priority 0.6, monthly).

**`public/robots.txt`** — existing blocks and `Sitemap:` directive preserved. The current `Disallow: /demo` would block the new public overview pages, so in every existing user-agent block swap that single line for two precise rules:
- `Disallow: /demo.manager`
- `Disallow: /demo.server`

This keeps the existing interactive demo routes blocked while allowing only `/demo/manager-dashboard` and `/demo/server-scorecard`.

**`public/llms.txt`** — existing entries preserved; append the 7 new pages under `## Pages` in the same voice.

## 7. Search Console + Bing readiness

- Verification meta tags wired live (see §1)
- After deploy: run the Google Site Verification `webResource` POST + `sites` PUT via the connector for `https://poppoffstats.com/`
- Bing: user confirms in Bing Webmaster Tools once the meta tag is live (no Lovable connector for Bing)

## Out of scope

Existing homepage, contact, privacy, terms, demo, manager, server route bodies. Any existing meta, og, twitter, JSON-LD, canonical, sitemap entry, robots block, or llms entry. Auth, checkout, Paddle, Supabase logic. New OG images. New visual components or styles. Blog/article content.

## Files touched

**Created (7):**
- `src/routes/restaurant-server-performance-software.tsx`
- `src/routes/restaurant-sales-coaching-software.tsx`
- `src/routes/hospitality-performance-software.tsx`
- `src/routes/restaurant-leaderboard-software.tsx`
- `src/routes/restaurant-upselling-software.tsx`
- `src/routes/demo.manager-dashboard.tsx`
- `src/routes/demo.server-scorecard.tsx`

**Edited (additive only):**
- `src/routes/__root.tsx` — append 2 verification meta tags
- `src/routes/index.tsx` — append FAQPage + WebPage + Breadcrumb JSON-LD
- `src/routes/contact.tsx` — append Breadcrumb JSON-LD
- `src/routes/privacy.tsx` — append WebPage + Breadcrumb JSON-LD
- `src/routes/terms.tsx` — append WebPage + Breadcrumb JSON-LD
- `src/routes/sitemap[.]xml.ts` — append 7 entries
- `public/robots.txt` — replace `/demo` with `/demo.manager` + `/demo.server` in each block
- `public/llms.txt` — append 7 page entries

## Verification

- View source on `/` shows existing root JSON-LD intact + new FAQPage/WebPage/Breadcrumb blocks
- `curl /sitemap.xml` shows the original 4 entries first, then 7 appended
- `curl /robots.txt` allows `/demo/manager-dashboard` and disallows `/demo/manager/index`
- `curl -I /restaurant-leaderboard-software` returns 200 with unique title + canonical
- Google Rich Results Test passes on `/` (Org + WebSite + FAQ + WebPage + Breadcrumb)
- Run Google Search Console verify + add-site API for `https://poppoffstats.com/` after deploy
