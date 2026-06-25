
# PoppOff — Complete Site Audit

I'll deliver a single comprehensive audit document at `docs/site-audit.md` (and summarize key sections in chat). It will walk the entire site route-by-route with: what the page does, who it's for, what data it needs, the exact equations/calculations, where the numbers come from, guards/entitlements applied, and what it links/routes to next.

## Structure of the deliverable

### 1. Site map and navigation graph
- All 70+ routes grouped by area: Public marketing, Auth, Calculators, Demo (manager + server), Manager app, Server app, API/webhooks, Legal.
- A navigation graph showing how a manager moves between Dashboard → Team → Individual → LLS → Imports → Priorities → Coaching → Menu → Reports → ROI → Pilot → Adoption → Settings, and how server users move between Welcome → Stats → Progress → Leaderboard → Coaching → Rewards → Menu → Profile.
- Role gating per route (public / authenticated / paid manager / server / org-scoped).

### 2. Manager app — page-by-page breakdown
For each of the manager routes (`/manager/index`, `team`, `server/$id`, `lls/index`, `lls/compare`, `imports`, `imports/$batchId`, `priorities`, `coaching`, `menu`, `reports`, `roi`, `pilot`, `adoption`, `data-onboarding`, `settings`) I'll document:
- **Purpose** in one paragraph.
- **Inputs**: which server functions it calls, which tables it reads, which active-venue context is required.
- **Guards**: `requirePaidManagerEntitlement`, `assertVenueAccess`, org membership.
- **Calculations**: every formula used on the page, with variables defined and source columns named. Examples that will be fully documented:
  - LLS v2 weighted score (Sum/Sum, never average-of-averages), RAG band thresholds, parity vs v1.
  - Opportunity Factor v2 evaluation: clamps `[0.75, 1.35]`, inputs (daypart sales, real clock hours preferred over cost-proxy hours), preview-only delta vs v1.
  - Real Hours sourcing priority: `clock_hours` > `scheduled_hours` > derived `cost / wage_rate`.
  - Sales basis normalisation: gross → net (tax/VAT/service/tips stripped per provenance flags).
  - Labour basis normalisation: gross wage vs fully-loaded cost.
  - Shift-match / Historical Shift Match Intelligence equation (sales-per-daypart slot fit).
  - ROI engine: modelled improvement opportunity = `gap_to_target_revenue × 0.30` (recoverability factor), confidence tier from data-quality score.
  - Adoption score, Data Quality readiness score, Pilot readiness score (component checklists and weights).
  - Identity resolver priority: Exact source ID > Alias > Name; ambiguity rule.
- **Provenance/Reliability badges** shown on each metric (Measured / Derived / Estimated / Modelled / Contextual).
- **Outbound links/deep-links** (e.g. Reports → Imports batch, LLS → Trace drawer).

### 3. Server app — page-by-page breakdown
For `/server/index`, `welcome`, `stats`, `progress`, `leaderboard`, `coaching`, `rewards`, `menu`, `profile`:
- **Purpose** and motivational framing.
- **Inputs**: server-scoped server functions only; venue scoped via `getActiveVenueIdForUser`.
- **Calculations**:
  - Personal stats: covers, sales totals, items-per-cover, attach rate (from shifts scoped to that employee only).
  - Progress trend: rolling 4-week personal deltas.
  - Leaderboard: venue-scoped ranking metric and tie-break.
  - Coaching focus areas: AI suggestion → manager-approved priorities (`sent_to_servers` status only).
  - Rewards / momentum board: 7 badge unlock rules and thresholds.
- **Strict isolation**: confirm no LLS, ROI, labour cost, or manager intelligence is reachable.

### 4. Demo routes
Each `/demo/*` route documented with: which canonical fixture in `src/lib/sample-data.ts` it pulls from, what the public sales journey (`/demo/journey`) sequences, and how it differs from the authenticated equivalent.

### 5. Public marketing, calculators, auth
- Landing (`/`), feature pages (hospitality-performance-software, leaderboard, sales-coaching, server-performance, upselling), `/contact` (Revenue Gap Audit form + spam protection), `/calculator` and `/calculator/server-gap` (flagship lead magnet — full formula documented), legal pages, sitemap, redirects.
- Auth: `/login`, `/signin`, `/signup`, `/signup/manager`, `/join`, `/checkout/success`, `/checkout/retry`.

### 6. API & server functions
- Public endpoints under `src/routes/api/public/*` (contact form, webhooks).
- Server-function modules (`lls.functions.ts`, `imports.functions.ts`, `manager-data.functions.ts`, `manager-trace.functions.ts`, `roi.functions.ts`, `adoption.functions.ts`, `onboarding.functions.ts`) — each function listed with input schema, guards, and returned shape.

### 7. Data model & equation reference (appendix)
- Tables touched: `venues`, `organisations`, `organisation_memberships`, `shifts`, `shifts_v2`, `shift_import_batches_v2`, `shift_staging_rows`, `employee_master`, `source_employee_ids`, `employee_identity_merges`, `menu_item_suggestions`, weekly priorities + audit events, `opportunity_factor_assessments`, `payment_events`, `user_roles`.
- Canonical equation list in one place, cross-referenced from each page section.
- Reliability registry (33 fields) with classification per field.

## Method
- Read every route file and its server-function dependencies (in parallel batches via a subagent to avoid context bloat).
- Cross-check equations against the test suites in `src/lib/lls/__tests__/`, `src/lib/imports/__tests__/`, and `src/lib/__tests__/` so the documented formulas match what's actually shipped.
- Note any drift between docs in code comments and actual behaviour.

## Deliverable
`docs/site-audit.md` (one self-contained file, ~30–60 pages of structured markdown with anchored sections), plus a short in-chat executive summary highlighting the 5–10 most important equations and any inconsistencies found during the audit.

No application code will change — this is documentation only.
