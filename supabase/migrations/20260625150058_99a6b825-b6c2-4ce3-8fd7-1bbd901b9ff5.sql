
-- Phase 18A: write-through provenance in the import commit path.
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
  v_labour_mode text;
  v_labour_basis text;
  v_sales_basis text;
  v_reliability text;
  v_safety text;
  v_warnings jsonb;
  v_provenance jsonb;
  v_now timestamptz := now();
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

  -- Phase 18A: derive batch-level labour basis once.
  v_labour_mode := COALESCE(NULLIF(v_batch.labour_basis_summary->>'mode',''), 'unknown');
  v_labour_basis := CASE v_labour_mode
    WHEN 'wages_only' THEN 'wages_only'
    WHEN 'wages_plus_oncosts' THEN 'wages_plus_oncosts'
    ELSE 'unknown_estimated'
  END;

  FOR rec IN
    SELECT sr.id AS staging_id, sr.source_kind, sr.service_date,
           sr.reported_identity_id, sr.reported_identity_name,
           sr.resolved_identity_id, sr.identity_status,
           sr.identity_match_method, sr.identity_confidence,
           sr.raw_row_hash,
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

    -- Phase 18A: per-row sales basis derivation.
    v_sales_basis := CASE
      WHEN rec.net_sales IS NOT NULL THEN 'net'
      WHEN rec.gross_sales IS NOT NULL THEN 'gross_as_net_estimated'
      ELSE 'unknown'
    END;

    -- Phase 18A: reliability class derivation (matches src/lib/provenance.ts rules).
    v_reliability := CASE
      WHEN rec.identity_status IN ('new_unverified','unmatched') THEN 'estimated'
      WHEN v_sales_basis IN ('gross_as_net_estimated','unknown') THEN 'estimated'
      WHEN v_labour_basis = 'unknown_estimated' THEN 'estimated'
      WHEN rec.identity_confidence IS NOT NULL AND rec.identity_confidence < 0.5 THEN 'estimated'
      WHEN v_sales_basis = 'net' AND v_labour_basis IN ('wages_only','wages_plus_oncosts')
           AND rec.identity_status = 'resolved' THEN 'measured'
      ELSE 'derived'
    END;
    v_safety := CASE v_reliability
      WHEN 'measured' THEN 'safe_for_scoring'
      WHEN 'derived'  THEN 'safe_for_scoring'
      WHEN 'estimated' THEN 'warning'
      ELSE 'blocked'
    END;

    v_warnings := '[]'::jsonb;
    IF v_sales_basis = 'gross_as_net_estimated' THEN
      v_warnings := v_warnings || to_jsonb('gross_used_as_net'::text);
    ELSIF v_sales_basis = 'unknown' THEN
      v_warnings := v_warnings || to_jsonb('unknown_sales_basis'::text);
    END IF;
    IF v_labour_basis = 'unknown_estimated' THEN
      v_warnings := v_warnings || to_jsonb('unknown_labour_basis'::text);
    END IF;
    IF rec.identity_status = 'new_unverified' THEN
      v_warnings := v_warnings || to_jsonb('identity_unverified'::text);
    ELSIF rec.identity_status = 'unmatched' THEN
      v_warnings := v_warnings || to_jsonb('identity_unmatched'::text);
    END IF;

    v_provenance := jsonb_strip_nulls(jsonb_build_object(
      'source_system',             v_batch.source_system,
      'source_file',               v_batch.source_filename,
      'source_batch_id',           _batch_id::text,
      'source_row_id',             rec.staging_id::text,
      'source_row_hash',           rec.raw_row_hash,
      'source_file_hash',          v_batch.file_hash,
      'sales_basis',               v_sales_basis,
      'labor_basis',               v_labour_basis,
      'reliability_class',         v_reliability,
      'calculation_safety',        v_safety,
      'identity_match_method',     rec.identity_match_method,
      'identity_match_confidence', rec.identity_confidence,
      'identity_status',           rec.identity_status,
      'imported_at',               v_batch.created_at,
      'committed_at',              v_now,
      'venue_id',                  v_batch.venue_id::text
    )) || jsonb_build_object('warnings', v_warnings);

    INSERT INTO public.shifts (
      venue_id, server_id, server_name, shift_date, shift_start_time, shift_end_time,
      daypart, day_of_week, covers_served, gross_sales, labor_cost, import_batch_v2_id,
      sales_basis, labor_basis, reliability_class,
      source_system, source_row_hash,
      identity_match_method, identity_match_confidence,
      imported_at, provenance
    ) VALUES (
      v_batch.venue_id, v_server_id,
      COALESCE(rec.canonical_name, rec.reported_identity_name, 'Unknown'),
      rec.service_date, v_start, v_end,
      v_daypart, v_dow, rec.covers,
      COALESCE(rec.net_sales, rec.gross_sales),
      rec.labor_cost,
      _batch_id,
      v_sales_basis, v_labour_basis, v_reliability,
      v_batch.source_system, rec.raw_row_hash,
      rec.identity_match_method, rec.identity_confidence,
      v_batch.created_at, v_provenance
    )
    ON CONFLICT (venue_id, server_id, shift_date, shift_start_time) DO UPDATE
    SET server_name = EXCLUDED.server_name,
        shift_end_time = COALESCE(EXCLUDED.shift_end_time, public.shifts.shift_end_time),
        covers_served = COALESCE(EXCLUDED.covers_served, public.shifts.covers_served),
        gross_sales   = COALESCE(EXCLUDED.gross_sales,   public.shifts.gross_sales),
        labor_cost    = COALESCE(EXCLUDED.labor_cost,    public.shifts.labor_cost),
        import_batch_v2_id = _batch_id,
        sales_basis = EXCLUDED.sales_basis,
        labor_basis = EXCLUDED.labor_basis,
        reliability_class = EXCLUDED.reliability_class,
        source_system = EXCLUDED.source_system,
        source_row_hash = EXCLUDED.source_row_hash,
        identity_match_method = EXCLUDED.identity_match_method,
        identity_match_confidence = EXCLUDED.identity_match_confidence,
        imported_at = COALESCE(public.shifts.imported_at, EXCLUDED.imported_at),
        provenance = EXCLUDED.provenance,
        updated_at = now()
    RETURNING shift_id INTO v_shift_id;

    v_inserted_ids := array_append(v_inserted_ids, v_shift_id);
    v_inserted := v_inserted + 1;
    PERFORM public.calculate_lls_for_shift(v_shift_id);
  END LOOP;

  UPDATE public.shift_import_batches_v2
  SET status = 'committed',
      approved_by = COALESCE(approved_by, v_caller),
      approved_at = COALESCE(approved_at, v_now),
      committed_at = v_now,
      committed_shift_ids = v_inserted_ids,
      updated_at = v_now
  WHERE id = _batch_id;

  INSERT INTO public.lls_v2_audit_events(venue_id, event_type, actor, payload)
  VALUES (v_batch.venue_id, 'batch_committed', v_caller,
          jsonb_build_object(
            'batch_id', _batch_id,
            'committed_shift_count', v_inserted,
            'sales_basis_summary', v_batch.sales_basis_summary,
            'labour_basis_summary', v_batch.labour_basis_summary,
            'source_system', v_batch.source_system
          ));

  RETURN jsonb_build_object('committed', v_inserted, 'shift_ids', to_jsonb(v_inserted_ids));
END;
$$;
