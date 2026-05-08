CREATE OR REPLACE FUNCTION public.delete_csv_uploads(_venue_id uuid, _weeks date[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
  v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _weeks IS NULL OR array_length(_weeks, 1) IS NULL THEN
    DELETE FROM public.server_stats WHERE venue_id = _venue_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id;
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id;
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id;
    DELETE FROM public.server_milestones WHERE venue_id = _venue_id;
    UPDATE public.server_streaks SET current_streak = 0, longest_streak = 0, last_hit_week = NULL WHERE venue_id = _venue_id;
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id;
  ELSE
    DELETE FROM public.server_stats WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
  END IF;

  RETURN jsonb_build_object('deleted_rows', v_deleted, 'success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_csv_uploads(uuid, date[]) TO authenticated;

-- Allow managers to delete venue stats directly via RLS as well
DROP POLICY IF EXISTS "Managers delete venue stats" ON public.server_stats;
CREATE POLICY "Managers delete venue stats" ON public.server_stats
  FOR DELETE USING (is_venue_manager(venue_id));