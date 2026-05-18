CREATE OR REPLACE FUNCTION public.latest_venue_stats_week(p_venue_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week date;
BEGIN
  IF NOT (public.is_venue_member(p_venue_id) OR public.is_venue_manager(p_venue_id)) THEN
    RETURN NULL;
  END IF;

  SELECT max(week_start) INTO v_week
  FROM public.server_category_stats
  WHERE venue_id = p_venue_id;

  IF v_week IS NULL THEN
    SELECT max(week_start) INTO v_week
    FROM public.server_stats
    WHERE venue_id = p_venue_id;
  END IF;

  RETURN v_week;
END;
$function$;