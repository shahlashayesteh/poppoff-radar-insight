CREATE OR REPLACE FUNCTION public.calculate_lls_for_shift(p_shift_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_of numeric;
  v_rpc numeric;
  v_base numeric;
  v_adjusted numeric;
BEGIN
  SELECT * INTO s FROM public.shifts WHERE shift_id = p_shift_id;
  IF s IS NULL THEN RETURN; END IF;

  -- Venue-specific Opportunity Factor lookup. Defaults to 1.0 when no row exists.
  SELECT factor INTO v_of FROM public.venue_opportunity_factors
    WHERE venue_id = s.venue_id AND day_of_week = s.day_of_week AND daypart = s.daypart;
  IF v_of IS NULL OR v_of <= 0 THEN v_of := 1.0; END IF;

  -- RPC = gross_sales / covers_served
  IF s.covers_served IS NOT NULL AND s.covers_served > 0 AND s.gross_sales IS NOT NULL THEN
    v_rpc := s.gross_sales / s.covers_served;
  ELSE
    v_rpc := NULL;
  END IF;

  -- Base LLS = gross_sales / labor_cost
  IF s.labor_cost IS NOT NULL AND s.labor_cost > 0 AND s.gross_sales IS NOT NULL THEN
    v_base := s.gross_sales / s.labor_cost;
  ELSE
    v_base := NULL;
  END IF;

  -- Adjusted LLS = Base LLS / Opportunity Factor
  IF v_base IS NOT NULL THEN
    v_adjusted := v_base / v_of;
  ELSE
    v_adjusted := NULL;
  END IF;

  UPDATE public.shifts
    SET rpc = v_rpc,
        base_lls = v_base,
        opportunity_factor = v_of,
        final_lls = v_adjusted,  -- column name kept for migration safety; value is Adjusted LLS
        updated_at = now()
    WHERE shift_id = p_shift_id;
END;
$function$;

COMMENT ON COLUMN public.shifts.final_lls IS 'Adjusted LLS = Base LLS / Opportunity Factor. Column name kept under legacy "final_lls" for migration safety; UI and API surface this as Adjusted LLS.';