CREATE OR REPLACE FUNCTION public.venue_weekly_leaderboard(p_venue_id uuid, p_week_start date)
 RETURNS TABLE(user_id uuid, full_name text, current_sales numeric, prev_sales numeric, fourwk_avg_sales numeric, current_by_category jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_venue_member(p_venue_id) OR public.is_venue_manager(p_venue_id)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH recent_stats AS (
    SELECT ss.user_id AS u_id, ss.week_start AS wk, COALESCE(ss.total_sales, 0) AS wk_sales
    FROM public.server_stats ss
    WHERE ss.venue_id = p_venue_id
      AND ss.week_start <= p_week_start
      AND ss.week_start >= (p_week_start - INTERVAL '28 days')::date
  ),
  per_user AS (
    SELECT
      r.u_id,
      COALESCE(SUM(r.wk_sales) FILTER (WHERE r.wk = p_week_start), 0) AS cur_sales,
      COALESCE(SUM(r.wk_sales) FILTER (WHERE r.wk = (p_week_start - INTERVAL '7 days')::date), 0) AS prv_sales,
      COALESCE(AVG(r.wk_sales) FILTER (WHERE r.wk < p_week_start), 0) AS avg_sales
    FROM recent_stats r
    GROUP BY r.u_id
  ),
  per_cat AS (
    SELECT
      c.user_id AS u_id,
      jsonb_object_agg(
        c.category_key,
        jsonb_build_object(
          'sales', COALESCE(c.net_sales, c.sales, 0),
          'conversion', c.conversion,
          'quantity', c.quantity
        )
      ) AS cats
    FROM public.server_category_stats c
    WHERE c.venue_id = p_venue_id
      AND c.week_start = p_week_start
    GROUP BY c.user_id
  )
  SELECT
    pu.u_id,
    p.full_name,
    pu.cur_sales,
    pu.prv_sales,
    pu.avg_sales,
    pc.cats
  FROM per_user pu
  LEFT JOIN public.profiles p ON p.id = pu.u_id
  LEFT JOIN per_cat pc ON pc.u_id = pu.u_id
  WHERE pu.cur_sales > 0 OR pu.prv_sales > 0 OR pu.avg_sales > 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.venue_weekly_leaderboard(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.venue_weekly_leaderboard(uuid, date) TO authenticated;