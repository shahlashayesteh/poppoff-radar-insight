-- Rewrite venue_weekly_leaderboard so it ranks from server_stats (always populated
-- on upload) and joins server_category_stats only for the per-category breakdown.
-- This guarantees the leaderboard appears whenever the manager has uploaded any
-- weekly stats, even if category-level data is sparse.

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
    SELECT user_id, week_start, COALESCE(total_sales, 0) AS wk_sales
    FROM public.server_stats
    WHERE venue_id = p_venue_id
      AND week_start <= p_week_start
      AND week_start >= (p_week_start - INTERVAL '28 days')::date
  ),
  per_user AS (
    SELECT
      r.user_id,
      COALESCE(SUM(wk_sales) FILTER (WHERE week_start = p_week_start), 0) AS current_sales,
      COALESCE(SUM(wk_sales) FILTER (WHERE week_start = (p_week_start - INTERVAL '7 days')::date), 0) AS prev_sales,
      COALESCE(AVG(wk_sales) FILTER (WHERE week_start < p_week_start), 0) AS fourwk_avg_sales
    FROM recent_stats r
    GROUP BY r.user_id
  ),
  per_cat AS (
    SELECT
      c.user_id,
      jsonb_object_agg(
        c.category_key,
        jsonb_build_object(
          'sales', COALESCE(c.net_sales, c.sales, 0),
          'conversion', c.conversion,
          'quantity', c.quantity
        )
      ) AS current_by_category
    FROM public.server_category_stats c
    WHERE c.venue_id = p_venue_id
      AND c.week_start = p_week_start
    GROUP BY c.user_id
  )
  SELECT
    pu.user_id,
    p.full_name,
    pu.current_sales,
    pu.prev_sales,
    pu.fourwk_avg_sales,
    pc.current_by_category
  FROM per_user pu
  LEFT JOIN public.profiles p ON p.id = pu.user_id
  LEFT JOIN per_cat pc ON pc.user_id = pu.user_id
  WHERE pu.current_sales > 0 OR pu.prev_sales > 0 OR pu.fourwk_avg_sales > 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.venue_weekly_leaderboard(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.venue_weekly_leaderboard(uuid, date) TO authenticated;