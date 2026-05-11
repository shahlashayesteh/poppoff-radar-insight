## Change

Update the helper link below the sign-in form on `/signin` so it's clear the "Join your venue" link is for first-time servers, not returning users.

## File

- `src/routes/signin.tsx`

## Edit

In the helper-links block below the form:

- **Before:** `Server?  Join your venue`
- **After:** `New server?  Join your venue`

The "New restaurant? Start your free trial" line stays as-is. No styling, routing, or auth logic changes.
