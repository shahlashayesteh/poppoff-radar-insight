CREATE OR REPLACE FUNCTION public.delete_csv_uploads(_venue_id uuid, _weeks date[] DEFAULT NULL::date[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted int := 0;
  v_rows int;
  v_min_week date;
  v_user uuid;
  v_week date;
  v_affected uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _weeks IS NULL OR array_length(_weeks, 1) IS NULL THEN
    DELETE FROM public.server_stats WHERE venue_id = _venue_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
    DELETE FROM public.server_category_stats WHERE venue_id = _venue_id;
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id;
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id;
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id;
    DELETE FROM public.server_milestones WHERE venue_id = _venue_id;
    UPDATE public.server_streaks SET current_streak = 0, longest_streak = 0, last_hit_week = NULL WHERE venue_id = _venue_id;
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id;
  ELSE
    -- Collect affected users + earliest deleted week BEFORE deleting stats
    SELECT array_agg(DISTINCT user_id), min(week_start)
      INTO v_affected, v_min_week
      FROM public.server_stats
      WHERE venue_id = _venue_id AND week_start = ANY(_weeks);

    DELETE FROM public.server_stats WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
    DELETE FROM public.server_category_stats WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id AND week_start = ANY(_weeks);

    IF v_affected IS NOT NULL AND v_min_week IS NOT NULL THEN
      -- Drop milestones earned at or after the earliest deleted week
      DELETE FROM public.server_milestones
        WHERE venue_id = _venue_id
          AND user_id = ANY(v_affected)
          AND unlocked_at >= v_min_week::timestamptz;

      -- Zero streaks for affected users, then replay remaining weeks chronologically
      UPDATE public.server_streaks
        SET current_streak = 0, longest_streak = 0, last_hit_week = NULL
        WHERE venue_id = _venue_id AND user_id = ANY(v_affected);

      FOREACH v_user IN ARRAY v_affected LOOP
        FOR v_week IN
          SELECT week_start FROM public.server_stats
          WHERE venue_id = _venue_id AND user_id = v_user
          ORDER BY week_start
        LOOP
          PERFORM public.update_streaks_and_milestones(v_user, _venue_id, v_week);
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  PERFORM public.recompute_ai_targets(_venue_id);

  RETURN jsonb_build_object('deleted_rows', v_deleted, 'success', true);
END;
$function$;