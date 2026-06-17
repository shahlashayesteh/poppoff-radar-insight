CREATE OR REPLACE FUNCTION public.lls_v2_run_reconciliation(_venue_id uuid, _batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_promoted        integer := 0;
  v_matched         integer := 0;
  v_matched_no_time integer := 0;
  v_unmatched_sales integer := 0;
  v_unmatched_labor integer := 0;
  v_ambiguous       integer := 0;
  v_periods         integer := 0;
  v_from date; v_to date;
  v_sales record;
  v_best  record;
  v_second_score integer;
  v_shift_id uuid;
  v_start_min timestamptz; v_end_max timestamptz;
  v_daypart text;
  v_duration_hours numeric;
  v_tier text;
  v_anchor   timestamptz;
  v_anchor_t time;
  v_dow      smallint;
  v_cand_count integer;
  v_match_method text;
  v_match_conf   numeric;
  v_evidence     jsonb;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('lls_v2_recon:'||_venue_id::text||':'||_batch_id::text, 0)
  );

  -- Safeguard J: positive allowlist promotion.
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

  FOR v_sales IN
    SELECT sr.id, sr.resolved_identity_id, sr.service_date,
           ss.sales_employee_shift_start, ss.sales_employee_shift_end,
           ss.sales_first_txn_time, ss.sales_check_open_time,
           ss.sales_report_period_start, ss.sales_report_period_end,
           ss.gross_sales, ss.net_sales, ss.covers
      FROM public.shift_staging_rows sr
      JOIN public.shift_sales_staging ss ON ss.staging_row_id = sr.id
     WHERE sr.venue_id = _venue_id
       AND sr.batch_id = _batch_id
       AND sr.source_kind = 'sales'
       AND sr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
       AND sr.resolved_identity_id IS NOT NULL
       AND sr.service_date IS NOT NULL
  LOOP
    v_dow := EXTRACT(DOW FROM v_sales.service_date)::smallint;
    v_best := NULL; v_second_score := NULL; v_daypart := NULL;
    v_match_method := NULL; v_match_conf := NULL; v_evidence := '{}'::jsonb;

    IF v_sales.sales_employee_shift_start IS NULL
       AND v_sales.sales_employee_shift_end IS NULL THEN
      ------------------------------------------------------------------
      -- NO-TIME SOLE-IN-DAYPART FALLBACK
      ------------------------------------------------------------------
      IF v_sales.sales_report_period_start IS NOT NULL
         AND v_sales.sales_report_period_end IS NOT NULL THEN
        v_anchor := v_sales.sales_report_period_start
                    + (v_sales.sales_report_period_end
                       - v_sales.sales_report_period_start) / 2;
      ELSIF v_sales.sales_report_period_start IS NOT NULL THEN
        v_anchor := v_sales.sales_report_period_start;
      ELSE
        v_anchor := v_sales.sales_first_txn_time;
      END IF;

      IF v_anchor IS NULL THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'unmatched_sales',
               status_reason = 'no_time_no_anchor',
               status_evidence = COALESCE(status_evidence,'{}'::jsonb)
                                 || jsonb_build_object('match_path','no_time_sole_in_daypart','candidates',0),
               updated_at = now()
         WHERE id = v_sales.id;
        v_unmatched_sales := v_unmatched_sales + 1;
        CONTINUE;
      END IF;

      v_anchor_t := (v_anchor AT TIME ZONE 'UTC')::time;

      SELECT vdw.daypart INTO v_daypart
        FROM public.venue_daypart_windows vdw
       WHERE vdw.venue_id = _venue_id
         AND vdw.day_of_week = v_dow
         AND vdw.start_time <= v_anchor_t
         AND vdw.end_time   >  v_anchor_t
       ORDER BY vdw.effective_from DESC NULLS LAST
       LIMIT 1;

      IF v_daypart IS NULL THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'unmatched_sales',
               status_reason = 'no_time_no_daypart_window',
               status_evidence = COALESCE(status_evidence,'{}'::jsonb)
                                 || jsonb_build_object('match_path','no_time_sole_in_daypart',
                                                       'anchor', v_anchor, 'candidates',0),
               updated_at = now()
         WHERE id = v_sales.id;
        v_unmatched_sales := v_unmatched_sales + 1;
        CONTINUE;
      END IF;

      WITH cand AS (
        SELECT lr.id AS labor_staging_id,
               ls.labor_clock_in, ls.labor_scheduled_start,
               ls.labor_clock_out, ls.labor_scheduled_end,
               ls.labor_hours_reported, ls.labor_cost,
               COALESCE(ls.labor_clock_in, ls.labor_scheduled_start) AS lt
          FROM public.shift_staging_rows lr
          JOIN public.shift_labor_staging ls ON ls.staging_row_id = lr.id
         WHERE lr.venue_id = _venue_id
           AND lr.source_kind = 'labor'
           AND lr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
           AND lr.service_date = v_sales.service_date
           AND lr.resolved_identity_id = v_sales.resolved_identity_id
           AND COALESCE(ls.labor_clock_in, ls.labor_scheduled_start) IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.canonical_shift_sources css
              WHERE css.staging_row_id = lr.id AND css.is_active
           )
      ), in_dp AS (
        SELECT c.* FROM cand c
        JOIN public.venue_daypart_windows vdw
          ON vdw.venue_id = _venue_id
         AND vdw.day_of_week = v_dow
         AND vdw.daypart = v_daypart
         AND vdw.start_time <= (c.lt AT TIME ZONE 'UTC')::time
         AND vdw.end_time   >  (c.lt AT TIME ZONE 'UTC')::time
      )
      SELECT count(*) INTO v_cand_count FROM in_dp;

      v_evidence := jsonb_build_object(
        'match_path','no_time_sole_in_daypart',
        'anchor', v_anchor, 'daypart', v_daypart, 'candidates', v_cand_count
      );

      IF v_cand_count = 0 THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'unmatched_sales',
               status_reason = 'no_time_zero_candidates',
               status_evidence = COALESCE(status_evidence,'{}'::jsonb) || v_evidence,
               updated_at = now()
         WHERE id = v_sales.id;
        v_unmatched_sales := v_unmatched_sales + 1;
        CONTINUE;
      ELSIF v_cand_count > 1 THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'time_ambiguous',
               status_reason = 'no_time_multiple_candidates',
               status_evidence = COALESCE(status_evidence,'{}'::jsonb) || v_evidence,
               updated_at = now()
         WHERE id = v_sales.id;
        v_ambiguous := v_ambiguous + 1;
        CONTINUE;
      END IF;

      SELECT c.labor_staging_id, c.labor_clock_in, c.labor_scheduled_start,
             c.labor_clock_out, c.labor_scheduled_end,
             c.labor_hours_reported, c.labor_cost, NULL::integer AS score
        INTO v_best
        FROM (
          SELECT lr.id AS labor_staging_id,
                 ls.labor_clock_in, ls.labor_scheduled_start,
                 ls.labor_clock_out, ls.labor_scheduled_end,
                 ls.labor_hours_reported, ls.labor_cost,
                 COALESCE(ls.labor_clock_in, ls.labor_scheduled_start) AS lt
            FROM public.shift_staging_rows lr
            JOIN public.shift_labor_staging ls ON ls.staging_row_id = lr.id
           WHERE lr.venue_id = _venue_id
             AND lr.source_kind = 'labor'
             AND lr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
             AND lr.service_date = v_sales.service_date
             AND lr.resolved_identity_id = v_sales.resolved_identity_id
             AND COALESCE(ls.labor_clock_in, ls.labor_scheduled_start) IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM public.canonical_shift_sources css
                WHERE css.staging_row_id = lr.id AND css.is_active
             )
        ) c
        JOIN public.venue_daypart_windows vdw
          ON vdw.venue_id = _venue_id
         AND vdw.day_of_week = v_dow
         AND vdw.daypart = v_daypart
         AND vdw.start_time <= (c.lt AT TIME ZONE 'UTC')::time
         AND vdw.end_time   >  (c.lt AT TIME ZONE 'UTC')::time
        LIMIT 1;

      v_match_method := 'no_time_sole_in_daypart';
      v_match_conf   := 0.30;  -- low band
      v_matched_no_time := v_matched_no_time + 1;

      UPDATE public.shift_staging_rows
         SET status_evidence = COALESCE(status_evidence,'{}'::jsonb)
                               || (v_evidence
                                   || jsonb_build_object('labor_staging_id', v_best.labor_staging_id))
       WHERE id = v_sales.id;

    ELSE
      ------------------------------------------------------------------
      -- PRIMARY SCORED MATCHER
      ------------------------------------------------------------------
      WITH cand AS (
        SELECT lr.id AS labor_staging_id,
               ls.labor_clock_in, ls.labor_scheduled_start,
               ls.labor_clock_out, ls.labor_scheduled_end,
               ls.labor_hours_reported, ls.labor_cost,
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
                       AND v_sales.sales_first_txn_time
                           BETWEEN ls.labor_clock_in - interval '15 minutes'
                               AND ls.labor_clock_in + interval '15 minutes'
                     THEN 20 ELSE 0 END)
             + (CASE WHEN v_sales.sales_check_open_time IS NOT NULL
                       AND ls.labor_clock_in IS NOT NULL
                       AND v_sales.sales_check_open_time
                           BETWEEN ls.labor_clock_in - interval '15 minutes'
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
      SELECT labor_staging_id, labor_clock_in, labor_scheduled_start,
             labor_clock_out, labor_scheduled_end,
             labor_hours_reported, labor_cost, score
        INTO v_best
        FROM cand
        ORDER BY score DESC
        LIMIT 1;

      IF v_best.labor_staging_id IS NULL THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'unmatched_sales',
               status_reason = 'primary_no_candidate',
               updated_at = now()
         WHERE id = v_sales.id;
        v_unmatched_sales := v_unmatched_sales + 1;
        CONTINUE;
      END IF;

      SELECT score INTO v_second_score
        FROM (
          SELECT (CASE WHEN lr.resolved_identity_id = v_sales.resolved_identity_id THEN 100 ELSE -100 END)
               + (CASE WHEN v_sales.sales_employee_shift_start IS NOT NULL
                         AND ls.labor_clock_in IS NOT NULL
                         AND abs(extract(epoch FROM (v_sales.sales_employee_shift_start - ls.labor_clock_in))) <= 900
                       THEN 40 ELSE 0 END) AS score
            FROM public.shift_staging_rows lr
            JOIN public.shift_labor_staging ls ON ls.staging_row_id = lr.id
           WHERE lr.venue_id = _venue_id
             AND lr.source_kind = 'labor'
             AND lr.reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
             AND lr.service_date = v_sales.service_date
             AND lr.resolved_identity_id = v_sales.resolved_identity_id
             AND lr.id <> v_best.labor_staging_id
             AND NOT EXISTS (SELECT 1 FROM public.canonical_shift_sources css
                              WHERE css.staging_row_id = lr.id AND css.is_active)
           ORDER BY score DESC
           LIMIT 1
        ) x;

      IF v_best.score < 60
         OR (v_second_score IS NOT NULL AND v_best.score - v_second_score < 20) THEN
        UPDATE public.shift_staging_rows
           SET reconciliation_status = 'time_ambiguous',
               status_reason = 'primary_low_or_close_scores',
               status_evidence = COALESCE(status_evidence,'{}'::jsonb)
                                 || jsonb_build_object('match_path','primary',
                                                       'best_score', v_best.score,
                                                       'second_score', v_second_score),
               updated_at = now()
         WHERE id = v_sales.id;
        v_ambiguous := v_ambiguous + 1;
        CONTINUE;
      END IF;

      v_match_method := 'primary_score';
      v_match_conf   := LEAST(0.95::numeric, 0.50 + (v_best.score::numeric / 200.0));
      v_evidence := jsonb_build_object('match_path','primary',
                                       'best_score', v_best.score,
                                       'second_score', v_second_score);
    END IF;

    ------------------------------------------------------------------
    -- COMMON CANONICAL UPSERT + PROVENANCE
    ------------------------------------------------------------------
    v_start_min := COALESCE(v_best.labor_clock_in, v_best.labor_scheduled_start,
                            v_sales.sales_employee_shift_start, v_sales.sales_first_txn_time,
                            v_sales.sales_report_period_start);
    v_end_max := COALESCE(v_best.labor_clock_out, v_best.labor_scheduled_end,
                          v_sales.sales_employee_shift_end, v_sales.sales_report_period_end,
                          v_start_min);
    v_duration_hours := COALESCE(
      v_best.labor_hours_reported,
      CASE WHEN v_end_max > v_start_min
           THEN EXTRACT(EPOCH FROM (v_end_max - v_start_min)) / 3600.0
           ELSE NULL END
    );
    v_tier := CASE WHEN v_duration_hours IS NULL THEN NULL
                   WHEN v_duration_hours < 4 THEN 'short'
                   WHEN v_duration_hours < 7 THEN 'standard'
                   ELSE 'long' END;

    IF v_daypart IS NULL THEN
      SELECT vdw.daypart INTO v_daypart
        FROM public.venue_daypart_windows vdw
       WHERE vdw.venue_id = _venue_id
         AND vdw.day_of_week = v_dow
         AND vdw.start_time <= (v_start_min AT TIME ZONE 'UTC')::time
         AND vdw.end_time   >  (v_start_min AT TIME ZONE 'UTC')::time
       ORDER BY vdw.effective_from DESC NULLS LAST
       LIMIT 1;
    END IF;

    INSERT INTO public.shifts_v2 (
      venue_id, canonical_identity_id, service_date,
      scheduled_start, scheduled_end, clock_in, clock_out,
      labor_span_hours, service_duration_hours, service_duration_source,
      gross_sales, net_sales, covers, labor_cost,
      dominant_daypart, active_batch_id, is_active, status,
      service_duration_tier, match_method, confidence_breakdown
    ) VALUES (
      _venue_id, v_sales.resolved_identity_id, v_sales.service_date,
      v_best.labor_scheduled_start, v_best.labor_scheduled_end,
      v_best.labor_clock_in, v_best.labor_clock_out,
      v_best.labor_hours_reported, v_duration_hours, 'labor_span_fallback',
      v_sales.gross_sales, v_sales.net_sales, v_sales.covers, v_best.labor_cost,
      v_daypart, _batch_id, true, 'active',
      v_tier, v_match_method,
      jsonb_build_object(
        'method', v_match_method,
        'match_confidence', v_match_conf,
        'confidence_band', CASE WHEN v_match_method = 'no_time_sole_in_daypart' THEN 'low' ELSE 'medium' END,
        'evidence', v_evidence
      )
    ) RETURNING id INTO v_shift_id;

    INSERT INTO public.canonical_shift_sources
      (shift_id, staging_row_id, venue_id, batch_id, source_kind, is_active, match_confidence)
    VALUES
      (v_shift_id, v_sales.id, _venue_id, _batch_id, 'sales', true, v_match_conf),
      (v_shift_id, v_best.labor_staging_id, _venue_id, _batch_id, 'labor', true, v_match_conf);

    UPDATE public.shift_staging_rows
       SET reconciliation_status = 'matched', updated_at = now()
     WHERE id IN (v_sales.id, v_best.labor_staging_id);

    v_matched := v_matched + 1;
  END LOOP;

  -- Remaining labour rows still in ready_for_matching → unmatched_labour.
  UPDATE public.shift_staging_rows
     SET reconciliation_status = 'unmatched_labour', updated_at = now()
   WHERE venue_id = _venue_id AND batch_id = _batch_id
     AND source_kind = 'labor'
     AND reconciliation_status = 'ready_for_matching';
  GET DIAGNOSTICS v_unmatched_labor = ROW_COUNT;

  SELECT min(service_date), max(service_date) INTO v_from, v_to
    FROM public.shift_staging_rows
   WHERE venue_id = _venue_id AND batch_id = _batch_id;

  IF v_from IS NOT NULL THEN
    v_periods := public.lls_v2_refresh_service_periods(_venue_id, v_from, v_to);
  END IF;

  INSERT INTO public.lls_v2_audit_events (venue_id, event_type, actor, payload)
  VALUES (_venue_id, 'reconciliation_run', auth.uid(),
          jsonb_build_object('batch_id', _batch_id,
                             'promoted', v_promoted,
                             'matched', v_matched,
                             'matched_no_time', v_matched_no_time,
                             'unmatched_sales', v_unmatched_sales,
                             'unmatched_labour', v_unmatched_labor,
                             'ambiguous', v_ambiguous,
                             'service_periods', v_periods));

  RETURN jsonb_build_object(
    'promoted', v_promoted,
    'matched', v_matched,
    'matched_no_time', v_matched_no_time,
    'unmatched_sales', v_unmatched_sales,
    'unmatched_labour', v_unmatched_labor,
    'ambiguous', v_ambiguous,
    'service_periods_refreshed', v_periods,
    'batch_id', _batch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lls_v2_run_reconciliation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lls_v2_run_reconciliation(uuid, uuid) TO authenticated, service_role;