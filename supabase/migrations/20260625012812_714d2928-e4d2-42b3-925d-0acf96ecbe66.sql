
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

  FOR rec IN
    SELECT sr.id AS staging_id, sr.source_kind, sr.service_date,
           sr.reported_identity_id, sr.reported_identity_name,
           ss.gross_sales, ss.net_sales, ss.covers,
           COALESCE(ss.sales_employee_shift_start, ss.sales_first_txn_time) AS sales_start,
           COALESCE(ss.sales_employee_shift_end,   ss.sales_last_txn_time)  AS sales_end,
           COALESCE(sl.labor_clock_in,  sl.labor_scheduled_start, sl.derived_labor_span_start) AS labor_start,
           COALESCE(sl.labor_clock_out, sl.labor_scheduled_end,   sl.derived_labor_span_end)   AS labor_end,
           sl.labor_cost
    FROM public.shift_staging_rows sr
    LEFT JOIN public.shift_sales_staging ss ON ss.staging_row_id = sr.id
    LEFT JOIN public.shift_labor_staging sl ON sl.staging_row_id = sr.id
    WHERE sr.batch_id = _batch_id
      AND sr.excluded_from_canonical = false
      AND sr.reconciliation_status NOT IN ('excluded_duplicate','excluded_invalid')
      AND sr.service_date IS NOT NULL
      AND sr.reported_identity_name IS NOT NULL
  LOOP
    v_server_id := COALESCE(
      NULLIF(rec.reported_identity_id, ''),
      encode(sha256(rec.reported_identity_name::bytea), 'hex')
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
      v_batch.venue_id, v_server_id, rec.reported_identity_name, rec.service_date, v_start, v_end,
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
