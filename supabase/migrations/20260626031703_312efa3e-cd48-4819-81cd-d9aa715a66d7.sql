
CREATE OR REPLACE FUNCTION public.lls_v2_purge_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.shift_import_batches_v2%ROWTYPE;
  v_caller uuid := auth.uid();
  v_deleted_shifts int := 0;
  v_deleted_staging int := 0;
  v_deleted_employees int := 0;
BEGIN
  SELECT * INTO v_batch FROM public.shift_import_batches_v2 WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  IF v_caller IS NULL OR NOT public.is_venue_manager(v_batch.venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- 1. Delete any committed shifts still tagged with this batch
  WITH d AS (
    DELETE FROM public.shifts WHERE import_batch_v2_id = _batch_id RETURNING shift_id
  ) SELECT count(*) INTO v_deleted_shifts FROM d;

  -- 2. Delete staging child rows, then parent
  DELETE FROM public.shift_sales_staging WHERE batch_id = _batch_id;
  DELETE FROM public.shift_labor_staging WHERE batch_id = _batch_id;
  WITH d AS (
    DELETE FROM public.shift_staging_rows WHERE batch_id = _batch_id RETURNING id
  ) SELECT count(*) INTO v_deleted_staging FROM d;

  -- 3. Delete orphan, manager-unconfirmed employee_master rows in this venue
  --    (only those with no remaining staging rows or committed shifts referencing them).
  WITH d AS (
    DELETE FROM public.employee_master em
    WHERE em.venue_id = v_batch.venue_id
      AND COALESCE(em.manager_confirmed, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.shift_staging_rows sr
        WHERE sr.resolved_identity_id = em.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.venue_id = em.venue_id
          AND (
            s.server_id = em.pos_employee_id
            OR s.server_id = em.labour_employee_id
            OR s.server_id = ('emp:' || em.id::text)
          )
      )
    RETURNING id
  ) SELECT count(*) INTO v_deleted_employees FROM d;

  -- 4. Audit
  INSERT INTO public.lls_v2_audit_events(venue_id, event_type, actor, payload)
  VALUES (v_batch.venue_id, 'batch_purged', v_caller,
          jsonb_build_object(
            'batch_id', _batch_id,
            'source_filename', v_batch.source_filename,
            'source_kind', v_batch.source_kind,
            'deleted_shifts', v_deleted_shifts,
            'deleted_staging_rows', v_deleted_staging,
            'deleted_employees', v_deleted_employees
          ));

  -- 5. Finally remove the batch record itself
  DELETE FROM public.shift_import_batches_v2 WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'deleted_shifts', v_deleted_shifts,
    'deleted_staging_rows', v_deleted_staging,
    'deleted_employees', v_deleted_employees
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lls_v2_purge_batch(uuid) TO authenticated;
