/**
 * LLS v2 — Phase 2 reconciliation integration tests.
 *
 * Exercises the no-time sole-in-daypart fallback wired into
 * public.lls_v2_run_reconciliation, plus the activation-gate
 * safeguards: idempotency, active-source exclusion, partial
 * unique index, and atomic rollback.
 *
 * Skipped automatically when PGHOST is not set.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const HAS_DB = !!process.env.PGHOST
const d = HAS_DB ? describe : describe.skip

function psql(sql: string): string {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', '-X'], {
    encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'],
  })
}
function psqlErr(sql: string): string {
  try {
    execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', '-X'], {
      encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'],
    })
    return ''
  } catch (e: any) {
    return String(e.stderr ?? e.message ?? '')
  }
}

interface Fx { venue: string; manager: string; serviceDate: string; jwt: string }

// Shared fixture: real existing manager (auth.users FK), brand-new TEST venue.
let fx: Fx
beforeAll(() => {
  if (!HAS_DB) return
  const manager = psql(`SELECT manager_id FROM public.venues WHERE manager_id IS NOT NULL LIMIT 1;`).trim()
  if (!manager) throw new Error('no auth user available to seed test venue')
  const venue = randomUUID()
  const serviceDate = '2026-06-15' // Monday (DOW=1)
  const jwt = JSON.stringify({ sub: manager, role: 'authenticated' })
  psql(`
    INSERT INTO public.venues (id, manager_id, name, join_code)
    VALUES ('${venue}','${manager}','TEST_RECON_${venue.slice(0,8)}','T${venue.slice(0,5)}');
    INSERT INTO public.venue_daypart_windows
      (venue_id, day_of_week, daypart, start_time, end_time, effective_from)
    VALUES
      ('${venue}',1,'lunch','11:00','15:00','2020-01-01'),
      ('${venue}',1,'dinner','17:00','23:00','2020-01-01');
  `)
  fx = { venue, manager, serviceDate, jwt }
})

afterAll(() => {
  // psql role lacks DELETE on venues; test rows are tagged TEST_RECON_* for offline cleanup.
})

// Seed a batch using a FRESH identity per call so the
// uq_shifts_v2_active_identity_date partial unique index doesn't collide
// between independent test cases that share the same date.
interface SalesSeed { anchor?: string | null; firstTxn?: string | null; gross: number; empTime?: string | null }
interface LaborSeed { clockIn: string; clockOut?: string; hours: number; cost: number }
function seedBatch(
  sales: SalesSeed[], labor: LaborSeed[],
  opts: { identity?: string } = {},
): { batch: string; identity: string; salesIds: string[]; laborIds: string[] } {
  const batch = randomUUID()
  const identity = opts.identity ?? randomUUID()
  const stagingSales = sales.map(() => randomUUID())
  const stagingLabor = labor.map(() => randomUUID())
  let sql = `
    INSERT INTO public.shift_import_batches_v2 (id, venue_id, uploaded_by, source_kind, source_filename, row_count)
    VALUES ('${batch}','${fx.venue}','${fx.manager}','combined','test.csv',${sales.length + labor.length});
  `
  sales.forEach((s, i) => {
    const sid = stagingSales[i]
    sql += `
      INSERT INTO public.shift_staging_rows
        (id, venue_id, batch_id, source_kind, source_row_index, raw_row, raw_row_hash,
         service_date, resolved_identity_id, identity_status, duplicate_status, reconciliation_status)
      VALUES
        ('${sid}','${fx.venue}','${batch}','sales',${i},'{}'::jsonb,'h_s_${sid}',
         '${fx.serviceDate}','${identity}','resolved','unique','pending');
      INSERT INTO public.shift_sales_staging
        (staging_row_id, venue_id, batch_id, sales_first_txn_time,
         sales_report_period_start, sales_report_period_end,
         sales_employee_shift_start, sales_employee_shift_end, gross_sales, net_sales, covers)
      VALUES
        ('${sid}','${fx.venue}','${batch}',
         ${s.firstTxn ? `'${s.firstTxn}'` : 'NULL'},
         ${s.anchor ? `'${s.anchor}'` : 'NULL'},
         ${s.anchor ? `'${s.anchor}'::timestamptz + interval '4 hours'` : 'NULL'},
         ${s.empTime ? `'${s.empTime}'` : 'NULL'},
         ${s.empTime ? `'${s.empTime}'::timestamptz + interval '4 hours'` : 'NULL'},
         ${s.gross}, ${s.gross * 0.85}, 20);
    `
  })
  labor.forEach((l, i) => {
    const lid = stagingLabor[i]
    sql += `
      INSERT INTO public.shift_staging_rows
        (id, venue_id, batch_id, source_kind, source_row_index, raw_row, raw_row_hash,
         service_date, resolved_identity_id, identity_status, duplicate_status, reconciliation_status)
      VALUES
        ('${lid}','${fx.venue}','${batch}','labor',${i + sales.length},'{}'::jsonb,'h_l_${lid}',
         '${fx.serviceDate}','${identity}','resolved','unique','pending');
      INSERT INTO public.shift_labor_staging
        (staging_row_id, venue_id, batch_id, labor_clock_in, labor_clock_out,
         labor_hours_reported, labor_cost)
      VALUES
        ('${lid}','${fx.venue}','${batch}','${l.clockIn}',
         ${l.clockOut ? `'${l.clockOut}'` : `'${l.clockIn}'::timestamptz + interval '${l.hours} hours'`},
         ${l.hours}, ${l.cost});
    `
  })
  psql(sql)
  return { batch, identity, salesIds: stagingSales, laborIds: stagingLabor }
}


function reconcile(batch: string): Record<string, number | string> {
  const out = psql(`
    SELECT set_config('request.jwt.claims', '${fx.jwt}', false);
    SELECT public.lls_v2_run_reconciliation('${fx.venue}','${batch}')::text;
  `).trim().split('\n').slice(-1)[0]
  return JSON.parse(out)
}

d('no-time sole-in-daypart fallback — happy path', () => {
  test('one eligible labour shift in dominant daypart → one canonical shift', () => {
    const { batch, salesIds, laborIds } = seedBatch(
      // sales row with no employee time, lunch report period
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 1000 }],
      // one labour shift clocking in at 11:30 (lunch window)
      [{ clockIn: `${fx.serviceDate}T11:30:00Z`, hours: 4, cost: 60 }],
    )
    const res = reconcile(batch)
    expect(res.matched).toBe(1)
    expect(res.matched_no_time).toBe(1)
    const cs = psql(
      `SELECT count(*)||'|'||string_agg(match_method,',') FROM public.shifts_v2 WHERE active_batch_id='${batch}';`,
    ).trim()
    expect(cs).toBe('1|no_time_sole_in_daypart')
    const conf = psql(
      `SELECT confidence_breakdown->>'confidence_band' FROM public.shifts_v2 WHERE active_batch_id='${batch}';`,
    ).trim()
    expect(conf).toBe('low')
    const css = psql(
      `SELECT count(*)||'|'||round(avg(match_confidence),2)::text FROM public.canonical_shift_sources WHERE batch_id='${batch}' AND is_active;`,
    ).trim()
    expect(css).toBe('2|0.30')
    const status = psql(
      `SELECT reconciliation_status FROM public.shift_staging_rows WHERE id IN ('${salesIds[0]}','${laborIds[0]}') ORDER BY source_kind;`,
    ).trim().split('\n').sort()
    expect(status).toEqual(['matched', 'matched'])
  })
})

d('no-time fallback — ambiguous and unmatched', () => {
  test('multiple eligible labour shifts → time_ambiguous, no canonical shift', () => {
    const { batch, salesIds } = seedBatch(
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 800 }],
      [
        { clockIn: `${fx.serviceDate}T11:30:00Z`, hours: 4, cost: 60 },
        { clockIn: `${fx.serviceDate}T12:30:00Z`, hours: 3, cost: 50 },
      ],
    )
    const res = reconcile(batch)
    expect(res.matched).toBe(0)
    expect(res.ambiguous).toBe(1)
    const cs = psql(`SELECT count(*) FROM public.shifts_v2 WHERE active_batch_id='${batch}';`).trim()
    expect(cs).toBe('0')
    const st = psql(`SELECT reconciliation_status FROM public.shift_staging_rows WHERE id='${salesIds[0]}';`).trim()
    expect(st).toBe('time_ambiguous')
  })

  test('zero eligible labour shifts → unmatched_sales', () => {
    const { batch, salesIds } = seedBatch(
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 500 }],
      [{ clockIn: `${fx.serviceDate}T19:00:00Z`, hours: 5, cost: 80 }], // dinner not lunch
    )
    const res = reconcile(batch)
    expect(res.matched).toBe(0)
    expect(res.unmatched_sales).toBe(1)
    const st = psql(`SELECT reconciliation_status FROM public.shift_staging_rows WHERE id='${salesIds[0]}';`).trim()
    expect(st).toBe('unmatched_sales')
  })
})

d('active-source exclusion + idempotency', () => {
  test('labour already attached via active provenance cannot be reused; rerun is idempotent', () => {
    const { batch } = seedBatch(
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 700 }],
      [{ clockIn: `${fx.serviceDate}T11:45:00Z`, hours: 4, cost: 65 }],
    )
    const r1 = reconcile(batch)
    expect(r1.matched).toBe(1)
    const shiftsAfter1 = psql(`SELECT count(*) FROM public.shifts_v2 WHERE active_batch_id='${batch}';`).trim()
    const cssAfter1 = psql(`SELECT count(*) FROM public.canonical_shift_sources WHERE batch_id='${batch}' AND is_active;`).trim()
    const r2 = reconcile(batch) // same batch, second run
    expect(r2.matched).toBe(0)            // nothing new
    expect(r2.promoted).toBe(0)
    const shiftsAfter2 = psql(`SELECT count(*) FROM public.shifts_v2 WHERE active_batch_id='${batch}';`).trim()
    const cssAfter2 = psql(`SELECT count(*) FROM public.canonical_shift_sources WHERE batch_id='${batch}' AND is_active;`).trim()
    expect(shiftsAfter2).toBe(shiftsAfter1)
    expect(cssAfter2).toBe(cssAfter1)
  })

  test('partial unique index forbids a second active source for the same staging row', () => {
    const { batch, salesIds, laborIds } = seedBatch(
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 400 }],
      [{ clockIn: `${fx.serviceDate}T12:00:00Z`, hours: 4, cost: 55 }],
    )
    reconcile(batch)
    const shiftId = psql(`SELECT id FROM public.shifts_v2 WHERE active_batch_id='${batch}' LIMIT 1;`).trim()
    expect(shiftId.length).toBeGreaterThan(0)
    const err = psqlErr(`
      INSERT INTO public.canonical_shift_sources
        (shift_id, staging_row_id, venue_id, batch_id, source_kind, is_active)
      VALUES
        ('${shiftId}','${laborIds[0]}','${fx.venue}','${batch}','labor', true);
    `)
    expect(err).toMatch(/uq_css_active_staging|duplicate key/i)
    // sanity touch
    expect(salesIds.length).toBe(1)
  })
})

d('atomic rollback', () => {
  test('a forced failure inside the transaction rolls back the entire reconcile run', () => {
    const { batch, salesIds } = seedBatch(
      [{ anchor: `${fx.serviceDate}T12:00:00Z`, gross: 900 }],
      [{ clockIn: `${fx.serviceDate}T11:30:00Z`, hours: 4, cost: 70 }],
    )
    // Run reconcile then RAISE inside the same transaction → expect ROLLBACK.
    const err = psqlErr(`
      BEGIN;
      SELECT set_config('request.jwt.claims', '${fx.jwt}', false);
      SELECT public.lls_v2_run_reconciliation('${fx.venue}','${batch}');
      DO $$ BEGIN RAISE EXCEPTION 'forced'; END $$;
      COMMIT;
    `)
    expect(err).toContain('forced')
    const shifts = psql(`SELECT count(*) FROM public.shifts_v2 WHERE active_batch_id='${batch}';`).trim()
    const css = psql(`SELECT count(*) FROM public.canonical_shift_sources WHERE batch_id='${batch}';`).trim()
    const stagingStatus = psql(
      `SELECT reconciliation_status FROM public.shift_staging_rows WHERE id='${salesIds[0]}';`,
    ).trim()
    expect(shifts).toBe('0')
    expect(css).toBe('0')
    expect(stagingStatus).toBe('pending') // never advanced
  })
})

d('activation-gate invariants — v2 stays shadow', () => {
  test('every venue keeps lls_active_model_version = v1', () => {
    const bad = psql(
      `SELECT count(*) FROM public.venues WHERE lls_active_model_version IS DISTINCT FROM 'v1' AND id <> '${fx?.venue ?? '00000000-0000-0000-0000-000000000000'}';`,
    ).trim()
    expect(bad).toBe('0')
  })
  test('lls_compare_mode is false everywhere unless explicitly enabled (none in baseline)', () => {
    const enabled = psql(`SELECT count(*) FROM public.venues WHERE lls_compare_mode = true;`).trim()
    expect(enabled).toBe('0')
  })
})
