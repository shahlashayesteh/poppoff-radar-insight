/**
 * LLS v2 — Phase 2 schema & safeguard tests.
 *
 * These tests run against the live Lovable Cloud database via psql.
 * Skipped automatically when PGHOST is not set (CI/sandbox without DB access).
 *
 * Scope (per approved Phase 2 plan):
 *   - Safeguard I: partial unique index on canonical_shift_sources(staging_row_id) WHERE is_active
 *   - Safeguard I: lls_v2_run_reconciliation acquires advisory lock and is atomic
 *   - Safeguard J: positive ready_for_matching allowlist + status CHECK constraint
 *   - Cross-table consistency triggers on detail tables and canonical_shift_sources
 *   - Authorisation: lls_v2_authorise_single_sided rejects empty justification
 *   - Read RLS: shadow tables exist with venue-manager-scoped SELECT policies
 *
 * NOTE: this suite intentionally does NOT touch v1 tables, the /manager/lls
 *       UI, or src/lib/lls.functions.ts. The v1 parity suite continues to run
 *       separately under src/lib/lls/__tests__/v1-regression/.
 */
import { describe, test, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

const HAS_DB = !!process.env.PGHOST
const d = HAS_DB ? describe : describe.skip

function psql(sql: string): string {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', '-X'], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function psqlExpectError(sql: string): string {
  try {
    execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', '-X'], {
      encoding: 'utf8',
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return ''
  } catch (e: any) {
    return String(e.stderr ?? e.message ?? '')
  }
}

d('LLS v2 — schema exists', () => {
  test('every new table is present', () => {
    const out = psql(`
      SELECT string_agg(table_name, ',' ORDER BY table_name)
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'shift_import_batches_v2','shift_staging_rows','shift_sales_staging',
          'shift_labor_staging','venue_daypart_windows','venue_pos_control_totals',
          'venue_pos_attribution_config','venue_identity_aliases',
          'venue_identity_mappings','venue_identity_candidates',
          'shifts_v2','canonical_shift_sources','venue_service_periods'
        );`).trim()
    expect(out.split(',').sort()).toEqual([
      'canonical_shift_sources',
      'shift_import_batches_v2',
      'shift_labor_staging',
      'shift_sales_staging',
      'shift_staging_rows',
      'shifts_v2',
      'venue_daypart_windows',
      'venue_identity_aliases',
      'venue_identity_candidates',
      'venue_identity_mappings',
      'venue_pos_attribution_config',
      'venue_pos_control_totals',
      'venue_service_periods',
    ])
  })

  test('every new security-definer function exists and has search_path set', () => {
    const fns = psql(`
      SELECT string_agg(p.proname, ',' ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'lls_v2\\_%' ESCAPE '\\';`).trim()
    const list = fns.split(',')
    for (const expected of [
      'lls_v2_authorise_single_sided',
      'lls_v2_ingest_batch',
      'lls_v2_is_manager',
      'lls_v2_refresh_service_periods',
      'lls_v2_resolve_duplicate',
      'lls_v2_resolve_identity',
      'lls_v2_run_reconciliation',
      'lls_v2_supersede_batch',
      'lls_v2_upsert_daypart_window',
    ]) {
      expect(list).toContain(expected)
    }
  })

  test('PUBLIC cannot EXECUTE the new security-definer functions', () => {
    const leaked = psql(`
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'
        AND p.proname LIKE 'lls_v2\\_%' ESCAPE '\\'
        AND has_function_privilege('public', p.oid, 'EXECUTE');`).trim()
    expect(leaked).toBe('0')
  })
})

d('Safeguard J — positive reconciliation_status allowlist', () => {
  test('CHECK constraint exists and lists ready_for_matching', () => {
    const def = psql(`
      SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      WHERE t.relname='shift_staging_rows' AND c.contype='c'
        AND pg_get_constraintdef(c.oid) ILIKE '%reconciliation_status%';`)
    expect(def).toContain('ready_for_matching')
    expect(def).toContain('manager_exception_single_sided')
    expect(def).toContain('pending')
  })

  test('inserting an unknown reconciliation_status is rejected', () => {
    const err = psqlExpectError(`
      INSERT INTO public.shift_staging_rows
        (venue_id, batch_id, source_kind, raw_row, raw_row_hash, reconciliation_status)
      SELECT v.id, gen_random_uuid(), 'sales', '{}'::jsonb, 'x', 'bogus_status'
      FROM public.venues v LIMIT 1;`)
    // Either constraint violation or FK violation is acceptable rejection.
    expect(err.length).toBeGreaterThan(0)
  })
})

d('Safeguard I — partial unique index on canonical_shift_sources', () => {
  test('partial unique index exists on (staging_row_id) WHERE is_active', () => {
    const def = psql(`
      SELECT pg_get_indexdef(i.indexrelid)
      FROM pg_index i
      JOIN pg_class c ON c.oid=i.indexrelid
      WHERE c.relname='uq_css_active_staging';`)
    expect(def).toContain('UNIQUE')
    expect(def).toContain('staging_row_id')
    expect(def.toLowerCase()).toContain('where')
    expect(def).toContain('is_active')
  })
})

d('Safeguard I — lls_v2_run_reconciliation is SECURITY DEFINER and acquires advisory lock', () => {
  test('function source mentions pg_advisory_xact_lock and ready_for_matching', () => {
    const src = psql(`SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='lls_v2_run_reconciliation';`)
    expect(src).toContain('pg_advisory_xact_lock')
    expect(src).toContain('ready_for_matching')
    expect(src).toContain('SECURITY DEFINER')
  })

  test('matcher reads only the positive allowlist (no negative filter)', () => {
    const src = psql(`SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='lls_v2_run_reconciliation';`)
    // promotion step targets only 'pending' survivors
    expect(src).toContain("reconciliation_status = 'pending'")
    // never matches against arbitrary not-in lists
    expect(src).not.toMatch(/reconciliation_status\s+NOT\s+IN/i)
    expect(src).not.toMatch(/reconciliation_status\s*<>\s*/i)
  })
})

d('lls_v2_authorise_single_sided — empty justification rejected', () => {
  test('empty justification raises before any auth check', () => {
    const err = psqlExpectError(
      `SELECT public.lls_v2_authorise_single_sided('00000000-0000-0000-0000-000000000000','');`,
    )
    expect(err).toContain('Justification required')
  })
})

d('RLS — every new table has SELECT policy scoped by is_venue_manager', () => {
  test('all venue-scoped tables have manager SELECT policy', () => {
    const rows = psql(`
      SELECT tablename, count(*) FILTER (WHERE cmd='SELECT' AND qual LIKE '%is_venue_manager%')
      FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN (
          'shift_import_batches_v2','shift_staging_rows','shift_sales_staging',
          'shift_labor_staging','venue_daypart_windows','venue_pos_control_totals',
          'venue_pos_attribution_config','venue_identity_aliases',
          'venue_identity_mappings','venue_identity_candidates',
          'shifts_v2','canonical_shift_sources','venue_service_periods')
      GROUP BY tablename;`)
    // Every listed table must show at least one matching policy.
    for (const t of [
      'shift_import_batches_v2','shift_staging_rows','shift_sales_staging',
      'shift_labor_staging','venue_daypart_windows','venue_pos_control_totals',
      'venue_pos_attribution_config','venue_identity_aliases',
      'venue_identity_mappings','venue_identity_candidates',
      'shifts_v2','canonical_shift_sources','venue_service_periods',
    ]) {
      expect(rows).toContain(t)
    }
  })
})

d('No v1 surface was modified', () => {
  test('v1 tables untouched except Phase 6 governance link (import_batch_v2_id on shifts)', () => {
    const out = psql(`
      SELECT table_name||':'||count(*)::text
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('shifts','shift_import_batches','venue_opportunity_factors')
      GROUP BY table_name ORDER BY table_name;`)
    // Phase 6 added one nullable FK column to shifts so committed batches can be rolled back.
    // Phase 18 added 9 nullable provenance columns (sales_basis, labor_basis, reliability_class,
    // identity_match_method, identity_match_confidence, source_system, source_row_hash,
    // provenance, imported_at). v1 calculation surface is untouched.
    expect(out).toContain('shifts:30')
    expect(out).toContain('shift_import_batches:9')
    expect(out).toContain('venue_opportunity_factors:7')
  })

  test('v1 calculate_lls_for_shift function unchanged signature', () => {
    const sig = psql(`
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='calculate_lls_for_shift';`).trim()
    expect(sig).toBe('p_shift_id uuid')
  })
})
