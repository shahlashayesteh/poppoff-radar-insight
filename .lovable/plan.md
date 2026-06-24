# PoppOff → Enterprise Hospitality SaaS — Sequenced Migration Plan

> Status: PLAN ONLY. No implementation until each phase is approved.
> Owner: Lovable agent (build mode). Source-of-truth for the 37-item audit brief.

---

## 0. Pre-flight (must pass before Phase 1)

**P0.1 — Verify Stripe end-to-end**
- Run Playwright against preview: `/` → Pricing → Get Started → Stripe Checkout opens → test card `4242 4242 4242 4242` → success → `subscriptions` row inserted with `environment='sandbox'`, correct `price_id` (`poppoff_starter_monthly` / `poppoff_pro_monthly`), `status='active'` or `'trialing'` → `useSubscription` unlocks manager dashboard.
- Webhook delivery check: confirm `customer.subscription.created` arrived at `/api/public/payments/webhook?env=sandbox` and was processed (server-function-logs).
- **If broken:** fix before any other work. Most likely failure points: webhook env query param, `lookup_key` mismatch, `metadata.userId` missing on subscription, RLS on `subscriptions` blocking insert (service role required).

**P0.2 — Snapshot baseline**
- Inventory current routes (`rg "createFileRoute" src/routes`).
- Inventory current DB tables (already in context).
- Capture screenshots of: `/`, `/pricing`, `/contact`, `/calculator`, `/demo/manager`, `/demo/server`, `/manager`, `/server`. These become the "before" reference for item #37.

---

## Phase 1 — Trust & Correctness Core (defensibility foundation)

Goal: make every number on a manager screen mathematically defensible. Nothing in this phase changes positioning or UI surface; it changes what the numbers mean and how they're computed.

### PR 1.1 — Active venue context (item #12)
- New `src/contexts/ActiveVenueContext.tsx`: `{ activeVenueId, setActiveVenueId, memberships[] }`.
- Persist in `localStorage` keyed by user id; rehydrate on auth.
- Add `<VenueSelector />` to manager shell header.
- Replace every `rows[0]` / `.limit(1)` venue lookup in manager code paths. Grep targets: `venues`, `venue_members`, `manager_id`, `is_venue_manager`.
- Server functions accept `venue_id` as required input; validate membership via `is_venue_manager(venue_id)` before any read/write.
- **Acceptance:** a user with 2 venues sees a selector; switching changes all manager pages; no silent "first venue" remains.

### PR 1.2 — Multi-site schema (item #13) — FULL MIGRATION
Migration `add_org_hierarchy`:
```
organisations(id, name, created_at, updated_at)
organisation_members(org_id, user_id, role: owner|admin|head_office|viewer)
venues  → add org_id (nullable initially, backfill, then NOT NULL)
outlets(id, venue_id, name, revenue_centre_code, is_active)
venue_members → add role default 'manager', add is_active
```
- Backfill: one `organisations` row per existing `venues.manager_id`; assign org_id to those venues.
- Add `has_org_role(_user, _org, _role)` and `is_org_head_office(_user, _org)` security-definer functions.
- RLS update on `venues`, `server_stats`, `shifts_v2`, etc. — head-office users get aggregated read across all org venues; venue managers stay scoped.
- New `outlet_id` on `shifts_v2`, `server_stats`, `server_category_stats`, `shift_staging_rows` (nullable, default to a `venues.default_outlet_id`).
- Active context extended: `{ activeOrgId, activeVenueId, activeOutletId }`.
- **Risk:** breaking — every manager query needs review. Estimate 1 large migration + 2–3 days of query updates + regression run.

### PR 1.3 — Sales basis (item #14)
- Migration: add to `shift_sales_staging` and `shifts_v2`:
  `gross_sales, net_sales, tax, vat, service_charge, tips, discounts, comps, voids, refunds, currency, sales_basis, revenue_centre, outlet_id`.
- Enum `sales_basis_type`: `net_explicit | gross_explicit | gross_treated_as_net | unknown`.
- Import parser populates `sales_basis` based on which columns were present in source.
- `<SalesBasisBadge />` component shown wherever sales are displayed.
- LLS engine refuses to compute Net-based LLS when `sales_basis = 'gross_treated_as_net'` without a manager override flag.

### PR 1.4 — Labour basis (item #15)
- Migration: add to `shift_labor_staging` and `shifts_v2`:
  `fully_loaded_labor_cost, total_labor_cost, gross_wage_cost, employer_on_cost, wage_cost, hourly_rate, paid_hours, actual_hours, scheduled_hours, unpaid_break_minutes, labour_basis`.
- Enum `labour_basis_type`: `fully_loaded | total_labour | wage_only | hours_x_rate | scheduled_estimate | unknown`.
- `<LabourBasisBadge />` everywhere labour cost appears.
- Aggregation guard: `lls_v2_run_reconciliation` segments rows by `labour_basis`; mixed basis within a team rollup raises a `data_quality_warning` row in `lls_v2_audit_events`.

### PR 1.5 — LLS formula audit & guards (item #16)
- Extract LLS math from `lls_v2_*` SQL into a single TS module `src/lib/lls/formulas.ts` with pure functions:
  - `baseLLS(netSales, labourCost)`
  - `adjustedLLS(baseLLS, opportunityFactor)`
  - `teamBaseLLS(rows)`  — Σ net / Σ labour, never avg-of-avg
  - `teamAdjustedLLS(rows)` — Σ net / Σ(labour × OF)
- Mirror identical math in a SQL helper `public.lls_compute_team(...)` returning JSONB; reconciliation calls this helper instead of inlining.
- **Hard ban:** add unit tests that fail if any code path multiplies RPC into LLS, or averages per-shift LLS.

### PR 1.6 — Performance gap & RAG (item #17)
- `src/lib/lls/performance.ts`: `performanceGap(adjustedServer, venueBenchmark) = adjustedServer/benchmark - 1`.
- RAG tiers exported as const: `strong | outperforming | tracking | monitor | priority` with documented thresholds.
- Simplified green/amber/red is a presentation mapping only; canonical tier always stored.

### PR 1.7 — Opportunity Factor v1 → v2 scaffolding (item #18)
- Rename current model in code & UI to **"Trading Pattern Factor v1"** with confidence badge.
- New table `opportunity_factor_models(id, venue_id, version, inputs jsonb, status: draft|active|shadow, created_at)`.
- v2 inputs scaffolded but not computed yet: covers, daypart, outlet, section, role, booking mix, party size, capacity, events, intensity, forecast demand.
- Manager UI shows both v1 (live) and v2 (shadow) when v2 data exists.

### PR 1.8 — Tests & build verification (item #35–36)
- Vitest suite under `src/__tests__/lls/`: formula tests, mixed-basis rejection, sales-basis derivation, gap computation, demo-fixture invariants.
- CI commands: `bun run build`, `bun run lint`, `bunx vitest run`, `bunx tsgo --noEmit`.

**Phase 1 exit:** every manager LLS/RPC/gap number traces to one TS function with tests, and basis badges are visible everywhere.

---

## Phase 2 — Import & Identity Integrity

### PR 2.1 — Import staging workflow (item #19)
Already partially built (`shift_import_batches_v2`, `shift_staging_rows`, `lls_v2_ingest_batch`, `lls_v2_run_reconciliation`). Gaps to close:
- Add **upload → parse → preview → approve** UI flow at `/manager/imports/new` with stepper.
- Reject "commit on upload" — require explicit `lls_v2_approve_batch(_batch_id)` RPC that flips `is_active=true` and runs reconciliation.
- Show financial totals & rejected rows before approval.

### PR 2.2 — Import audit tables (item #20)
Migration `import_audit_tables`:
- `import_files(id, batch_id, name, hash sha256, uploaded_by, uploaded_at, source_system, size_bytes)`.
- `import_validation_results(id, batch_id, row_index, severity, code, message, evidence jsonb)`.
- `import_reconciliation_totals(batch_id, gross_total, net_total, labour_total, covers_total, accepted_count, rejected_count)`.
- `audit_events(id, actor, action, target_type, target_id, payload jsonb, created_at)` — generic, project-wide.
- GRANTs + RLS scoped to org/venue managers.

### PR 2.3 — Employee identity master (item #21)
Migration `employee_identity_master`:
- `employee_master(id, venue_id, display_name, primary_pos_employee_id, primary_labour_employee_id, status, created_at)`.
- `employee_aliases(id, employee_master_id, alias text, source: pos|labour|manual, confidence numeric)`.
- `employee_match_queue(id, venue_id, batch_id, candidate_name, suggestions jsonb, status: pending|resolved, resolved_by, resolved_at)`.
- Replace `normalize_person_name`-only matching with: (1) exact employee ID → (2) name + date + start time → (3) overlap match → (4) single-candidate fallback → (5) manual queue.
- `/manager/imports/identity-queue` UI for manual resolution.

### PR 2.4 — Server Gap matching merged into Manager LLS (item #22)
- Lift the stronger tiered matcher from server-gap calculator into `lls_v2_run_reconciliation` shared SQL.
- Stop defaulting missing start times to `00:00:00`; route to `time_ambiguous` instead.
- Tests for each tier.

### PR 2.5 — Data Quality panel (item #23)
- `<DataQualityPanel />` on manager dashboard summarising the most recent batch + lifetime metrics.
- Sources from `import_reconciliation_totals` + `lls_v2_audit_events`.

**Phase 2 exit:** no silent merges, no direct production writes, every import has a hash + audit trail.

---

## Phase 3 — Product Surface & Role Separation

### PR 3.1 — Demo consolidation (item #6)
- Single fixture file `src/lib/demo-fixtures.ts` exporting `demoVenue`, `demoShifts`, `demoServers`, `demoKpis` (all derived, not hardcoded).
- Routes kept: `/demo/manager`, `/demo/server`. Old `/demo/manager-dashboard`, `/demo/server-scorecard` → 301 redirect via `beforeLoad: () => redirect(...)`.
- All demo KPIs derived in-component from fixtures via the same TS functions Phase 1 added.

### PR 3.2 — Server product rule enforcement (item #8, #9)
- Strip from server bundle any reference to: labour cost, LLS, opportunity factor, recoverable revenue, manager benchmark.
- Leaderboard relabelled: "Who's winning this week", "Sales game", "Items sold", "Momentum board".
- Eslint custom rule or grep CI guard: fail build if `lls|opportunity_factor|labour_cost|recoverable` appears under `src/routes/server.*` or `src/components/server/**`.

### PR 3.3 — Manager product rule completion (item #10)
- Manager pages render: RPH, RPC, Base LLS, Adjusted LLS, OF, benchmark, gap, recoverable, shift fit, outlet fit, deployment recs, data quality, confidence.
- Use shared formula module; no inline math.

### PR 3.4 — Route protection & UX gating audit (item #11, #34)
- Audit `src/routeTree.gen.ts` source files (the `.tsx` route files).
- Move all server routes under `src/routes/_server/` layout; manager under `_authenticated/manager/`; demo stays public.
- Layout `_server/route.tsx` requires `role=server` via `has_role`; `_authenticated/manager/route.tsx` requires `role=manager` + active venue membership.
- Document final route list (item #34) in `docs/routes.md`.

**Phase 3 exit:** server and manager surfaces are physically separated in routing; demo data has a single source.

---

## Phase 4 — Commercial Surface

### PR 4.1 — Homepage positioning + CTAs (item #1, #2)
- Hero copy + CTA hierarchy update.
- Move Server Revenue Gap Calculator to a prominent above-the-fold card.

### PR 4.2 — How It Works (item #3)
- 8-step operational flow component with icons + short copy.

### PR 4.3 — Pricing (item #4)
- Tier cards: Starter Audit (free), Pilot, Single Venue, Multi-Site (per-site), Enterprise (annual).
- Stripe products: keep `poppoff_starter` / `poppoff_pro` as Single Venue tier; add `poppoff_multisite_per_site`. Enterprise = contact-sales (no Stripe price).

### PR 4.4 — Book a Revenue Gap Audit (item #5)
- `/contact` upgraded with all required fields + Zod validation + honeypot + rate-limit server fn.
- Store submissions in `contact_submissions` (already exists) — extend columns.

### PR 4.5 — Calculator as lead magnet (item #30)
- Post-result CTA "Book a PoppOff migration audit"; anonymised CSV export.

**Phase 4 exit:** public surface reads as enterprise SaaS; lead capture is structured.

---

## Phase 5 — Operational Depth

### PR 5.1 — Reports upgrade (item #24)
LLS trend, Adjusted LLS trend, RPC, RPH, recoverable revenue, server improvement, category mix, outlet comparison, import quality. CSV + PDF export.

### PR 5.2 — Menu Intelligence approval workflow (item #25)
States: AI suggested → Manager approved → Sent to servers / Rejected / Archived. Audit trail in `audit_events`. Margin + category normalisation.

### PR 5.3 — Weekly Priorities structure (item #26)
Migration adds the structured fields. Server coaching reads only `status='approved'` rows.

### PR 5.4 — Coaching upgrade (item #27)
Structured outputs: pre-shift briefing, 1:1 notes, server-specific focus, manager checklist, follow-up, before/after.

### PR 5.5 — Shift Match rename (item #28)
Rename "Scheduling Leverage" → "Historical Shift Match Intelligence" in copy + routes (`/manager/shift-match`).

### PR 5.6 — Outlet & revenue centre separation (item #29)
Use `outlet_id` from PR 1.2; cross-outlet deployment recs require explicit flag.

---

## Phase 6 — Billing Hardening

### PR 6.1 — Webhook idempotency (item #31)
Migration:
```
payment_events(event_id text primary key, event_type, environment, raw_payload jsonb,
               status, processed_at, error, retry_count)
```
Webhook handler inserts on receive (ON CONFLICT DO NOTHING); skips if already processed.

### PR 6.2 — Entitlement gating (item #32)
`useEntitlement(feature)` hook reads `subscriptions.status` + tier from `price_id` (NOT `product_id`). `past_due` shows dunning banner but keeps access; `unpaid`/`canceled` blocks import + new shifts (read-only).

### PR 6.3 — Settings restructure (item #33)
Move `/settings` → `/manager/settings/{profile,data-sources,import-rules,roles,server-visibility,lls-thresholds,billing,audit-logs}`.

---

## Phase 7 — Verification & Handover

### PR 7.1 — Regression suite (item #35)
All tests from earlier PRs assembled; coverage gate.

### PR 7.2 — Build verification (item #36)
`bun run build && bun run lint && bunx vitest run && bunx tsgo --noEmit` — all green.

### PR 7.3 — Output package (item #37)
- `docs/CHANGELOG-enterprise.md` — files changed, schema, formulas, routes, tests, limitations.
- `docs/before-after.md` — screenshots from P0.2 vs current.
- `docs/calculation-verification.md` — table proving each formula matches canonical.
- `docs/route-verification.md` — every kept route + load status.

---

## Sequencing summary

| Phase | Effort   | Risk    | Blocks                  | Output                                           |
|-------|----------|---------|-------------------------|--------------------------------------------------|
| 0     | 0.5 day  | low     | everything              | Stripe verified, baseline snapshot               |
| 1     | 4–6 days | medium  | Phases 2,3,5            | Defensible numbers + multi-site schema           |
| 2     | 3–4 days | medium  | Phase 5 reports         | Trusted imports + identity                       |
| 3     | 2–3 days | low     | Phase 4 visible quality | Clean role separation, single demo fixture       |
| 4     | 2 days   | low     | —                       | Enterprise commercial surface                    |
| 5     | 4–5 days | medium  | —                       | Reports, menu, coaching, shift match, outlets    |
| 6     | 1.5 days | low     | —                       | Idempotent billing + entitlements                |
| 7     | 1 day    | low     | —                       | Verification artefacts                           |

**Total realistic effort:** ~3 weeks of focused build work. Each PR ends with a working preview and tests.

---

## Open questions for the user

1. **Multi-site:** confirmed full migration now (your answer). I'll backfill one `organisation` per existing manager so nothing breaks for current users.
2. **Pricing:** what are the actual numbers for Pilot, Single Venue, Multi-Site (per-site), Enterprise floor? Current £99/£199 stays as Single Venue tiers unless told otherwise.
3. **Stripe Pilot / Multi-Site SKUs:** do you want Stripe products created now for Pilot + Multi-Site, or kept as contact-sales until you set prices?
4. **Enterprise contracts:** any integrations to commit to (Toast, Lightspeed, Square, Deputy, Harri, Fourth, 7shifts)? Drives Phase 5 priority.
5. **Sandbox vs live Stripe:** P0.1 verifies sandbox. When do you want to flip to live? (Affects PR 6.2 dunning thresholds.)

---

## Not in scope (explicit non-goals)

- True rota optimisation (#28 calls this out — only renamed until rota inputs exist).
- POS direct integrations (CSV import only this round).
- Mobile apps.
- White-label theming.
- SSO / SAML (can be added in Phase 6 if a deal demands it).
