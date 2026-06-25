## Problem

When uploading a labour file, the manager-side staging server function `stageImportBatch` (in `src/lib/imports.functions.ts`) does a direct `INSERT` into `shift_import_batches_v2` using the authenticated user's Supabase client. RLS then evaluates against the table's policies — and there is no `INSERT` policy on `shift_import_batches_v2`. Only `SELECT` and `UPDATE` policies exist (both gated by `is_venue_manager(venue_id)`). With no `INSERT` policy + RLS enabled, Postgres rejects the row with the exact error you're seeing.

The same gap exists on the three related staging tables the same function writes into:
- `shift_staging_rows` — SELECT only
- `shift_sales_staging` — SELECT only
- `shift_labor_staging` — SELECT only

So even after the batch row is fixed, the next insert would fail with the same error on a different table. They all need to be fixed together.

(The other ingest path `lls_v2_ingest_batch` is `SECURITY DEFINER` and bypasses RLS, which is why it works. The newer staging path used by the labour upload UI does not.)

## Fix

Add missing RLS policies to the four staging-pipeline tables, scoped to the venue manager via the existing `is_venue_manager(venue_id)` helper. Concretely, one migration that adds, for each of `shift_import_batches_v2`, `shift_staging_rows`, `shift_sales_staging`, `shift_labor_staging`:

- `INSERT` policy `WITH CHECK (is_venue_manager(venue_id))` for role `authenticated`
- `UPDATE` policy `USING/WITH CHECK (is_venue_manager(venue_id))` for role `authenticated` (needed for batch status transitions / row reconciliation that go through the user-scoped client; `shift_import_batches_v2` already has one — skip there)
- `DELETE` policy `USING (is_venue_manager(venue_id))` for role `authenticated` (used by rollback / supersede flows on staging rows)

No schema changes, no app code changes, no change to logic, calculations, or the SECURITY DEFINER RPCs. Only RLS policies are added. Existing SELECT policies stay untouched. Venue isolation is preserved because every new policy is gated by `is_venue_manager(venue_id)`.

## Verification

- Re-attempt the labour upload on `/manager/lls` — batch should be created and staged.
- Confirm no other manager flow regresses (approve/rollback already worked through the existing UPDATE policy on `shift_import_batches_v2`).
- Confirm a non-manager `authenticated` user still cannot insert (policy requires `is_venue_manager`).
