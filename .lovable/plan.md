## Goal
In `src/routes/index.tsx` only:
1. Stop the demo buttons from redirecting to `/login`. Make them scroll to an in-page `#demo` section.
2. Rename the button label from "Book a Demo" to "See Demo" everywhere it appears.

## Changes (only `src/routes/index.tsx`)

1. **Replace the three "Book a Demo" buttons** with `<a href="#demo">See Demo</a>`, keeping all existing classes/styles intact:
   - Header nav (~line 43)
   - Hero CTA (~line 65)
   - Mobile/sticky nav (~line 219)

2. **Add a `#demo` section** above the footer: a dark CTA band with heading "See PoppOff in action", a short subtitle, and one "Book a 20-minute demo" link to `/login` so the booking destination is still reachable after the user scrolls.

## Untouched
Hero copy, "How it works", phone mockups, pricing tiles, animations, scroll behavior, footer, "Start Your Pilot" button, header "Login" link, and every other file in the project.

## Verification
- Click each "See Demo" button on `/` → smooth-scrolls to the `#demo` section, no navigation.
- All other links/buttons behave exactly as they do now.
