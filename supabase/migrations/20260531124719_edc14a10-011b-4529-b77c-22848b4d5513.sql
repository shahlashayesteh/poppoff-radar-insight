
-- ============================================================
-- LLS: shift_import_batches
-- ============================================================
CREATE TABLE public.shift_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('sales','labor')),
  filename text,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shift_import_batches_venue ON public.shift_import_batches(venue_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_import_batches TO authenticated;
GRANT ALL ON public.shift_import_batches TO service_role;

ALTER TABLE public.shift_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read venue batches" ON public.shift_import_batches
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue batches" ON public.shift_import_batches
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue batches" ON public.shift_import_batches
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue batches" ON public.shift_import_batches
  FOR DELETE USING (public.is_venue_manager(venue_id));

-- ============================================================
-- LLS: shifts
-- ============================================================
CREATE TABLE public.shifts (
  shift_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  server_id text NOT NULL,
  server_name text,
  shift_date date NOT NULL,
  shift_start_time time,
  shift_end_time time,
  daypart text NOT NULL CHECK (daypart IN ('breakfast','brunch','lunch','dinner','late')),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  covers_served numeric,
  gross_sales numeric,
  labor_cost numeric,
  rpc numeric,
  base_lls numeric,
  opportunity_factor numeric,
  final_lls numeric,
  sales_batch_id uuid REFERENCES public.shift_import_batches(id) ON DELETE SET NULL,
  labor_batch_id uuid REFERENCES public.shift_import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, server_id, shift_date, shift_start_time)
);
CREATE INDEX idx_shifts_venue_date ON public.shifts(venue_id, shift_date);
CREATE INDEX idx_shifts_venue_server_date ON public.shifts(venue_id, server_id, shift_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read venue shifts" ON public.shifts
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue shifts" ON public.shifts
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue shifts" ON public.shifts
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue shifts" ON public.shifts
  FOR DELETE USING (public.is_venue_manager(venue_id));

-- ============================================================
-- LLS: venue_column_mappings
-- ============================================================
CREATE TABLE public.venue_column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('sales','labor')),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, source_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_column_mappings TO authenticated;
GRANT ALL ON public.venue_column_mappings TO service_role;

ALTER TABLE public.venue_column_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read venue mappings" ON public.venue_column_mappings
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue mappings" ON public.venue_column_mappings
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue mappings" ON public.venue_column_mappings
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue mappings" ON public.venue_column_mappings
  FOR DELETE USING (public.is_venue_manager(venue_id));

-- ============================================================
-- LLS: venue_opportunity_factors
-- ============================================================
CREATE TABLE public.venue_opportunity_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  daypart text NOT NULL CHECK (daypart IN ('breakfast','brunch','lunch','dinner','late')),
  factor numeric NOT NULL DEFAULT 1.0 CHECK (factor >= 0.7 AND factor <= 1.4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, day_of_week, daypart)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_opportunity_factors TO authenticated;
GRANT ALL ON public.venue_opportunity_factors TO service_role;

ALTER TABLE public.venue_opportunity_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read venue OF" ON public.venue_opportunity_factors
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue OF" ON public.venue_opportunity_factors
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue OF" ON public.venue_opportunity_factors
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue OF" ON public.venue_opportunity_factors
  FOR DELETE USING (public.is_venue_manager(venue_id));

-- ============================================================
-- venue_settings: LLS thresholds
-- ============================================================
ALTER TABLE public.venue_settings
  ADD COLUMN IF NOT EXISTS lls_green_threshold numeric NOT NULL DEFAULT 13.0,
  ADD COLUMN IF NOT EXISTS lls_amber_threshold numeric NOT NULL DEFAULT 10.0;

-- ============================================================
-- Functions: calculate LLS values for a single shift row
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_lls_for_shift(p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_of numeric;
  v_rpc numeric;
  v_base numeric;
  v_final numeric;
BEGIN
  SELECT * INTO s FROM public.shifts WHERE shift_id = p_shift_id;
  IF s IS NULL THEN RETURN; END IF;

  SELECT factor INTO v_of FROM public.venue_opportunity_factors
    WHERE venue_id = s.venue_id AND day_of_week = s.day_of_week AND daypart = s.daypart;
  IF v_of IS NULL THEN v_of := 1.0; END IF;

  IF s.covers_served IS NOT NULL AND s.covers_served > 0 AND s.gross_sales IS NOT NULL THEN
    v_rpc := s.gross_sales / s.covers_served;
  ELSE
    v_rpc := NULL;
  END IF;

  IF s.labor_cost IS NOT NULL AND s.labor_cost > 0 AND s.gross_sales IS NOT NULL THEN
    v_base := s.gross_sales / s.labor_cost;
  ELSE
    v_base := NULL;
  END IF;

  IF v_base IS NOT NULL AND v_rpc IS NOT NULL AND v_of > 0 THEN
    v_final := (v_base * v_rpc) / v_of;
  ELSE
    v_final := NULL;
  END IF;

  UPDATE public.shifts
    SET rpc = v_rpc, base_lls = v_base, opportunity_factor = v_of, final_lls = v_final, updated_at = now()
    WHERE shift_id = p_shift_id;
END;
$$;

-- ============================================================
-- Functions: recalculate LLS for the displayed week only.
-- Historical weeks remain immutable.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_lls_for_week(p_venue_id uuid, p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt integer := 0;
BEGIN
  FOR r IN
    SELECT shift_id FROM public.shifts
    WHERE venue_id = p_venue_id
      AND shift_date >= p_week_start
      AND shift_date < p_week_start + INTERVAL '7 days'
  LOOP
    PERFORM public.calculate_lls_for_shift(r.shift_id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_lls_for_shift(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_lls_for_week(uuid, date) TO authenticated, service_role;
