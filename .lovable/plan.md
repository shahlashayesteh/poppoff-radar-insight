## Goal
On the landing page header, replace the "Login" text link with nothing — leaving a single "Book a Demo" button as the only CTA in that header group.

## File to change
- `src/routes/index.tsx` (line 44) — remove the `<Link to="/login">Login</Link>` element. The adjacent "Book a Demo" button on line 45 stays exactly as it is.

## Out of scope
- No other links, buttons, styles, or routes change.
- The secondary header further down (line 221) already only shows "Book a Demo" — untouched.
- No new routes, no auth changes.

Note: `src/routes/index.tsx` was on your earlier protected list. This plan requires editing it. Approving this plan authorizes that one edit.