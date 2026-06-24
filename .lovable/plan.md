# Migrate from Paddle to Stripe

Paddle checkout has repeatedly failed end-to-end despite trial parity fixes and pre-checks. Switching to Lovable's built-in (seamless) Stripe integration — no API keys to manage, same managed webhook/subscription flow as Paddle.

## Step 1 — You disconnect Paddle (manual, ~1 min)

Stripe and Paddle can't both be active. From the payments dashboard, open the three-dots menu in the top-right and choose **Disconnect Paddle**.

<presentation-actions><presentation-open-payments>Open payments dashboard</presentation-open-payments></presentation-actions>

Tell me once it's disconnected and I'll continue with everything below.

## Step 2 — Enable Stripe (seamless)

I'll run `enable_stripe_payments`. No account signup, no secret keys, no webhook URLs to paste. Lovable manages the Stripe account, keys, and webhook endpoint.

## Step 3 — Recreate the catalog

Existing Paddle products/prices do NOT migrate. I'll recreate them in Stripe test with the same IDs your code already uses, so the checkout call sites barely change:

- `starter_plan` → `starter_monthly` ($X/mo, 30-day trial)
- `pro_plan` → `pro_monthly` ($Y/mo, 30-day trial)

Recurring intervals, trial days, and `quantity_min=1, quantity_max=1` will match the current Paddle setup. When you publish, Lovable auto-syncs the catalog to live Stripe.

## Step 4 — Replace Paddle code with Stripe

Files to remove or rewrite:
- `src/lib/paddle.ts`, `src/lib/paddle.server.ts` → delete
- `src/hooks/usePaddleCheckout.ts` → replace with `useStripeCheckout`
- `src/utils/payments.functions.ts` → rewrite for Stripe price resolution
- `src/routes/api/public/*` Paddle webhook → replaced by Lovable-managed Stripe webhook
- `src/routes/checkout.retry.tsx`, `src/routes/signup.manager.tsx`, `src/routes/index.tsx` (pricing CTA) → swap `openCheckout` to Stripe hook
- `PaymentTestModeBanner` → keep (same pattern works for Stripe test mode)

## Step 5 — Subscriptions table

Existing `subscriptions` schema stays — same columns work for Stripe (`environment`, `price_id`, `product_id`, `current_period_end`, status, etc.). The managed Stripe webhook writes into it the same way Paddle did. Old Paddle rows in the table are stale; I'll leave them (no live subscribers) or clear them — your call.

## Step 6 — End-to-end test

1. `/#pricing` → Get Started → manager signup → Stripe Checkout opens
2. Pay with test card `4242 4242 4242 4242`
3. Confirm `subscriptions` row inserted with `environment='sandbox'`, correct `price_id`, active status
4. Confirm dashboard gating works via `useSubscription`

## Technical notes

- Lovable's seamless Stripe uses Stripe Checkout (hosted page), not the Paddle-style overlay. Same UX pattern: button click → redirect → `successUrl` back to app.
- `customData` equivalent in Stripe is `metadata` on the Checkout Session — I'll pass `userId` and `role` the same way.
- Going live: same one-click flow as Paddle. No re-verification needed beyond Stripe's standard onboarding (handled by Lovable).

## Risk

- Any in-flight Paddle test transactions are abandoned (none are real money).
- If you already had **live** paying customers on Paddle, they'd need to re-subscribe on Stripe. Based on the dashboard you don't, so this is clean.

Reply **go** after you've disconnected Paddle and I'll execute Steps 2–6 in one pass.
