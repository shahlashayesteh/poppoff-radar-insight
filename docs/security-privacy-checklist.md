# PoppOff — Security & Privacy Checklist (Phase 24)

Internal reference. Each item is enforced in code and covered by tests in
`src/lib/__tests__/phase24-production-hardening.test.ts`.

## Access boundaries
- [x] Paid manager pages require entitlement (`PaidManagerGate` + server `requirePaidManagerEntitlement`).
- [x] Cancelled / expired / unknown statuses blocked from paid manager features.
- [x] `past_due` allowed only inside the 7-day grace window; blocked after.
- [x] `active`, `trialing`, `enterprise` allowed.
- [x] Import lifecycle (approve / commit / rollback) requires entitlement.

## Venue / organisation isolation
- [x] Every guarded manager server fn calls `assertVenueAccess` or `resolveManagerVenueId`.
- [x] Multi-venue users must select an active venue (no silent fall-through).
- [x] `assertBatchInVenue` blocks cross-venue batch lifecycle (approve / commit / rollback).
- [x] `user_can_access_venue` enforces owner / venue_member / organisation head_office.

## Server / manager separation
- [x] No `/server/*` route imports `manager-data.functions`, `manager-trace.functions`,
      `roi.functions`, `roi/*`, `pilot/*`, `entitlements-guard`, `lls.functions`, or
      `imports.functions`.
- [x] No `/server/*` route renders ROI, payback period, modelled recoverable revenue,
      labour basis, sales basis, LLS, Adjusted LLS, OF v2 internals, provenance JSON
      or evidence JSON.

## Demo / real separation
- [x] `/demo/*` routes never import `manager-data.functions`, `manager-trace.functions`,
      `roi.functions`, `lls.functions` or `imports.functions`.
- [x] `/demo/journey` is public (no PaidManagerGate, no real data fetch).

## Failure states
- [x] No active venue → `NoVenueState` (operator-friendly amber panel).
- [x] Invalid / inaccessible venue → `NoVenueState invalid`.
- [x] No entitlement → `PaidManagerGate` blocked screen with billing link.
- [x] Past-due within grace → banner; beyond grace → blocked.
- [x] Failed ROI / trace / OF v2 preview → caught, surfaced as plain message,
      does not break the parent page.
- [x] Failed assessment persistence → swallowed best-effort (never blocks LLS render).

## Import & commit safety
- [x] Staged rows live in `shift_staging_rows`; commit goes through
      `lls_v2_commit_batch` SECURITY DEFINER RPC.
- [x] Identity ambiguity blocks commit until resolved.
- [x] Provenance (source system, file, batch, basis, identity method, reliability class)
      is persisted on every committed row.
- [x] Row reliability warnings surfaced in Data Quality panel.
- [x] Duplicate file uploads blocked via `file_hash`.

## Data trust labels
- [x] Reliability classes: `measured`, `derived`, `estimated`, `contextual`, `untrusted`.
- [x] Contextual fields (weather, notes, unverified sections) cannot drive scoring.
- [x] Evidence trace available for every recommendation.
- [x] OF v2 stays preview-only; Adjusted LLS unchanged.

## Error & logging hygiene
- All server fns return plain DTOs; raw provider errors are wrapped.
- Client pages catch with `error` state and render friendly copy.
- Best-effort persistence (OF v2 assessment write) is wrapped in try/catch and
  documented as non-fatal.
- No secrets, tokens, user emails or financial figures appear in error messages.

## Public surface
- `/`, `/contact`, `/calculator/*`, marketing pages and `/demo/journey` remain public.
- `/api/public/*` routes verify their own signatures / inputs; never return PII.
