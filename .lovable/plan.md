# Fix: Manager dashboard shows "No venue yet" after a successful checkout

## What's actually happening

Your backend is fine. After your last checkout, the database already contains:

- `venues`: `ivy` with join code `484194`, owned by your user
- `user_roles`: `manager` for your user
- `subscriptions`: `trialing`, sandbox env

So the Paddle webhook fired and `handleSubscriptionCreated` correctly created the venue + role.

The UI bug is two separate things:

1. **Paddle overlay didn't redirect to `/checkout/success`.** It just closed and left you on `/manager`. So the `claim_manager_account` RPC fallback (which lives on the success page) never ran, and the page never re-mounted to re-query.
2. **`JoinCodeCard` queries once on mount.** It ran *before* the webhook wrote the venue row, got `null`, cached "No venue yet", and never refetched.

The "demo data" (team table, KPIs, charts) is hardcoded sample data in `manager.index.tsx` — that's intentional for now and out of scope.

## Plan

### 1. Make Paddle reliably redirect after checkout

In `src/lib/paddle.ts`, the existing `eventCallback` already logs every event. Extend it to also handle `checkout.completed`:

- On `checkout.completed`, navigate the top window to `/checkout/success` (use `window.location.assign`, not router — Paddle overlay lives outside the router).
- Keep the existing `successUrl` setting as a backup; some payment methods honour it, some don't, so explicit navigation on the event is the reliable path.

### 2. Make `JoinCodeCard` self-heal when the webhook lands

In `src/components/JoinCodeCard.tsx`:

- After the initial query, if `venue` is `null`, subscribe to Postgres changes on `public.venues` filtered by `manager_id = auth.uid()` via Supabase realtime. When an INSERT arrives, set the venue and unsubscribe.
- As a belt-and-braces fallback (in case realtime isn't enabled on the table), poll every 3 seconds for up to ~30 seconds while `venue` is null.
- Change the empty-state copy from "No venue yet. Complete checkout to set one up." to "Setting up your venue…" while polling, and only show the original message if 30 s elapses with no row.

This requires enabling realtime on `public.venues` via a migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
```

### 3. Tighten `/checkout/success` so it always reflects current state

`src/routes/checkout.success.tsx` already calls `claim_manager_account` as a fallback. Keep that, but after the RPC succeeds, briefly poll `venues` (same 30 s / 3 s loop) before enabling the "Open your dashboard" link, so the user never lands on a dashboard that's still missing its venue row.

## Files touched

- `src/lib/paddle.ts` — add `checkout.completed` → `window.location.assign("/checkout/success")` in `eventCallback`
- `src/components/JoinCodeCard.tsx` — realtime subscription + poll fallback + "Setting up your venue…" copy
- `src/routes/checkout.success.tsx` — wait until venue row visible before enabling CTA
- New migration — enable realtime on `public.venues`

## Out of scope

- Replacing the hardcoded sample data on the manager dashboard
- Any change to live (production) checkout, the webhook handler, the catalog, or auth

## How to verify after implementation

1. Refresh `/manager` now — the existing `ivy` venue + code `484194` should appear.
2. Sign up a brand-new manager, complete sandbox checkout with `4242 4242 4242 4242` — you should be redirected to `/checkout/success`, then land on `/manager` with the join code already visible (no manual refresh).
3. Backend state for the new user should match: one row each in `venues`, `user_roles` (manager), `subscriptions`.
