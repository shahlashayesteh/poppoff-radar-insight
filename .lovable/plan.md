## Change

Update the "I'm a Manager" card on `src/routes/signup.tsx` so it links to the homepage pricing section instead of `/signup/manager`.

### Edit
- File: `src/routes/signup.tsx`
- Replace the `<Link to="/signup/manager" ...>` wrapping the Manager card with a plain `<a href="/#pricing" ...>` using the **exact same className and inner content**. No style, layout, copy, icon, or hover changes.
- Using a normal `<a>` (not TanStack `<Link>`) ensures the browser navigates to `/` and resolves the `#pricing` hash, scrolling to `<section id="pricing">` already present in `src/routes/index.tsx` (line 337).

### Smooth scroll
Confirm `html { scroll-behavior: smooth; }` exists in `src/styles.css`. If missing, add only that single rule globally so the hash jump animates on desktop and mobile. No other CSS changes.

### Out of scope
Server card, header, footer, spacing, typography, colors, animations, responsive behavior, and every other route.

### Verification
- `/signup` renders unchanged visually.
- Clicking "I'm a Manager" navigates to `/#pricing` and smooth-scrolls to the Pricing section.
- Clicking "I'm a Server" still goes to `/join`.