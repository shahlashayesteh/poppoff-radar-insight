## SEO & Technical Health Review — PoppOff

### What I found

**Performance**
- No real `<img>` tags on public pages — there's nothing to lazy-load or size, so CLS/LCP risk is low. The hero is text + CSS phone frames.
- Google Fonts loaded with `preconnect` + a single stylesheet request — already optimal.
- No third-party scripts in the root shell beyond Paddle (loaded via hook on demand). Good.
- One real perf opportunity: there is no `og:image` / hero image, which also means social shares look bare.

**Metadata quality** (per route)
- `/` ✅ title + description + og:title + og:description.
- `/contact` ✅ full set incl. og:title/description.
- `/privacy`, `/terms`, `/signup`, `/signin`, `/login`, `/join`, `/signup/manager` ⚠ title only, no description, no OG. `/signup` even lacks a description.
- All public routes are missing **canonical**, **og:url**, and **og:image**.
- Root sets `og:type: website` and `twitter:card: summary_large_image` — good, but no `twitter:title/description/image`, and no `og:site_name`.

**Heading structure**
- `/`, `/contact`, `/privacy`, `/terms` each have exactly one `<h1>` ✅.
- The home `<h1>` wraps "PoppOff makes server performance visible." — strong, keyword-rich.
- Sub-sections on `/` use styled `<div>`s in places where `<h2>` would help crawlers. Minor.

**Image alt text**
- No `<img>` tags exist on indexable pages, so there's nothing failing — but also no hero image to share. If/when one is added, alt text rules need to be applied.

**Canonical tags**
- ❌ None defined anywhere. With both `poppoffstats.com` and `www.poppoffstats.com` resolving plus the `lovable.app` preview/published URLs, this risks duplicate-content dilution.

**Open Graph**
- Root: og:type, twitter:card only.
- `/` and `/contact`: og:title + og:description.
- ❌ Missing across the board: `og:url`, `og:image`, `og:site_name`, `twitter:title`, `twitter:description`, `twitter:image`.

**Robots**
- ❌ No `public/robots.txt`. Crawlers fall back to "allow all" but won't be pointed at a sitemap, and there's no way to keep `/manager/*`, `/server/*`, `/settings`, `/checkout/*`, `/join`, `/login`, `/signin`, `/signup*` out of the index. These currently render placeholder/auth UI to logged-out crawlers.

**Sitemap**
- ❌ No `public/sitemap.xml` and no `src/routes/sitemap[.]xml.ts`. Search Console has nothing to consume.

**Navigation note**
- Header nav on `/` uses `<a href="#product">`, `<a href="#how">`, `<a href="#pricing">`, `<a href="#about">` — these are in-page anchors on a single landing page, which is fine. They are NOT separate routes today, so no extra routes are needed unless you want each section indexed independently.

---

### Plan: targeted fixes

**1. Add `public/robots.txt`**
```
User-agent: *
Allow: /
Disallow: /manager
Disallow: /server
Disallow: /settings
Disallow: /checkout
Disallow: /join
Disallow: /signin
Disallow: /signup
Disallow: /login
Disallow: /demo
Disallow: /lovable

Sitemap: https://poppoffstats.com/sitemap.xml
```

**2. Add dynamic sitemap at `src/routes/sitemap[.]xml.ts`**
Entries: `/`, `/contact`, `/privacy`, `/terms`. Base URL `https://poppoffstats.com`. Cache 1h.

**3. Per-route metadata upgrade**
For each public route (`/`, `/contact`, `/privacy`, `/terms`), add to `head().meta`:
- `og:url` → absolute https://poppoffstats.com URL
- `twitter:title`, `twitter:description` mirroring og values

And to `head().links`:
- `{ rel: "canonical", href: "https://poppoffstats.com<path>" }` (leaf only — root must NOT set canonical, per the dedupe caveat in our knowledge files).

For `/privacy` and `/terms`, also add a real `description` and `og:title`/`og:description`.

**4. Root shell additions (`src/routes/__root.tsx`)**
- Add `og:site_name: "PoppOff"`.
- Keep `og:type: website` at root; leaf routes can override (none need to today).
- Add a sitewide JSON-LD `Organization` block with name + URL.
- Do NOT add canonical at root.

**5. Decide on og:image (asks user)**
A placeholder OG image is worse than none, so I'll ask whether to generate a branded 1200×630 share image (PoppOff logo + tagline on brand-green/orange) and wire it into root + leaf `og:image` / `twitter:image`. If you say no, I'll leave og:image off.

**6. Minor heading polish (optional)**
Promote the section labels on `/` ("How it works", "Pricing", "Product") from styled `<div>`s to `<h2>`s where they aren't already. Cosmetically identical, better for crawlers.

### Out of scope
- No design changes, no copy rewrites beyond meta descriptions for `/privacy` and `/terms`.
- No changes to auth, dashboards, demo routes, or Cloud schema.
- No new image assets unless you approve the OG image in step 5.

### Technical notes
- Sitemap uses the `/sitemap[.]xml.ts` server-route pattern (TanStack Start), not a static file, so it stays in sync.
- Canonicals are leaf-only because TanStack Router concatenates `links` without dedup.
- All meta updates are pure additions to existing `head()` blocks — no refactors.
