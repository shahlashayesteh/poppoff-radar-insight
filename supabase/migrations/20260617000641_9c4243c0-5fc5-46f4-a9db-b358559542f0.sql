
-- =========================================================================
-- LLS v2 — Phase 2/3 completion migration
-- =========================================================================

-- ---------- 1. Feature flag columns on venues ----------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS lls_active_model_version text NOT NULL DEFAULT 'v1'
    CHECK (lls_active_model_version IN ('v1','v2')),
  ADD COLUMN IF NOT EXISTS lls_compare_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lls_v2_baseline_weeks integer NOT NULL DEFAULT 8
    CHECK (lls_v2_baseline_weeks IN (4,8,12));

-- ---------- 2. Extra staging columns ----------
ALTER TABLE public.shift_staging_rows
  ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'pending'
    CHECK (identity_status IN ('pending','resolved','new_unverified','conflict'));

-- ---------- 3. Extra canonical columns ----------
ALTER TABLE public.shifts_v2
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','incomplete','empty')),
  ADD COLUMN IF NOT EXISTS cross_daypart boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daypart_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS service_duration_tier text
    CHECK (service_duration_tier IS NULL OR service_duration_tier IN ('short','standard','long'));

-- ---------- 4. OF overrides table ----------
CREATE TABLE IF NOT EXISTS public.lls_v2_of_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  daypart text NOT NULL,
  duration_tier text NOT NULL CHECK (duration_tier IN ('short','standard','long')),
  override_of numeric NOT NULL CHECK (override_of >= 0.5 AND override_of <= 1.6),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lls_v2_of_overrides TO authenticated;
GRANT ALL ON public.lls_v2_of_overrides TO service_role;
ALTER TABLE public.lls_v2_of_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "of_overrides_select_manager" ON public.lls_v2_of_overrides
  FOR SELECT TO authenticated USING (public.is_venue_manager(venue_id));

CREATE INDEX IF NOT EXISTS ix_of_overrides_lookup
  ON public.lls_v2_of_overrides (venue_id, day_of_week, daypart, duration_tier, effective_from DESC);

-- ---------- 5. Versioned calculation results ----------
CREATE TABLE IF NOT EXISTS public.lls_v2_calculation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  result_scope text NOT NULL CHECK (result_scope IN ('shift','weekly_server')),
  shift_id uuid REFERENCES public.shifts_v2(id) ON DELETE SET NULL,
  identity_id uuid,
  week_start date,
  model_version text NOT NULL,
  of_version text NOT NULL,
  baseline_weeks integer NOT NULL,
  baseline_start date,
  baseline_end date,
  configuration_hash text NOT NULL,
  configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  system_of numeric,
  override_of numeric,
  effective_of numeric,
  of_components jsonb,
  comparable_count integer,
  rph numeric,
  rpc numeric,
  base_lls numeric,
  adjusted_labor_cost numeric,
  adjusted_lls numeric,
  comparable_base_lls numeric,
  comparable_adjusted_lls numeric,
  expected_sales numeric,
  revenue_gap numeric,
  modelled_revenue_opportunity numeric,
  performance_gap numeric,
  benchmark_confidence text CHECK (benchmark_confidence IN ('insufficient','low','medium','high')),
  result_confidence text CHECK (result_confidence IN ('insufficient','low','medium','high')),
  final_confidence text CHECK (final_confidence IN ('insufficient','low','medium','high')),
  rag_status text CHECK (rag_status IN ('green','amber','red','directional')),
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lls_v2_calculation_results TO authenticated;
GRANT ALL ON public.lls_v2_calculation_results TO service_role;
ALTER TABLE public.lls_v2_calculation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calc_results_select_manager" ON public.lls_v2_calculation_results
  FOR SELECT TO authenticated USING (public.is_venue_manager(venue_id));
CREATE INDEX IF NOT EXISTS ix_calc_results_lookup
  ON public.lls_v2_calculation_results (venue_id, result_scope, week_start, identity_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS ix_calc_results_shift
  ON public.lls_v2_calculation_results (shift_id) WHERE shift_id IS NOT NULL;

-- ---------- 6. Audit events ----------
CREATE TABLE IF NOT EXISTS public.lls_v2_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lls_v2_audit_events TO authenticated;
GRANT ALL ON public.lls_v2_audit_events TO service_role;
ALTER TABLE public.lls_v2_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_select_manager" ON public.lls_v2_audit_events
  FOR SELECT TO authenticated USING (public.is_venue_manager(venue_id));

-- ---------- 7. Recompute canonical totals from active sources ----------
CREATE OR REPLACE FUNCTION public.lls_v2_recalculate_canonical_totals(_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gross numeric := 0;
  v_net numeric := 0;
  v_covers integer := 0;
  v_hours numeric := 0;
  v_cost numeric := 0;
  v_has_sales boolean := false;
  v_has_labor boolean := false;
BEGIN
  SELECT
    COALESCE(SUM(ss.gross_sales),0),
    COALESCE(SUM(ss.net_sales),0),
    COALESCE(SUM(ss.covers),0),
    bool_or(true)
  INTO v_gross, v_net, v_covers, v_has_sales
  FROM public.canonical_shift_sources css
  JOIN public.shift_sales_staging ss ON ss.staging_row_id = css.staging_row_id
  WHERE css.shift_id = _shift_id AND css.is_active AND css.source_kind = 'sales';

  SELECT
    COALESCE(SUM(ls.labor_hours_reported),0),
    COALESCE(SUM(ls.labor_cost),0),
    bool_or(true)
  INTO v_hours, v_cost, v_has_labor
  FROM public.canonical_shift_sources css
  JOIN public.shift_labor_staging ls ON ls.staging_row_id = css.staging_row_id
  WHERE css.shift_id = _shift_id AND css.is_active AND css.source_kind = 'labor';

  UPDATE public.shifts_v2 SET
    gross_sales = v_gross,
    net_sales = v_net,
    covers = v_covers,
    hours_worked = v_hours,
    labor_cost = v_cost,
    hourly_rate = CASE WHEN v_hours > 0 AND v_cost > 0 THEN v_cost / v_hours ELSE NULL END,
    status = CASE
      WHEN v_has_sales AND v_has_labor THEN 'active'
      WHEN v_has_sales OR  v_has_labor THEN 'incomplete'
      ELSE 'empty' END,
    is_active = (v_has_sales OR v_has_labor),
    updated_at = now()
  WHERE id = _shift_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lls_v2_recalculate_canonical_totals(uuid) FROM PUBLIC;

-- ---------- 8. Completed reconciliation engine ----------
CREATE OR REPLACE FUNCTION public.lls_v2_run_reconciliation(_venue_id uuid, _batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promoted integer := 0;
  v_matched integer := 0;
  v_unmatched_sales integer := 0;
  v_unmatched_labor integer := 0;
  v_ambiguous integer := 0;
  v_periods integer := 0;
  v_from date;
  v_to   date;
  v_sales record;
  v_best record;
  v_second_score integer;
  v_shift_id uuid;
  v_clock_in timestamptz;
  v_sched_start timestamptz;
  v_start_min timestamptz;
  v_end_max timestamptz;
  v_daypart text;
  v_duration_hours numeric;
  v_tier text;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('lls_v2_recon:'||_venue_id::text||':'||_batch_id::text, 0)
  );

  -- Safeguard J: promote eligible survivors into ready_for_matching.
  UPDATE public.shift_staging_rows
  SET reconciliation_status = 'ready_for_matching',
      last_reconciled_at = now(),
      updated_at = now()
  WHERE venue_id = _venue_id
    AND batch_id = _batch_id
    AND reconciliation_status = 'pending'
    AND resolved_identity_id IS NOT NULL
    AND duplicate_status IN ('unique','confirmed_distinct')
    AND excluded_from_canonical = false;
  GET DIAGNOSTICS v_promoted = ROW_COUNT;

  -- Iterate sales rows in the positive allowlist; build pair scores against labor rows.
  FOR v_sales IN
    SELECT sr.id, sr.resolved_identity_id, sr.service_date,
           ss.sales_employee_shift_start, ss.sales_employee_shift_end,
           ss.sales_first_txn_time, ss.sales_check_open_time,
           ss.gross_sales, ss.net_sales, ss.covers
      FROM public.shift_staging_rows sr
      JOIN public.shift_sales_staging ss ON ss.staging_row_id = sr.id
     WHERE sr.venue_id = _venue_id
       AND sr.batch_id = _batch_id
       AND sr.source_kind = 'sales'
       AND sr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
  LOOP
    -- Build scored candidates.
    WITH cand AS (
      SELECT
        lr.id AS labor_staging_id,
        ls.labor_clock_in, ls.labor_scheduled_start, ls.labor_clock_out,
        ls.labor_hours_reported, ls.labor_cost,
        -- ID match (identities equal). Identity is resolved at promotion time.
        (CASE WHEN lr.resolved_identity_id = v_sales.resolved_identity_id THEN 100 ELSE -100 END)
        + (CASE WHEN v_sales.sales_employee_shift_start IS NOT NULL
                  AND ls.labor_clock_in IS NOT NULL
                  AND abs(extract(epoch FROM (v_sales.sales_employee_shift_start - ls.labor_clock_in))) <= 900
                THEN 40 ELSE 0 END)
        + (CASE WHEN v_sales.sales_employee_shift_start IS NOT NULL
                  AND ls.labor_scheduled_start IS NOT NULL
                  AND abs(extract(epoch FROM (v_sales.sales_employee_shift_start - ls.labor_scheduled_start))) <= 900
                THEN 30 ELSE 0 END)
        + (CASE WHEN v_sales.sales_first_txn_time IS NOT NULL
                  AND ls.labor_clock_in IS NOT NULL
                  AND v_sales.sales_first_txn_time BETWEEN ls.labor_clock_in - interval '15 minutes'
                                                       AND ls.labor_clock_in + interval '15 minutes'
                THEN 20 ELSE 0 END)
        + (CASE WHEN v_sales.sales_check_open_time IS NOT NULL
                  AND ls.labor_clock_in IS NOT NULL
                  AND v_sales.sales_check_open_time BETWEEN ls.labor_clock_in - interval '15 minutes'
                                                        AND ls.labor_clock_in + interval '15 minutes'
                THEN 15 ELSE 0 END) AS score
      FROM public.shift_staging_rows lr
      JOIN public.shift_labor_staging ls ON ls.staging_row_id = lr.id
      WHERE lr.venue_id = _venue_id
        AND lr.source_kind = 'labor'
        AND lr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
        AND lr.service_date = v_sales.service_date
        AND lr.resolved_identity_id = v_sales.resolved_identity_id
        AND NOT EXISTS (
          SELECT 1 FROM public.canonical_shift_sources css
          WHERE css.staging_row_id = lr.id AND css.is_active
        )
    )
    SELECT * INTO v_best FROM cand ORDER BY score DESC LIMIT 1;

    IF v_best.labor_staging_id IS NULL THEN
      UPDATE public.shift_staging_rows
        SET reconciliation_status = 'unmatched_sales', updated_at = now()
        WHERE id = v_sales.id AND reconciliation_status = 'ready_for_matching';
      v_unmatched_sales := v_unmatched_sales + 1;
      CONTINUE;
    END IF;

    SELECT score INTO v_second_score
    FROM (
      SELECT score FROM (
        SELECT
          (CASE WHEN lr.resolved_identity_id = v_sales.resolved_identity_id THEN 100 ELSE -100 END)
          + (CASE WHEN v_sales.sales_employee_shift_start IS NOT NULL AND ls.labor_clock_in IS NOT NULL
                  AND abs(extract(epoch FROM (v_sales.sales_employee_shift_start - ls.labor_clock_in))) <= 900
                  THEN 40 ELSE 0 END) AS score
        FROM public.shift_staging_rows lr
        JOIN public.shift_labor_staging ls ON ls.staging_row_id = lr.id
        WHERE lr.venue_id = _venue_id AND lr.source_kind = 'labor'
          AND lr.reconciliation_status = 'ready_for_matching'
          AND lr.service_date = v_sales.service_date
          AND lr.resolved_identity_id = v_sales.resolved_identity_id
          AND lr.id <> v_best.labor_staging_id
          AND NOT EXISTS (SELECT 1 FROM public.canonical_shift_sources css WHERE css.staging_row_id = lr.id AND css.is_active)
      ) s ORDER BY score DESC LIMIT 1
    ) x;

    IF v_best.score < 60 OR (v_second_score IS NOT NULL AND v_best.score - v_second_score < 20) THEN
      UPDATE public.shift_staging_rows
        SET reconciliation_status = 'time_ambiguous',
            status_evidence = status_evidence || jsonb_build_object('best_score', v_best.score, 'second_score', v_second_score),
            updated_at = now()
        WHERE id = v_sales.id;
      v_ambiguous := v_ambiguous + 1;
      CONTINUE;
    END IF;

    v_clock_in := v_best.labor_clock_in;
    v_sched_start := v_best.labor_scheduled_start;
    v_start_min := LEAST(
      COALESCE(v_clock_in, v_sched_start, v_sales.sales_employee_shift_start, v_sales.sales_first_txn_time),
      COALESCE(v_sales.sales_employee_shift_start, v_sales.sales_first_txn_time, v_clock_in, v_sched_start)
    );
    v_end_max := GREATEST(
      COALESCE(v_best.labor_clock_out, v_sales.sales_employee_shift_end, v_start_min),
      COALESCE(v_sales.sales_employee_shift_end, v_best.labor_clock_out, v_start_min)
    );
    v_duration_hours := EXTRACT(EPOCH FROM (v_end_max - v_start_min)) / 3600.0;
    v_tier := CASE
      WHEN v_duration_hours < 4 THEN 'short'
      WHEN v_duration_hours < 7 THEN 'standard'
      ELSE 'long' END;

    -- Dominant daypart from configured windows; fallback 'dinner'.
    SELECT vdw.daypart INTO v_daypart
      FROM public.venue_daypart_windows vdw
     WHERE vdw.venue_id = _venue_id
       AND vdw.day_of_week = EXTRACT(DOW FROM v_sales.service_date)::smallint
       AND vdw.start_time <= (v_start_min AT TIME ZONE 'UTC')::time
       AND vdw.end_time   >= (v_start_min AT TIME ZONE 'UTC')::time
     ORDER BY vdw.effective_from DESC LIMIT 1;
    IF v_daypart IS NULL THEN v_daypart := 'dinner'; END IF;

    INSERT INTO public.shifts_v2 (
      venue_id, canonical_identity_id, service_date, clock_in, clock_out,
      hours_worked, labor_cost, hourly_rate, gross_sales, net_sales, covers,
      dominant_daypart, active_batch_id, is_active, status, service_duration_tier
    ) VALUES (
      _venue_id, v_sales.resolved_identity_id, v_sales.service_date,
      v_start_min, v_end_max,
      v_best.labor_hours_reported, v_best.labor_cost,
      CASE WHEN v_best.labor_hours_reported > 0 AND v_best.labor_cost > 0 THEN v_best.labor_cost / v_best.labor_hours_reported END,
      v_sales.gross_sales, v_sales.net_sales, v_sales.covers,
      v_daypart, _batch_id, true, 'active', v_tier
    ) RETURNING id INTO v_shift_id;

    INSERT INTO public.canonical_shift_sources (shift_id, staging_row_id, venue_id, batch_id, source_kind, is_active)
    VALUES (v_shift_id, v_sales.id, _venue_id, _batch_id, 'sales', true);
    INSERT INTO public.canonical_shift_sources (shift_id, staging_row_id, venue_id, batch_id, source_kind, is_active)
    VALUES (v_shift_id, v_best.labor_staging_id, _venue_id, _batch_id, 'labor', true);

    UPDATE public.shift_staging_rows
      SET reconciliation_status = 'matched', updated_at = now()
      WHERE id IN (v_sales.id, v_best.labor_staging_id);

    v_matched := v_matched + 1;
  END LOOP;

  -- Remaining labor rows still in ready_for_matching are unmatched_labor.
  UPDATE public.shift_staging_rows
    SET reconciliation_status = 'unmatched_labor', updated_at = now()
    WHERE venue_id = _venue_id AND batch_id = _batch_id
      AND source_kind = 'labor' AND reconciliation_status = 'ready_for_matching';
  GET DIAGNOSTICS v_unmatched_labor = ROW_COUNT;

  SELECT min(service_date), max(service_date) INTO v_from, v_to
    FROM public.shift_staging_rows WHERE venue_id = _venue_id AND batch_id = _batch_id;

  IF v_from IS NOT NULL THEN
    v_periods := public.lls_v2_refresh_service_periods(_venue_id, v_from, v_to);
  END IF;

  INSERT INTO public.lls_v2_audit_events (venue_id, event_type, actor, payload)
  VALUES (_venue_id, 'reconciliation_run', auth.uid(),
          jsonb_build_object('batch_id', _batch_id, 'promoted', v_promoted,
                             'matched', v_matched, 'unmatched_sales', v_unmatched_sales,
                             'unmatched_labor', v_unmatched_labor, 'ambiguous', v_ambiguous,
                             'service_periods', v_periods));

  RETURN jsonb_build_object(
    'promoted', v_promoted,
    'matched', v_matched,
    'unmatched_sales', v_unmatched_sales,
    'unmatched_labor', v_unmatched_labor,
    'ambiguous', v_ambiguous,
    'service_periods_refreshed', v_periods,
    'batch_id', _batch_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lls_v2_run_reconciliation(uuid, uuid) FROM PUBLIC;
