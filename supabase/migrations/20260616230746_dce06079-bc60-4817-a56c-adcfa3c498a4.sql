
-- =====================================================================
-- LLS v2 Phase 2 — Data Integrity (shadow tables, parallel to v1)
-- Nothing v1 is touched. All tables are read-only to clients.
-- =====================================================================

-- ---------- 1. shift_import_batches_v2 ------------------------------
CREATE TABLE public.shift_import_batches_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('sales','labor','combined')),
  source_filename text,
  is_active boolean NOT NULL DEFAULT true,
  superseded_by_batch_id uuid REFERENCES public.shift_import_batches_v2(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shift_import_batches_v2_venue ON public.shift_import_batches_v2(venue_id, created_at DESC);
CREATE INDEX idx_shift_import_batches_v2_active ON public.shift_import_batches_v2(venue_id) WHERE is_active;

GRANT SELECT ON public.shift_import_batches_v2 TO authenticated;
GRANT ALL ON public.shift_import_batches_v2 TO service_role;
ALTER TABLE public.shift_import_batches_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 batches readable by venue manager"
  ON public.shift_import_batches_v2 FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 2. shift_staging_rows -----------------------------------
CREATE TABLE public.shift_staging_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.shift_import_batches_v2(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('sales','labor')),
  source_row_index integer,
  raw_row jsonb NOT NULL,
  raw_row_hash text NOT NULL,
  service_date date,
  reported_identity_id text,
  reported_identity_name text,
  resolved_identity_id uuid,
  identity_match_method text,
  identity_confidence numeric,
  reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN (
      'pending',
      'identity_pending',
      'duplicate_pending',
      'excluded_duplicate',
      'excluded_invalid',
      'ready_for_matching',
      'matched',
      'unmatched_sales',
      'unmatched_labour',
      'time_ambiguous',
      'single_sided',
      'manager_exception_single_sided'
    )),
  duplicate_status text NOT NULL DEFAULT 'unique'
    CHECK (duplicate_status IN ('unique','duplicate_candidate','confirmed_duplicate','confirmed_distinct')),
  duplicate_of_row_id uuid REFERENCES public.shift_staging_rows(id) ON DELETE SET NULL,
  excluded_from_canonical boolean NOT NULL DEFAULT false,
  status_reason text,
  status_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staging_rows_venue_batch ON public.shift_staging_rows(venue_id, batch_id);
CREATE INDEX idx_staging_rows_status ON public.shift_staging_rows(venue_id, reconciliation_status);
CREATE INDEX idx_staging_rows_identity_date ON public.shift_staging_rows(resolved_identity_id, service_date);
CREATE INDEX idx_staging_rows_hash ON public.shift_staging_rows(venue_id, raw_row_hash);

GRANT SELECT ON public.shift_staging_rows TO authenticated;
GRANT ALL ON public.shift_staging_rows TO service_role;
ALTER TABLE public.shift_staging_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 staging rows readable by venue manager"
  ON public.shift_staging_rows FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 3. shift_sales_staging ----------------------------------
CREATE TABLE public.shift_sales_staging (
  staging_row_id uuid PRIMARY KEY REFERENCES public.shift_staging_rows(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.shift_import_batches_v2(id) ON DELETE CASCADE,
  sales_first_txn_time timestamptz,
  sales_last_txn_time timestamptz,
  sales_check_open_time timestamptz,
  sales_check_close_time timestamptz,
  sales_report_period_start timestamptz,
  sales_report_period_end timestamptz,
  sales_employee_shift_start timestamptz,
  sales_employee_shift_end timestamptz,
  gross_sales numeric,
  net_sales numeric,
  covers integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_staging_venue ON public.shift_sales_staging(venue_id);

GRANT SELECT ON public.shift_sales_staging TO authenticated;
GRANT ALL ON public.shift_sales_staging TO service_role;
ALTER TABLE public.shift_sales_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 sales staging readable by venue manager"
  ON public.shift_sales_staging FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 4. shift_labor_staging ----------------------------------
CREATE TABLE public.shift_labor_staging (
  staging_row_id uuid PRIMARY KEY REFERENCES public.shift_staging_rows(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.shift_import_batches_v2(id) ON DELETE CASCADE,
  labor_scheduled_start timestamptz,
  labor_scheduled_end timestamptz,
  labor_clock_in timestamptz,
  labor_clock_out timestamptz,
  derived_labor_span_start timestamptz,
  derived_labor_span_end timestamptz,
  labor_cost numeric,
  labor_hours_reported numeric,
  job_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_labor_staging_venue ON public.shift_labor_staging(venue_id);

GRANT SELECT ON public.shift_labor_staging TO authenticated;
GRANT ALL ON public.shift_labor_staging TO service_role;
ALTER TABLE public.shift_labor_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 labor staging readable by venue manager"
  ON public.shift_labor_staging FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 5. consistency trigger ----------------------------------
CREATE OR REPLACE FUNCTION public.lls_v2_check_detail_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_parent public.shift_staging_rows%ROWTYPE;
  v_expected_kind text;
BEGIN
  SELECT * INTO v_parent FROM public.shift_staging_rows WHERE id = NEW.staging_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent staging row % does not exist', NEW.staging_row_id;
  END IF;
  v_expected_kind := CASE TG_TABLE_NAME
    WHEN 'shift_sales_staging' THEN 'sales'
    WHEN 'shift_labor_staging' THEN 'labor'
  END;
  IF v_parent.source_kind <> v_expected_kind THEN
    RAISE EXCEPTION 'staging row source_kind=% does not match detail table %', v_parent.source_kind, TG_TABLE_NAME;
  END IF;
  IF v_parent.venue_id <> NEW.venue_id THEN
    RAISE EXCEPTION 'venue_id mismatch between staging row and detail row';
  END IF;
  IF v_parent.batch_id <> NEW.batch_id THEN
    RAISE EXCEPTION 'batch_id mismatch between staging row and detail row';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_staging_consistency
  BEFORE INSERT OR UPDATE ON public.shift_sales_staging
  FOR EACH ROW EXECUTE FUNCTION public.lls_v2_check_detail_consistency();

CREATE TRIGGER trg_labor_staging_consistency
  BEFORE INSERT OR UPDATE ON public.shift_labor_staging
  FOR EACH ROW EXECUTE FUNCTION public.lls_v2_check_detail_consistency();

-- ---------- 6. venue_daypart_windows --------------------------------
CREATE TABLE public.venue_daypart_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  daypart text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, day_of_week, daypart, effective_from)
);
CREATE INDEX idx_daypart_windows_venue ON public.venue_daypart_windows(venue_id, day_of_week);

GRANT SELECT ON public.venue_daypart_windows TO authenticated;
GRANT ALL ON public.venue_daypart_windows TO service_role;
ALTER TABLE public.venue_daypart_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 daypart windows readable by venue manager"
  ON public.venue_daypart_windows FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 7. POS control totals & attribution config --------------
CREATE TABLE public.venue_pos_control_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  daypart text,
  pos_gross_sales numeric,
  pos_net_sales numeric,
  pos_covers integer,
  source_filename text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, business_date, daypart)
);
CREATE INDEX idx_pos_control_totals_venue_date ON public.venue_pos_control_totals(venue_id, business_date);

GRANT SELECT ON public.venue_pos_control_totals TO authenticated;
GRANT ALL ON public.venue_pos_control_totals TO service_role;
ALTER TABLE public.venue_pos_control_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 pos control totals readable by venue manager"
  ON public.venue_pos_control_totals FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE TABLE public.venue_pos_attribution_config (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  warning_pct numeric NOT NULL DEFAULT 3,
  review_pct numeric NOT NULL DEFAULT 7,
  block_pct numeric NOT NULL DEFAULT 15,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.venue_pos_attribution_config TO authenticated;
GRANT ALL ON public.venue_pos_attribution_config TO service_role;
ALTER TABLE public.venue_pos_attribution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 pos attribution config readable by venue manager"
  ON public.venue_pos_attribution_config FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 8. identity tables --------------------------------------
CREATE TABLE public.venue_identity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  canonical_identity_id uuid NOT NULL,
  alias_name text NOT NULL,
  normalised_alias text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, normalised_alias)
);
CREATE INDEX idx_identity_aliases_canonical ON public.venue_identity_aliases(venue_id, canonical_identity_id);

GRANT SELECT ON public.venue_identity_aliases TO authenticated;
GRANT ALL ON public.venue_identity_aliases TO service_role;
ALTER TABLE public.venue_identity_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 identity aliases readable by venue manager"
  ON public.venue_identity_aliases FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE TABLE public.venue_identity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  external_system text NOT NULL,
  external_id text NOT NULL,
  canonical_identity_id uuid NOT NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, external_system, external_id)
);
CREATE INDEX idx_identity_mappings_canonical ON public.venue_identity_mappings(venue_id, canonical_identity_id);

GRANT SELECT ON public.venue_identity_mappings TO authenticated;
GRANT ALL ON public.venue_identity_mappings TO service_role;
ALTER TABLE public.venue_identity_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 identity mappings readable by venue manager"
  ON public.venue_identity_mappings FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE TABLE public.venue_identity_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staging_row_id uuid REFERENCES public.shift_staging_rows(id) ON DELETE CASCADE,
  proposed_name text NOT NULL,
  candidate_identity_id uuid,
  similarity numeric,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_identity_candidates_venue ON public.venue_identity_candidates(venue_id, status);

GRANT SELECT ON public.venue_identity_candidates TO authenticated;
GRANT ALL ON public.venue_identity_candidates TO service_role;
ALTER TABLE public.venue_identity_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 identity candidates readable by venue manager"
  ON public.venue_identity_candidates FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 9. shifts_v2 --------------------------------------------
CREATE TABLE public.shifts_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  canonical_identity_id uuid NOT NULL,
  service_date date NOT NULL,
  dominant_daypart text,
  cross_daypart boolean NOT NULL DEFAULT false,
  daypart_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  clock_in timestamptz,
  clock_out timestamptz,
  labor_span_hours numeric,
  service_duration_hours numeric,
  service_duration_source text
    CHECK (service_duration_source IS NULL OR service_duration_source IN
      ('pos_transactions','daypart_windows','reservations','labor_span_fallback')),
  gross_sales numeric,
  net_sales numeric,
  covers integer,
  labor_cost numeric,
  match_method text,
  is_single_sided boolean NOT NULL DEFAULT false,
  single_sided_authorised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  single_sided_justification text,
  needs_review boolean NOT NULL DEFAULT false,
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_batch_id uuid REFERENCES public.shift_import_batches_v2(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_v2_venue_date ON public.shifts_v2(venue_id, service_date);
CREATE INDEX idx_shifts_v2_identity ON public.shifts_v2(canonical_identity_id, service_date);
CREATE INDEX idx_shifts_v2_active ON public.shifts_v2(venue_id) WHERE is_active;
CREATE UNIQUE INDEX uq_shifts_v2_active_identity_date
  ON public.shifts_v2(venue_id, canonical_identity_id, service_date, dominant_daypart)
  WHERE is_active;

GRANT SELECT ON public.shifts_v2 TO authenticated;
GRANT ALL ON public.shifts_v2 TO service_role;
ALTER TABLE public.shifts_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 shifts readable by venue manager"
  ON public.shifts_v2 FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- ---------- 10. canonical_shift_sources -----------------------------
CREATE TABLE public.canonical_shift_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts_v2(id) ON DELETE CASCADE,
  staging_row_id uuid NOT NULL REFERENCES public.shift_staging_rows(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.shift_import_batches_v2(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('sales','labor')),
  match_confidence numeric,
  is_active boolean NOT NULL DEFAULT true,
  attached_at timestamptz NOT NULL DEFAULT now(),
  detached_at timestamptz
);
CREATE INDEX idx_css_shift ON public.canonical_shift_sources(shift_id);
CREATE INDEX idx_css_staging ON public.canonical_shift_sources(staging_row_id);
CREATE INDEX idx_css_venue ON public.canonical_shift_sources(venue_id);
-- Safeguard I: a staging row may be ACTIVELY attached only once.
CREATE UNIQUE INDEX uq_css_active_staging
  ON public.canonical_shift_sources(staging_row_id)
  WHERE is_active;

GRANT SELECT ON public.canonical_shift_sources TO authenticated;
GRANT ALL ON public.canonical_shift_sources TO service_role;
ALTER TABLE public.canonical_shift_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 canonical sources readable by venue manager"
  ON public.canonical_shift_sources FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE OR REPLACE FUNCTION public.lls_v2_check_canonical_source_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_staging public.shift_staging_rows%ROWTYPE;
  v_shift  public.shifts_v2%ROWTYPE;
BEGIN
  SELECT * INTO v_staging FROM public.shift_staging_rows WHERE id = NEW.staging_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging row % missing', NEW.staging_row_id; END IF;
  SELECT * INTO v_shift FROM public.shifts_v2 WHERE id = NEW.shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'shift % missing', NEW.shift_id; END IF;
  IF v_staging.source_kind <> NEW.source_kind THEN
    RAISE EXCEPTION 'source_kind mismatch: staging=%, link=%', v_staging.source_kind, NEW.source_kind;
  END IF;
  IF v_staging.venue_id <> NEW.venue_id OR v_shift.venue_id <> NEW.venue_id THEN
    RAISE EXCEPTION 'venue_id mismatch on canonical_shift_sources';
  END IF;
  IF v_staging.batch_id <> NEW.batch_id THEN
    RAISE EXCEPTION 'batch_id mismatch between staging row and canonical link';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_css_consistency
  BEFORE INSERT OR UPDATE ON public.canonical_shift_sources
  FOR EACH ROW EXECUTE FUNCTION public.lls_v2_check_canonical_source_consistency();

-- ---------- 11. venue_service_periods (derived) ---------------------
CREATE TABLE public.venue_service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  daypart text NOT NULL,
  observed_start timestamptz,
  observed_end timestamptz,
  duration_hours numeric,
  duration_source text NOT NULL
    CHECK (duration_source IN ('pos_transactions','daypart_windows','reservations','labor_span_fallback')),
  shift_count integer,
  confidence numeric,
  derived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, service_date, daypart)
);
CREATE INDEX idx_service_periods_venue_date ON public.venue_service_periods(venue_id, service_date);

GRANT SELECT ON public.venue_service_periods TO authenticated;
GRANT ALL ON public.venue_service_periods TO service_role;
ALTER TABLE public.venue_service_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2 service periods readable by venue manager"
  ON public.venue_service_periods FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));

-- =====================================================================
-- 12. SECURITY DEFINER functions
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lls_v2_is_manager(_venue_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.is_venue_manager(_venue_id); $$;

-- Ingest a batch payload. Caller passes a jsonb shape:
--   { "source_kind": "sales"|"labor"|"combined",
--     "source_filename": "...",
--     "rows": [ { "source_kind": "...", "raw": {...},
--                 "service_date": "...", "reported_identity_name": "...",
--                 "reported_identity_id": "...",
--                 "sales": {...} | "labor": {...} }, ... ] }
CREATE OR REPLACE FUNCTION public.lls_v2_ingest_batch(_venue_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_row jsonb;
  v_staging_id uuid;
  v_source_kind text;
  v_hash text;
  v_count integer := 0;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.shift_import_batches_v2 (venue_id, uploaded_by, source_kind, source_filename)
  VALUES (_venue_id, auth.uid(),
          COALESCE(_payload->>'source_kind','combined'),
          _payload->>'source_filename')
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(_payload->'rows','[]'::jsonb))
  LOOP
    v_source_kind := COALESCE(v_row->>'source_kind', _payload->>'source_kind');
    IF v_source_kind NOT IN ('sales','labor') THEN
      RAISE EXCEPTION 'row missing source_kind sales|labor';
    END IF;
    v_hash := md5(coalesce(v_row->>'raw', v_row::text));

    INSERT INTO public.shift_staging_rows (
      venue_id, batch_id, source_kind, source_row_index,
      raw_row, raw_row_hash, service_date,
      reported_identity_id, reported_identity_name
    ) VALUES (
      _venue_id, v_batch_id, v_source_kind, v_count,
      COALESCE(v_row->'raw', v_row),
      v_hash,
      NULLIF(v_row->>'service_date','')::date,
      NULLIF(v_row->>'reported_identity_id',''),
      NULLIF(v_row->>'reported_identity_name','')
    )
    RETURNING id INTO v_staging_id;

    IF v_source_kind = 'sales' AND v_row ? 'sales' THEN
      INSERT INTO public.shift_sales_staging (
        staging_row_id, venue_id, batch_id,
        sales_first_txn_time, sales_last_txn_time,
        sales_check_open_time, sales_check_close_time,
        sales_report_period_start, sales_report_period_end,
        sales_employee_shift_start, sales_employee_shift_end,
        gross_sales, net_sales, covers
      ) VALUES (
        v_staging_id, _venue_id, v_batch_id,
        NULLIF(v_row#>>'{sales,first_txn_time}','')::timestamptz,
        NULLIF(v_row#>>'{sales,last_txn_time}','')::timestamptz,
        NULLIF(v_row#>>'{sales,check_open_time}','')::timestamptz,
        NULLIF(v_row#>>'{sales,check_close_time}','')::timestamptz,
        NULLIF(v_row#>>'{sales,report_period_start}','')::timestamptz,
        NULLIF(v_row#>>'{sales,report_period_end}','')::timestamptz,
        NULLIF(v_row#>>'{sales,employee_shift_start}','')::timestamptz,
        NULLIF(v_row#>>'{sales,employee_shift_end}','')::timestamptz,
        NULLIF(v_row#>>'{sales,gross}','')::numeric,
        NULLIF(v_row#>>'{sales,net}','')::numeric,
        NULLIF(v_row#>>'{sales,covers}','')::integer
      );
    ELSIF v_source_kind = 'labor' AND v_row ? 'labor' THEN
      INSERT INTO public.shift_labor_staging (
        staging_row_id, venue_id, batch_id,
        labor_scheduled_start, labor_scheduled_end,
        labor_clock_in, labor_clock_out,
        derived_labor_span_start, derived_labor_span_end,
        labor_cost, labor_hours_reported, job_role
      ) VALUES (
        v_staging_id, _venue_id, v_batch_id,
        NULLIF(v_row#>>'{labor,scheduled_start}','')::timestamptz,
        NULLIF(v_row#>>'{labor,scheduled_end}','')::timestamptz,
        NULLIF(v_row#>>'{labor,clock_in}','')::timestamptz,
        NULLIF(v_row#>>'{labor,clock_out}','')::timestamptz,
        NULLIF(v_row#>>'{labor,span_start}','')::timestamptz,
        NULLIF(v_row#>>'{labor,span_end}','')::timestamptz,
        NULLIF(v_row#>>'{labor,cost}','')::numeric,
        NULLIF(v_row#>>'{labor,hours}','')::numeric,
        NULLIF(v_row#>>'{labor,role}','')
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.shift_import_batches_v2 SET row_count = v_count WHERE id = v_batch_id;
  RETURN v_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_resolve_identity(_staging_row_id uuid, _decision jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue uuid;
  v_action text := _decision->>'action';        -- 'confirm' | 'reject' | 'create'
  v_canonical uuid := NULLIF(_decision->>'canonical_identity_id','')::uuid;
BEGIN
  SELECT venue_id INTO v_venue FROM public.shift_staging_rows WHERE id = _staging_row_id;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'staging row not found'; END IF;
  IF NOT public.is_venue_manager(v_venue) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF v_action = 'confirm' AND v_canonical IS NOT NULL THEN
    UPDATE public.shift_staging_rows
    SET resolved_identity_id = v_canonical,
        identity_match_method = COALESCE(_decision->>'method','manager_confirmation'),
        identity_confidence = COALESCE(NULLIF(_decision->>'confidence','')::numeric, 1.0),
        reconciliation_status = CASE
          WHEN reconciliation_status = 'identity_pending' THEN 'pending'
          ELSE reconciliation_status END,
        status_reason = NULL,
        updated_at = now()
    WHERE id = _staging_row_id;
  ELSIF v_action = 'reject' THEN
    UPDATE public.shift_staging_rows
    SET reconciliation_status = 'identity_pending',
        status_reason = 'Manager rejected candidate identity',
        updated_at = now()
    WHERE id = _staging_row_id;
  ELSIF v_action = 'create' THEN
    UPDATE public.shift_staging_rows
    SET resolved_identity_id = COALESCE(v_canonical, gen_random_uuid()),
        identity_match_method = 'new_synthetic',
        identity_confidence = 0.5,
        reconciliation_status = 'pending',
        updated_at = now()
    WHERE id = _staging_row_id;
  ELSE
    RAISE EXCEPTION 'unknown identity decision action %', v_action;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_resolve_duplicate(_staging_row_id uuid, _decision text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_venue uuid;
BEGIN
  SELECT venue_id INTO v_venue FROM public.shift_staging_rows WHERE id = _staging_row_id;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'staging row not found'; END IF;
  IF NOT public.is_venue_manager(v_venue) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _decision NOT IN ('confirmed_duplicate','confirmed_distinct') THEN
    RAISE EXCEPTION 'decision must be confirmed_duplicate or confirmed_distinct';
  END IF;

  UPDATE public.shift_staging_rows
  SET duplicate_status = _decision,
      excluded_from_canonical = (_decision = 'confirmed_duplicate'),
      reconciliation_status = CASE
        WHEN _decision = 'confirmed_duplicate' THEN 'excluded_duplicate'
        ELSE 'pending' END,
      updated_at = now()
  WHERE id = _staging_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_authorise_single_sided(_staging_row_id uuid, _justification text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_venue uuid;
BEGIN
  IF _justification IS NULL OR length(trim(_justification)) = 0 THEN
    RAISE EXCEPTION 'Justification required';
  END IF;
  SELECT venue_id INTO v_venue FROM public.shift_staging_rows WHERE id = _staging_row_id;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'staging row not found'; END IF;
  IF NOT public.is_venue_manager(v_venue) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.shift_staging_rows
  SET reconciliation_status = 'manager_exception_single_sided',
      status_reason = _justification,
      status_evidence = status_evidence || jsonb_build_object('authorised_by', auth.uid(), 'at', now()),
      updated_at = now()
  WHERE id = _staging_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_upsert_daypart_window(
  _venue_id uuid, _day_of_week smallint, _daypart text,
  _start_time time, _end_time time, _effective_from date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.venue_daypart_windows (venue_id, day_of_week, daypart, start_time, end_time, effective_from, created_by)
  VALUES (_venue_id, _day_of_week, _daypart, _start_time, _end_time, _effective_from, auth.uid())
  ON CONFLICT (venue_id, day_of_week, daypart, effective_from) DO UPDATE
    SET start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_refresh_service_periods(_venue_id uuid, _from date, _to date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inserted integer := 0;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  DELETE FROM public.venue_service_periods
   WHERE venue_id = _venue_id AND service_date BETWEEN _from AND _to;

  WITH agg AS (
    SELECT s.venue_id, s.service_date, s.dominant_daypart AS daypart,
           min(s.clock_in)  AS observed_start,
           max(s.clock_out) AS observed_end,
           count(*)         AS shift_count
    FROM public.shifts_v2 s
    WHERE s.venue_id = _venue_id
      AND s.is_active
      AND s.service_date BETWEEN _from AND _to
      AND s.dominant_daypart IS NOT NULL
    GROUP BY s.venue_id, s.service_date, s.dominant_daypart
  )
  INSERT INTO public.venue_service_periods
    (venue_id, service_date, daypart, observed_start, observed_end, duration_hours, duration_source, shift_count, confidence)
  SELECT venue_id, service_date, daypart, observed_start, observed_end,
         EXTRACT(EPOCH FROM (observed_end - observed_start))/3600.0,
         'labor_span_fallback', shift_count, 0.5
  FROM agg
  WHERE observed_start IS NOT NULL AND observed_end IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- The atomic reconciliation entry point (Safeguard I + J).
CREATE OR REPLACE FUNCTION public.lls_v2_run_reconciliation(_venue_id uuid, _batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promoted integer := 0;
  v_matched integer := 0;
  v_periods integer := 0;
  v_from date;
  v_to   date;
BEGIN
  IF NOT public.is_venue_manager(_venue_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Safeguard I: advisory lock scoped to (venue, batch); released on commit/rollback.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('lls_v2_recon:'||_venue_id::text||':'||_batch_id::text, 0)
  );

  -- Safeguard J: promote survivors into the positive allowlist.
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

  -- Window for service-period refresh.
  SELECT min(service_date), max(service_date) INTO v_from, v_to
  FROM public.shift_staging_rows
  WHERE venue_id = _venue_id AND batch_id = _batch_id;

  -- NOTE: Phase 2 ships the staging/promotion/lock skeleton.
  -- The deterministic matcher (allowlist time pairing + no-time fallback)
  -- and canonical upserter are implemented inside this same function in a
  -- follow-up patch; they will read exclusively
  --   WHERE reconciliation_status IN ('ready_for_matching','manager_exception_single_sided')
  -- and insert into shifts_v2 + canonical_shift_sources under this lock.

  IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
    v_periods := public.lls_v2_refresh_service_periods(_venue_id, v_from, v_to);
  END IF;

  RETURN jsonb_build_object(
    'promoted', v_promoted,
    'matched',  v_matched,
    'service_periods_refreshed', v_periods,
    'batch_id', _batch_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;  -- propagate; transaction rolls back, advisory lock released.
END;
$$;

CREATE OR REPLACE FUNCTION public.lls_v2_supersede_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_venue uuid;
BEGIN
  SELECT venue_id INTO v_venue FROM public.shift_import_batches_v2 WHERE id = _batch_id;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF NOT public.is_venue_manager(v_venue) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.shift_import_batches_v2
  SET is_active = false, superseded_at = now(), updated_at = now()
  WHERE id = _batch_id;

  UPDATE public.shifts_v2
  SET is_active = false, updated_at = now()
  WHERE active_batch_id = _batch_id;

  UPDATE public.canonical_shift_sources
  SET is_active = false, detached_at = now()
  WHERE batch_id = _batch_id AND is_active;
END;
$$;

-- ---------- updated_at triggers ------------------------------------
CREATE TRIGGER trg_batches_v2_touch BEFORE UPDATE ON public.shift_import_batches_v2
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_staging_rows_touch BEFORE UPDATE ON public.shift_staging_rows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_daypart_windows_touch BEFORE UPDATE ON public.venue_daypart_windows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pos_control_totals_touch BEFORE UPDATE ON public.venue_pos_control_totals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pos_attribution_config_touch BEFORE UPDATE ON public.venue_pos_attribution_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_shifts_v2_touch BEFORE UPDATE ON public.shifts_v2
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
