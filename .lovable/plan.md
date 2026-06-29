## Approach

Keep `hello@poppoffstats.com` visible as the public-facing address, but stop using `mailto:` links that send users to a mailbox that doesn't exist. Replace every `mailto:hello@poppoffstats.com` with a link to the existing `/contact` page — that form already routes submissions server-side to `sholoola@yahoo.com` (your real inbox), and the visitor never sees your personal address.

## Changes

- `src/routes/contact.tsx` — drop the "Prefer email? Write to hello@…" line (the form on this page already does the job).
- `src/routes/terms.tsx` — "Questions? Email hello@…" → "Questions? [Contact us](/contact)." Keep the address shown but not as a mailto.
- `src/routes/privacy.tsx` — both references: keep `hello@poppoffstats.com` shown as plain text, replace the mailto with a "via our [contact form](/contact)" link for data requests and questions.
- `src/components/manager-layout.tsx` — two sidebar "Support" links: change `mailto:hello@…` to a `<Link to="/contact">` (label stays "Support" / shows hello@ as caption text only).
- `public/llms.txt` — leave the visible address but rephrase the line so it points crawlers/agents to the contact page.

## Out of scope

Setting up real inbound mail at `hello@poppoffstats.com` (would require MX/forwarding at your DNS host — say the word and I'll write up that path separately). Outgoing notification recipient stays `sholoola@yahoo.com` and is never exposed in the UI.
