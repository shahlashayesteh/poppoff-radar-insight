# Split demo picker from login

## Steps

1. **Create `src/routes/demo.tsx`** — copy current `src/routes/login.tsx` verbatim, change only `createFileRoute("/login")` → `createFileRoute("/demo")`. Identical look and behavior.

2. **Replace `src/routes/login.tsx`** — same `createFileRoute("/login")`, but new minimal component: centered card with Logo, email input, password input, "Sign in" button. Presentational only (no auth wiring, just `e.preventDefault()`). Uses existing shadcn `Input`, `Label`, `Button`.

3. **Update `src/routes/index.tsx`** — change only the `to="/login"` strings on demo CTAs to `to="/demo"`:
   - Header "Book a Demo"
   - Hero "Book a Demo"
   - Hero "Start Your Pilot"
   - Mid-page CTA banner "Book a Demo"
   
   Leave the header "Login" text link on `/login`. No other changes to the file.

## Separation guarantee

`/demo` and `/login` are two independent route files with no shared component, hook, or helper between them.
