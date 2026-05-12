## Goal
Send a notification email to **sholoola@yahoo.com** every time someone signs up — both new managers and new servers joining via access code.

## Steps

1. **Set up Lovable Emails** (one-time)
   - Configure a sender domain so notifications come from your brand (not a generic address).
   - Set up the email infrastructure (queue, send log, retry handling).
   - You'll get a "Set up email domain" button to complete this.

2. **Create the notification template**
   - New file: `src/lib/email-templates/signup-notification.tsx` (React Email).
   - Shows: full name, email, role (Manager or Server), business/venue name, signup timestamp.
   - Subject: `New {Manager|Server} signup: {name}`.
   - Register it in `src/lib/email-templates/registry.ts`.

3. **Public notification endpoint**
   - New file: `src/routes/api/public/notify-signup.ts`.
   - Accepts `{ role, fullName, email, businessOrVenue, userId }`.
   - Fixed recipient: `sholoola@yahoo.com` (hardcoded server-side so the address isn't exposed in client code).
   - Uses an idempotency key (`signup-notify-{userId}`) so retries don't double-send.
   - Sends via the transactional email pipeline.

4. **Trigger on manager signup**
   - In `src/routes/signup.manager.tsx`, after the manager account + venue are created, call the endpoint with role `manager`.
   - Non-blocking: failure to notify must not block the signup flow (fire-and-forget with error logged).

5. **Trigger on server signup**
   - In `src/routes/join.tsx`, after `join_venue_with_code` succeeds, call the endpoint with role `server` and the venue name.
   - Same non-blocking pattern.

## Out of scope
- No changes to existing signup logic, auth, RLS, dashboards, OCR, or any unrelated feature.
- No notification on sign-in (only first-time signup).
- No in-app notification UI — email only.
