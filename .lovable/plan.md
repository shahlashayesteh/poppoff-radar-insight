## Goal
Enable Paddle payments for Popp Off and wire up the three subscription tiers (£49, £99, £199 / venue / month) shown on the landing page so restaurants can subscribe.

## Steps

1. **Enable Paddle** on the project (creates a test/sandbox environment immediately; live payments require Paddle verification later).

2. **Create the 3 subscription products** in Paddle matching the landing page pricing:
   - Server Starter — £49/month per venue
   - Pro — £99/month per venue
   - Enterprise — £199/month per venue

3. **Wire checkout buttons** on the landing page (`/`) pricing section so each "Get started" CTA opens a Paddle checkout for the matching plan.

4. **Add a success page** (`/checkout/success`) shown after payment completes.

5. **Add a webhook handler** (`/api/public/webhooks/paddle`) to record subscription status in the backend so we know who's a paying customer.

6. **Add a minimal subscription record** in Lovable Cloud (one table: `subscriptions` with customer email, plan, status) — used by the webhook and viewable later for a billing screen.

## Out of scope (for this step)
- Gating manager/server dashboards behind subscription status (can come next).
- Billing portal / cancel flow inside the app (Paddle hosts this for now).
- Going live — that needs Paddle account verification done by you after testing.

## Technical notes
- Uses Lovable's built-in Paddle integration (no Paddle account needed to start in test mode).
- Checkout uses Paddle.js overlay on the landing page — no redirect.
- Webhook signature is verified inside the handler before any DB write.
