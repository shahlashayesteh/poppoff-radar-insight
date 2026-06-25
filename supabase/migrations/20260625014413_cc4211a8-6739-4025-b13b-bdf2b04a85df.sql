
-- =====================================================================
-- Phase 7 — Employee Identity Matching
-- =====================================================================

-- 1. employee_master ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  outlet_id text,
  display_name text NOT NULL,
  normalised_name text NOT NULL,
  pos_employee_id text,
  labour_employee_id text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','merged','review')),
  manager_confirmed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, normalised_name)
);
CREATE INDEX IF NOT EXISTS idx_employee_master_venue ON public.employee_master(venue_id);
CREATE INDEX IF NOT EXISTS idx_employee_master_pos ON public.employee_master(venue_id, pos_employee_id) WHERE pos_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_master_labour ON public.employee_master(venue_id, labour_employee_id) WHERE labour_employee_id IS NOT NULL;

GRANT SELECT ON public.employee_master TO authenticated;
GRANT ALL ON public.employee_master TO service_role;
ALTER TABLE public.employee_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee master readable by venue manager"
  ON public.employee_master FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- 2. source_employee_ids ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.source_employee_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  employee_master_id uuid NOT NULL REFERENCES public.employee_master(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_employee_id text NOT NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, source_system, source_employee_id)
);
CREATE INDEX IF NOT EXISTS idx_source_employee_ids_master ON public.source_employee_ids(employee_master_id);

GRANT SELECT ON public.source_employee_ids TO authenticated;
GRANT ALL ON public.source_employee_ids TO service_role;
ALTER TABLE public.source_employee_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source employee ids readable by venue manager"
  ON public.source_employee_ids FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- 3. shift_staging_rows identity governance columns -------------------
ALTER TABLE public.shift_staging_rows
  ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'pending'
    CHECK (identity_status IN ('pending','resolved','ambiguous','unmatched','excluded','new_unverified')),
  ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_confirmed_match boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reported_outlet text;

CREATE INDEX IF NOT EXISTS idx_staging_rows_identity_status
  ON public.shift_staging_rows(batch_id, identity_status);

-- 4. updated_at trigger reuse ----------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_employee_master_updated_at ON public.employee_master;
CREATE TRIGGER trg_employee_master_updated_at
  BEFORE UPDATE ON public.employee_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. commit RPC: block on unresolved identities -----------------------
CREATE OR REPLACE FUNCTION public.lls_v2_commit_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.shift_import_batches_v2%ROWTYPE;
  v_caller uuid := auth.uid();
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_inserted int := 0;
  v_unresolved int := 0;
  rec record;
  v_shift_id uuid;
  v_server_id text;
  v_start time;
  v_end time;
  v_daypart text;
  v_dow smallint;
  v_hour int;
BEGIN
  SELECT * INTO v_batch FROM public.shift_import_batches_v2 WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  IF v_caller IS NULL OR NOT public.is_venue_manager(v_batch.venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_batch.status NOT IN ('staged','needs_review','approved') THEN
    RAISE EXCEPTION 'invalid_status: %', v_batch.status;
  END IF;

  -- Phase 7: refuse commit if any non-excluded row still needs identity review.
  SELECT count(*) INTO v_unresolved
  FROM public.shift_staging_rows
  WHERE batch_id = _batch_id
    AND excluded_from_canonical = false
    AND reconciliation_status NOT IN ('excluded_duplicate','excluded_invalid')
    AND identity_status IN ('ambiguous','pending');
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'identity_unresolved: % row(s) require employee identity review or exclusion', v_unresolved;
  END IF;

  FOR rec IN
    SELECT sr.id AS staging_id, sr.source_kind, sr.service_date,
           sr.reported_identity_id, sr.reported_identity_name,
           sr.resolved_identity_id,
           ss.gross_sales, ss.net_sales, ss.covers,
           COALESCE(ss.sales_employee_shift_start, ss.sales_first_txn_time) AS sales_start,
           COALESCE(ss.sales_employee_shift_end,   ss.sales_last_txn_time)  AS sales_end,
           COALESCE(sl.labor_clock_in,  sl.labor_scheduled_start, sl.derived_labor_span_start) AS labor_start,
           COALESCE(sl.labor_clock_out, sl.labor_scheduled_end,   sl.derived_labor_span_end)   AS labor_end,
           sl.labor_cost,
           em.display_name AS canonical_name,
           em.pos_employee_id AS canonical_pos
    FROM public.shift_staging_rows sr
    LEFT JOIN public.shift_sales_staging ss ON ss.staging_row_id = sr.id
    LEFT JOIN public.shift_labor_staging sl ON sl.staging_row_id = sr.id
    LEFT JOIN public.employee_master em ON em.id = sr.resolved_identity_id
    WHERE sr.batch_id = _batch_id
      AND sr.excluded_from_canonical = false
      AND sr.reconciliation_status NOT IN ('excluded_duplicate','excluded_invalid')
      AND sr.identity_status IN ('resolved','new_unverified','unmatched')
      AND sr.service_date IS NOT NULL
  LOOP
    v_server_id := COALESCE(
      NULLIF(rec.canonical_pos, ''),
      NULLIF(rec.reported_identity_id, ''),
      CASE WHEN rec.resolved_identity_id IS NOT NULL
           THEN 'emp:' || rec.resolved_identity_id::text
           ELSE encode(sha256(COALESCE(rec.reported_identity_name,'')::bytea), 'hex')
      END
    );
    v_start := COALESCE(rec.sales_start::time, rec.labor_start::time, TIME '00:00:00');
    v_end   := COALESCE(rec.sales_end::time,   rec.labor_end::time);
    v_hour  := EXTRACT(HOUR FROM v_start)::int;
    v_daypart := CASE
      WHEN v_hour < 10 THEN 'breakfast'
      WHEN v_hour < 12 THEN 'brunch'
      WHEN v_hour < 16 THEN 'lunch'
      WHEN v_hour < 22 THEN 'dinner'
      ELSE 'late'
    END;
    v_dow := EXTRACT(DOW FROM rec.service_date)::smallint;

    INSERT INTO public.shifts (
      venue_id, server_id, server_name, shift_date, shift_start_time, shift_end_time,
      daypart, day_of_week, covers_served, gross_sales, labor_cost, import_batch_v2_id
    ) VALUES (
      v_batch.venue_id, v_server_id,
      COALESCE(rec.canonical_name, rec.reported_identity_name, 'Unknown'),
      rec.service_date, v_start, v_end,
      v_daypart, v_dow, rec.covers,
      COALESCE(rec.net_sales, rec.gross_sales),
      rec.labor_cost,
      _batch_id
    )
    ON CONFLICT (venue_id, server_id, shift_date, shift_start_time) DO UPDATE
    SET server_name = EXCLUDED.server_name,
        shift_end_time = COALESCE(EXCLUDED.shift_end_time, public.shifts.shift_end_time),
        covers_served = COALESCE(EXCLUDED.covers_served, public.shifts.covers_served),
        gross_sales   = COALESCE(EXCLUDED.gross_sales,   public.shifts.gross_sales),
        labor_cost    = COALESCE(EXCLUDED.labor_cost,    public.shifts.labor_cost),
        import_batch_v2_id = _batch_id,
        updated_at = now()
    RETURNING shift_id INTO v_shift_id;

    v_inserted_ids := array_append(v_inserted_ids, v_shift_id);
    v_inserted := v_inserted + 1;
    PERFORM public.calculate_lls_for_shift(v_shift_id);
  END LOOP;

  UPDATE public.shift_import_batches_v2
  SET status = 'committed',
      approved_by = COALESCE(approved_by, v_caller),
      approved_at = COALESCE(approved_at, now()),
      committed_at = now(),
      committed_shift_ids = v_inserted_ids,
      updated_at = now()
  WHERE id = _batch_id;

  INSERT INTO public.lls_v2_audit_events(venue_id, event_type, actor, payload)
  VALUES (v_batch.venue_id, 'batch_committed', v_caller,
          jsonb_build_object('batch_id', _batch_id, 'committed_shift_count', v_inserted));

  RETURN jsonb_build_object('committed', v_inserted, 'shift_ids', to_jsonb(v_inserted_ids));
END;
$$;
