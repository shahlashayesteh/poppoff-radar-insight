## Goal

New subscribers enter card details at checkout but are not charged until day 30. After the trial, Stripe automatically bills the saved card on the chosen plan interval.

## Changes

### 1. `src/utils/payments.functions.ts` — `createCheckoutSession`
For recurring prices only, add a 30-day trial to the session:

```ts
subscription_data: {
  trial_period_days: 30,
  trial_settings: {
    end_behavior: { missing_payment_method: "cancel" },
  },
  ...(data.userId && { metadata: { userId: data.userId } }),
},
payment_method_collection: "always", // force card capture during trial
```

Notes:
- `payment_method_collection: "always"` ensures the card is collected up front so Stripe can charge automatically when the trial ends.
- `trial_settings.end_behavior.missing_payment_method: "cancel"` is a safety net (cancels if no card on file for any reason).
- One-time (`mode: "payment"`) prices are untouched.
- Existing `subscription_data.metadata` merge preserved.

### 2. Status handling — already compatible
`src/lib/entitlements.ts` already maps Stripe's `trialing` status to `"trialing"` and `canAccessPaidManagerFeatures` already grants access during trial. No change needed.

The webhook (`src/routes/api/public/payments/webhook.ts`) already upserts whatever status Stripe sends (`trialing` → `active` after conversion), so no change needed.

### 3. UI copy (light touch)
Update the pay button / pricing surfaces that mention "Complete payment" to reflect the trial. Minimal scope:
- `src/routes/checkout.retry.tsx` — button label "Start 30‑day free trial" and helper text "No charge today. Card required; we'll bill after 30 days. Cancel anytime."

Other pricing/CTA pages can be updated in a follow-up if you want — flag if you'd like them included now.

## Out of scope
- Trial length variation per plan (single 30-day trial for all recurring plans).
- Trial-eligibility checks (Stripe will give a trial to any new subscription created through this endpoint; if you want to prevent repeat trials per customer, that's a follow-up using `trial_period_days` only when the customer has no prior subs).
