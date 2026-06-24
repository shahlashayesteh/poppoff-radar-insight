## Root cause found

Paddle itself is connected: test and live products/prices exist, live go-live checks are completed, and webhooks are registered.

The failure is coming from the checkout transaction state, not from missing catalog or approval:

- The newest test checkout attempts are creating Paddle transactions successfully.
- Those transactions remain in `draft` with no payment attempts.
- For the current Pro plan, the test price has **no 30-day trial period**, while live does have the trial.
- The app is opening checkout without a strong `customer.email`/`customData` path when started from the pricing page for unauthenticated users.
- The current pre-check proves token + price resolution, but it does not prove Paddle can actually create a valid checkout session with the same customer/price/trial requirements.

## Recommended fix before switching provider

Keep Paddle for now and make the checkout flow deterministic:

1. **Restore trial parity in Paddle catalog**
   - Update the test Pro price to include the same 30-day card-required trial as live.
   - Confirm Starter and Pro both resolve in test and live.

2. **Move checkout creation to a server-backed Paddle preflight**
   - Add a server function that uses the resolved price and customer email to create/preview a real Paddle transaction before opening the overlay.
   - Return a clear app error if Paddle rejects the price/customer/domain before the user sees Paddle’s generic “Something went wrong”.

3. **Tighten pricing-to-signup flow**
   - Pricing button should only route to signup after price + environment are confirmed.
   - Signup should open checkout only after account, role claim, notification email, and customer email are present.
   - Pass consistent `customData`: `userId`, `role: manager`, selected plan.

4. **Add visible diagnostics only when checkout fails**
   - Show a clear support message with the specific failure reason.
   - Keep customer-facing checkout UI clean when it works.

5. **Validate end to end**
   - Test `/#pricing` → Starter free trial → manager signup → Paddle overlay opens.
   - Test `/#pricing` → Pro → manager signup → Paddle overlay opens.
   - Confirm Paddle transaction has customer/customData and is no longer stuck before payment.
   - Confirm webhook route remains registered and live approval remains complete.

## Stripe fallback, if Paddle still fails after this

Do not switch immediately. Switching to built-in Stripe means:

- Recreate products/prices under Stripe.
- Replace Paddle SDK/open-checkout code.
- Replace Paddle webhook processing with Stripe payment events.
- Existing Paddle subscriptions/customers do not migrate automatically.

If the Paddle fix above still fails after validation, I’ll propose a separate Stripe migration plan and only proceed after you approve the provider switch.