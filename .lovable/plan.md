# Fix: Paddle sandbox checkout declining test cards on preview

## What I verified

- Preview is correctly in **sandbox** mode: orange test banner shows, client token starts with `test_`, `Paddle.Environment.set("sandbox")` is being called.
- Sandbox catalog is healthy: 3 active products + 3 active prices (`poppoff_starter_monthly` £49, `poppoff_pro_monthly` £99 with 30‑day trial, `poppoff_enterprise_monthly` £199).
- Sandbox webhooks are registered and active.
- Sandbox transaction list is **empty** — meaning the checkout is failing **before** a transaction is even created. That rules out our webhook/back-end code; the rejection is happening inside Paddle's checkout iframe itself.

So the message "We are unable to take payment at this time" is coming from Paddle's sandbox account, not from our app. This is a known Paddle sandbox-account-config issue, not a code bug.

## Likely root causes (in order)

1. **Sandbox account "Checkout settings" missing a default payment method / country.** A new Paddle sandbox seller must enable cards under *Checkout settings → Payment methods* and set at least one supported billing country. Until that's done, every card (including 4242) is declined with exactly this generic message.
2. **Browser / extension blocking Paddle's risk scripts** (ad blockers, strict tracking protection, Brave shields). Paddle's anti-fraud check fails closed and shows the same generic decline.
3. **Card number entered with spaces / wrong test card.** Only the official Paddle sandbox test cards work — `4242 4242 4242 4242` is correct, but `4111…` (Stripe's test card) is not.
4. **Trial price + zero-auth issue.** `poppoff_pro_monthly` has a 30-day trial with `requires_payment_method: true`; if the sandbox seller hasn't enabled "card on file" auth, the £0 auth charge fails.

## Plan

### Step 1 — Confirm it's a Paddle account-side issue (no code changes)

Have you try the exact same flow in an **incognito window with no extensions**, and paste the card with **no spaces**: `4242424242424242`, any future expiry, CVC `100`, ZIP `10000`, name `Test`. If it still says "unable to take payment", we've confirmed it's the sandbox seller config (cause #1).

### Step 2 — Add a checkout error listener so we can read Paddle's real reason

Right now `Paddle.Checkout.open()` is called with no event callbacks, so we only see the generic UI message. I'll wire `eventCallback` into `initializePaddle()` and log every `checkout.*` event (especially `checkout.error` and `checkout.payment.failed`) to the browser console with the underlying Paddle error code. That gives us the actual reason instead of the polite UI string.

Files touched:
- `src/lib/paddle.ts` — add `eventCallback` to `Paddle.Initialize({ ... })`
- `src/hooks/usePaddleCheckout.ts` — surface the error to the caller (toast)

### Step 3 — Pre-flight checkout config

Add a one-time guard in `usePaddleCheckout` that:
- logs the resolved Paddle price ID + currency before opening checkout, so we can confirm the preview is hitting the sandbox price (`pri_…`) and not a stale/cached live ID.
- defaults `customer.address.countryCode` to `GB` (matches GBP pricing) — Paddle sandbox often refuses cards when address country is unset for GBP prices.

### Step 4 — If Step 2 logs reveal a `seller_settings_*` or `payment_method_unavailable` code

That confirms the sandbox account itself needs configuring. I'll point you to the exact toggle in the Paddle sandbox dashboard (it's outside our code), and the fix is one click — no app change needed.

### Step 5 — Re-test

Open `/` in incognito → click "Start Free Trial" on Starter (no trial, simplest path) → enter `4242424242424242` / `12/29` / `100` / country `GB` / postcode `SW1A 1AA`. Expected: checkout completes, `transaction.completed` webhook fires, `/manager` shows the join code.

## Out of scope

- No changes to live checkout, Paddle live token, or `.env.production`.
- No changes to landing-page design, copy, colours, or pricing tiles.
- No changes to the role/auth/join-code system already built.

## Technical details

- `src/lib/paddle.ts` — extend the `Paddle.Initialize` call:
  ```ts
  window.Paddle.Initialize({
    token: clientToken,
    eventCallback: (e) => {
      if (e.name?.startsWith("checkout.")) console.log("[paddle]", e.name, e.data);
    },
  });
  ```
- `src/hooks/usePaddleCheckout.ts` — also pass `customer.address: { countryCode: "GB" }` when no address is supplied; show a toast on `checkout.error`.

That's it. The most likely fix is Paddle sandbox account config (Step 1/4); the code changes in Steps 2–3 just make the failure observable so we stop guessing.
