## What's actually happening

The "Something went wrong / Please try again later / Contact support" notification you're seeing is **Paddle's own overlay error**, not a Lovable toast. Our code says specific things like "Couldn't open checkout" — Paddle says "Something went wrong, contact support." That distinction matters because it tells us:

- Our code is reaching `Paddle.Checkout.open()` successfully.
- Paddle.js itself is rejecting the checkout once the overlay opens.

I verified from the Paddle API:
- Price `poppoff_pro_monthly` → `pri_01kr1gpqeb8ha7kfhg0jm6m514`, status `active`, £199 GBP. ✅
- Price `poppoff_starter_monthly` exists and is active. ✅
- Sandbox webhook is registered to the dev URL. ✅
- Client tokens are present in both `.env.development` and `.env.production`. ✅

The remaining failure modes that produce Paddle's generic "contact support" screen are almost all **environment/account configuration** issues, not code:

1. **Approved domains missing** — Paddle blocks `Checkout.open()` from any origin that isn't on the sandbox account's approved domains list. The current preview origin (`id-preview--…lovable.app`) and the published origin (`poppoffstats.com`, `www.poppoffstats.com`, `poppoff-radar-insight.lovable.app`) all need to be there.
2. **Default payment link unset** in Paddle Checkout settings.
3. **Sandbox client token revoked / from a different seller account** than the one holding the prices.

None of those can be fixed from code — they're toggles in the Paddle sandbox dashboard. But what we *can* do is stop hiding the failure: today we just `console.error` and fire a generic toast, so you have no idea which of the four things failed.

## Scoped code change (pre-check)

Add a single `precheckPaddle(priceId)` helper that runs before any `Paddle.Checkout.open()` call and turns each failure into a specific, actionable toast + console line.

Steps it runs, in order:

1. `clientToken` is present and starts with `test_` or `live_` → otherwise toast: "Payments not configured (missing client token)."
2. `initializePaddle()` resolves and `window.Paddle.Checkout` exists → otherwise toast: "Couldn't load Paddle. Check network / ad-blocker."
3. `resolvePaddlePrice({ priceId, environment })` returns a `pri_…` ID → otherwise toast: `Price not found in {env}: {priceId}`.
4. Returns `{ paddlePriceId, environment }` for the caller to pass to `Checkout.open()`.

Wire the pre-check into the two real entry points:

- `src/routes/index.tsx` → `handlePlanClick` (Pricing → Get Started / Start Free Trial). Run pre-check before either the signed-in `openCheckout` call or the navigate-to-signup branch, so we fail fast with a real reason instead of bouncing the user into a signup form for a broken flow.
- `src/routes/signup.manager.tsx` → before the post-signup auto-`openCheckout`. Same pre-check.

Also tighten `src/hooks/usePaddleCheckout.ts` so the `try/catch` actually catches `Paddle.Checkout.open()` errors (today it's fire-and-forget — Paddle's overlay errors never reach our catch). Wrap the `Paddle.Checkout.open` call and surface any synchronous throw.

Add `console.info` lines tagged `[paddle]` at each step (env, token prefix, resolved price ID, origin) so the next time it fails you can read exactly which gate tripped.

## What you almost certainly need to do in Paddle

Even with the pre-check, if the failure is "approved domains," only you can fix it. In the Paddle **sandbox** dashboard:

- Checkout settings → **Default payment link**: set to `https://poppoffstats.com/checkout/success` (or your preferred URL).
- Checkout settings → **Approved domains**: add
  - `poppoffstats.com`
  - `www.poppoffstats.com`
  - `poppoff-radar-insight.lovable.app`
  - `id-preview--af1ebe93-3732-42dc-b865-a7e858845056.lovable.app`
  - `project--af1ebe93-3732-42dc-b865-a7e858845056-dev.lovable.app`
- Repeat the same for the **live** account before going live.

After the code change ships, click Get Started once more — the toast will now name the exact gate that's failing, and we can act on it.

## Files changed

- `src/lib/paddle.ts` — add `precheckPaddle(priceId)` exported helper; keep existing `initializePaddle` / `getPaddlePriceId`.
- `src/hooks/usePaddleCheckout.ts` — call pre-check, catch overlay errors, return `{ ok, error }`.
- `src/routes/index.tsx` — `handlePlanClick` uses pre-check; specific toasts.
- `src/routes/signup.manager.tsx` — pre-check before post-signup `openCheckout`.

## Out of scope

- No changes to webhook handler, server functions, subscriptions table, or Paddle catalog.
- No changes to auth/tenant/upload logic.
- No demo data touched.
