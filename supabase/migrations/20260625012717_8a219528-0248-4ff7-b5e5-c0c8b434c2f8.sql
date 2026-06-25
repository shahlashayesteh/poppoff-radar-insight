
-- Phase 6: Import staging governance fields + commit/rollback RPCs
-- Extends existing v2 staging schema (shift_import_batches_v2, shift_staging_rows)
-- Does NOT duplicate infrastructure. Does NOT touch LLS formulas or game mechanics.

-- 1. Extend shift_import_batches_v2 with governance fields
ALTER TABLE public.shift_import_batches_v2
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS import_type text
    CHECK (import_type IS NULL OR import_type IN ('sales','labour','menu','rota','mixed')),
  ADD COLUMN IF NOT EXISTS accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_total numeric,
  ADD COLUMN IF NOT EXISTS net_total numeric,
  ADD COLUMN IF NOT EXISTS labour_total numeric,
  ADD COLUMN IF NOT EXISTS covers_total numeric,
  ADD COLUMN IF NOT EXISTS sales_basis_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS labour_basis_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged','needs_review','approved','committed','rolled_back','failed')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS committed_shift_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS idx_batches_v2_status ON public.shift_import_batches_v2(venue_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_v2_file_hash ON public.shift_import_batches_v2(venue_id, file_hash);

-- 2. Tag shifts with the originating v2 batch for rollback
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS import_batch_v2_id uuid REFERENCES public.shift_import_batches_v2(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_import_batch_v2 ON public.shifts(import_batch_v2_id) WHERE import_batch_v2_id IS NOT NULL;

-- 3. RLS additions: managers may UPDATE their own batches (status transitions),
--    but writes still flow through SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "v2 batches manager update" ON public.shift_import_batches_v2;
CREATE POLICY "v2 batches manager update"
  ON public.shift_import_batches_v2
  FOR UPDATE TO authenticated
  USING (public.is_venue_manager(venue_id))
  WITH CHECK (public.is_venue_manager(venue_id));

-- 4. Commit RPC — copies accepted staging rows into public.shifts in a transaction.
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
  v_updated int := 0;
  rec record;
  v_shift_id uuid;
BEGIN
  SELECT * INTO v_batch FROM public.shift_import_batches_v2 WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  IF v_caller IS NULL OR NOT public.is_venue_manager(v_batch.venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_batch.status NOT IN ('staged','needs_review','approved') THEN
    RAISE EXCEPTION 'invalid_status: %', v_batch.status;
  END IF;

  -- Iterate accepted (non-excluded) staging rows
  FOR rec IN
    SELECT sr.id AS staging_id, sr.source_kind, sr.service_date,
           sr.reported_identity_id, sr.reported_identity_name, sr.resolved_identity_id,
           sr.raw_row,
           COALESCE(ss.gross_sales, NULL) AS gross_sales,
           COALESCE(ss.net_sales, NULL) AS net_sales,
           COALESCE(ss.covers, NULL) AS covers,
           COALESCE(ss.start_time, sl.start_time) AS start_time,
           COALESCE(ss.end_time, sl.end_time) AS end_time,
           COALESCE(ss.daypart, sl.daypart) AS daypart,
           COALESCE(sl.labour_cost, NULL) AS labour_cost
    FROM public.shift_staging_rows sr
    LEFT JOIN public.shift_sales_staging ss ON ss.staging_row_id = sr.id
    LEFT JOIN public.shift_labor_staging sl ON sl.staging_row_id = sr.id
    WHERE sr.batch_id = _batch_id
      AND sr.excluded_from_canonical = false
      AND sr.reconciliation_status NOT IN ('excluded_duplicate','excluded_invalid')
  LOOP
    -- Compute server_id (prefer reported_identity_id, else hash of name)
    DECLARE
      v_server_id text := COALESCE(NULLIF(rec.reported_identity_id, ''), encode(sha256(COALESCE(rec.reported_identity_name,'')::bytea), 'hex'));
      v_start time := COALESCE(rec.start_time::time, TIME '00:00:00');
      v_daypart text := COALESCE(rec.daypart, 'dinner');
      v_dow smallint := EXTRACT(DOW FROM rec.service_date)::smallint;
    BEGIN
      IF rec.service_date IS NULL OR rec.reported_identity_name IS NULL THEN
        CONTINUE;
      END IF;

      -- Upsert into public.shifts
      INSERT INTO public.shifts (
        venue_id, server_id, server_name, shift_date, shift_start_time, shift_end_time,
        daypart, day_of_week, covers_served, gross_sales, labor_cost,
        import_batch_v2_id
      ) VALUES (
        v_batch.venue_id, v_server_id, rec.reported_identity_name, rec.service_date, v_start, rec.end_time::time,
        v_daypart, v_dow, rec.covers, COALESCE(rec.net_sales, rec.gross_sales), rec.labour_cost,
        _batch_id
      )
      ON CONFLICT (venue_id, server_id, shift_date, shift_start_time) DO UPDATE
      SET server_name = EXCLUDED.server_name,
          covers_served = COALESCE(EXCLUDED.covers_served, public.shifts.covers_served),
          gross_sales = COALESCE(EXCLUDED.gross_sales, public.shifts.gross_sales),
          labor_cost = COALESCE(EXCLUDED.labor_cost, public.shifts.labor_cost),
          import_batch_v2_id = _batch_id,
          updated_at = now()
      RETURNING shift_id INTO v_shift_id;

      v_inserted_ids := array_append(v_inserted_ids, v_shift_id);
      v_inserted := v_inserted + 1;

      -- Trigger LLS recompute (safe — formula not changed)
      PERFORM public.calculate_lls_for_shift(v_shift_id);
    END;
  END LOOP;

  UPDATE public.shift_import_batches_v2
  SET status = 'committed',
      approved_by = v_caller,
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

REVOKE ALL ON FUNCTION public.lls_v2_commit_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.lls_v2_commit_batch(uuid) TO authenticated;

-- 5. Rollback RPC — deletes shifts tagged by this batch, only if no later batch overwrote them.
CREATE OR REPLACE FUNCTION public.lls_v2_rollback_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.shift_import_batches_v2%ROWTYPE;
  v_caller uuid := auth.uid();
  v_deleted int := 0;
  v_skipped int := 0;
BEGIN
  SELECT * INTO v_batch FROM public.shift_import_batches_v2 WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  IF v_caller IS NULL OR NOT public.is_venue_manager(v_batch.venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_batch.status NOT IN ('staged','needs_review','committed') THEN
    RAISE EXCEPTION 'invalid_status_for_rollback: %', v_batch.status;
  END IF;

  IF v_batch.status = 'committed' THEN
    -- Only delete shifts that are still tagged with this batch
    -- (a later import that overwrote them would have replaced import_batch_v2_id)
    WITH deleted AS (
      DELETE FROM public.shifts
      WHERE import_batch_v2_id = _batch_id
      RETURNING shift_id
    )
    SELECT count(*) INTO v_deleted FROM deleted;

    v_skipped := COALESCE(array_length(v_batch.committed_shift_ids, 1), 0) - v_deleted;
  END IF;

  UPDATE public.shift_import_batches_v2
  SET status = 'rolled_back',
      rolled_back_at = now(),
      rolled_back_by = v_caller,
      is_active = false,
      updated_at = now()
  WHERE id = _batch_id;

  INSERT INTO public.lls_v2_audit_events(venue_id, event_type, actor, payload)
  VALUES (v_batch.venue_id, 'batch_rolled_back', v_caller,
          jsonb_build_object('batch_id', _batch_id, 'deleted_shifts', v_deleted, 'skipped_shifts', v_skipped));

  RETURN jsonb_build_object('deleted', v_deleted, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.lls_v2_rollback_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.lls_v2_rollback_batch(uuid) TO authenticated;

-- 6. Approve-without-commit RPC (status transition only, for batches that need a second review)
CREATE OR REPLACE FUNCTION public.lls_v2_approve_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.shift_import_batches_v2%ROWTYPE;
  v_caller uuid := auth.uid();
BEGIN
  SELECT * INTO v_batch FROM public.shift_import_batches_v2 WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  IF v_caller IS NULL OR NOT public.is_venue_manager(v_batch.venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_batch.status NOT IN ('staged','needs_review') THEN
    RAISE EXCEPTION 'invalid_status: %', v_batch.status;
  END IF;

  UPDATE public.shift_import_batches_v2
  SET status = 'approved', approved_by = v_caller, approved_at = now(), updated_at = now()
  WHERE id = _batch_id;

  INSERT INTO public.lls_v2_audit_events(venue_id, event_type, actor, payload)
  VALUES (v_batch.venue_id, 'batch_approved', v_caller, jsonb_build_object('batch_id', _batch_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lls_v2_approve_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.lls_v2_approve_batch(uuid) TO authenticated;
