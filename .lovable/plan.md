## Change

In `src/routes/index.tsx` (line 165), replace the hero "Start Your Pilot" `<Link to="/login">` with a plain `<a href="#pricing">`, keeping the exact same className and inner content. No style, layout, or copy changes.

Smooth scrolling is already enabled globally via `html { scroll-behavior: smooth; }` in `src/styles.css`, and `<section id="pricing">` already exists on the homepage — so the anchor will smooth-scroll on both desktop and mobile.

### Out of scope
- The "See Demo" button next to it stays unchanged.
- The "Start Your Pilot" buttons on the other landing pages (hospitality-performance, sales-coaching, leaderboard, upselling, server-performance) are not touched — the request was specifically about the homepage.
- No changes to header, footer, SEO, routing, animations, responsive behavior, or any other element.

### Verification
- Homepage renders visually identical.
- Clicking "Start Your Pilot" stays on `/` and smooth-scrolls to the Pricing section.
- "See Demo" still goes to `/login`.
