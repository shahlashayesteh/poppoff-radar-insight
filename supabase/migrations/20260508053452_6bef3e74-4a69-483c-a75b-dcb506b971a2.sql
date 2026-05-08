CREATE OR REPLACE FUNCTION public.process_csv_upload(_venue_id uuid, _week_start date, _csv_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_name text;
  v_norm_name text;
  v_user_id uuid;
  v_placeholder uuid;
  v_inserted int := 0;
  v_created int := 0;
  v_unmatched text[] := array[]::text[];
  v_covers int;
  v_sales numeric;
  v_wine numeric; v_dessert numeric; v_cocktail numeric;
  v_sides numeric; v_spirits numeric; v_sparkling numeric;
  v_row_week date;
  v_week_text text;
  v_weeks date[] := array[]::date[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_week_text IN
    SELECT DISTINCT COALESCE(NULLIF(trim(value->>'week_start'), '')::date, _week_start)::text
    FROM jsonb_array_elements(_csv_data)
    WHERE NULLIF(trim(coalesce(value->>'server_name', '')), '') IS NOT NULL
  LOOP
    v_row_week := v_week_text::date;
    DELETE FROM public.server_stats
    WHERE venue_id = _venue_id
      AND week_start = v_row_week;
    IF NOT v_row_week = ANY(v_weeks) THEN
      v_weeks := array_append(v_weeks, v_row_week);
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_csv_data)
  LOOP
    v_name := trim(coalesce(v_row->>'server_name', ''));
    v_norm_name := public.normalize_person_name(v_name);
    IF v_norm_name IS NULL THEN
      CONTINUE;
    END IF;

    v_week_text := NULLIF(trim(COALESCE(v_row->>'week_start', '')), '');
    IF v_week_text IS NOT NULL THEN
      BEGIN
        v_row_week := v_week_text::date;
      EXCEPTION WHEN others THEN
        v_row_week := _week_start;
      END;
    ELSE
      v_row_week := _week_start;
    END IF;

    SELECT p.id INTO v_user_id
    FROM public.profiles p
    JOIN public.venue_members vm ON vm.user_id = p.id
    WHERE vm.venue_id = _venue_id
      AND public.normalize_person_name(p.full_name) = v_norm_name
    ORDER BY CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'server') THEN 0 ELSE 1 END,
             p.created_at
    LIMIT 1;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO public.profiles (id, full_name) VALUES (v_user_id, v_name);
      INSERT INTO public.venue_members (venue_id, user_id) VALUES (_venue_id, v_user_id);
      v_created := v_created + 1;
      v_unmatched := array_append(v_unmatched, v_name);
    END IF;

    v_covers   := greatest(round(public.csv_number(v_row, 'total_covers'))::int, 0);
    v_sales    := public.csv_number(v_row, 'total_sales');
    v_wine     := public.csv_number(v_row, 'wine_sales');
    v_dessert  := public.csv_number(v_row, 'dessert_sales');
    v_cocktail := public.csv_number(v_row, 'cocktail_sales');
    v_sides    := public.csv_number(v_row, 'sides_sales');
    v_spirits  := public.csv_number(v_row, 'spirits_sales');
    v_sparkling:= public.csv_number(v_row, 'sparkling_sales');

    INSERT INTO public.server_stats
      (venue_id, user_id, week_start,
       total_covers, total_sales,
       wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales,
       created_at)
      VALUES (
        _venue_id, v_user_id, v_row_week,
        v_covers, v_sales,
        v_wine, v_dessert, v_cocktail, v_sides, v_spirits, v_sparkling,
        now()
      )
      ON CONFLICT (venue_id, user_id, week_start) DO UPDATE SET
        total_covers = public.server_stats.total_covers + EXCLUDED.total_covers,
        total_sales = public.server_stats.total_sales + EXCLUDED.total_sales,
        wine_sales = public.server_stats.wine_sales + EXCLUDED.wine_sales,
        dessert_sales = public.server_stats.dessert_sales + EXCLUDED.dessert_sales,
        cocktail_sales = public.server_stats.cocktail_sales + EXCLUDED.cocktail_sales,
        sides_sales = public.server_stats.sides_sales + EXCLUDED.sides_sales,
        spirits_sales = public.server_stats.spirits_sales + EXCLUDED.spirits_sales,
        sparkling_sales = public.server_stats.sparkling_sales + EXCLUDED.sparkling_sales,
        created_at = now();

    INSERT INTO public.server_targets (venue_id, user_id)
      VALUES (_venue_id, v_user_id) ON CONFLICT (venue_id, user_id) DO NOTHING;

    INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
      VALUES (_venue_id, v_user_id, 0, 0) ON CONFLICT (user_id, venue_id) DO NOTHING;

    PERFORM public.update_streaks_and_milestones(v_user_id, _venue_id, v_row_week);

    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'server') THEN
      FOR v_placeholder IN
        SELECT p.id
        FROM public.profiles p
        JOIN public.venue_members vm ON vm.user_id = p.id
        WHERE vm.venue_id = _venue_id
          AND p.id <> v_user_id
          AND public.normalize_person_name(p.full_name) = v_norm_name
          AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
      LOOP
        PERFORM public.merge_server_account_data(v_placeholder, v_user_id, _venue_id);
      END LOOP;
    END IF;

    IF NOT v_row_week = ANY(v_weeks) THEN
      v_weeks := array_append(v_weeks, v_row_week);
    END IF;

    v_inserted := v_inserted + 1;
  END LOOP;

  PERFORM public.recompute_ai_targets(_venue_id);

  RETURN jsonb_build_object(
    'matched_count', v_inserted,
    'created_count', v_created,
    'unmatched_names', to_jsonb(v_unmatched),
    'weeks', to_jsonb(v_weeks),
    'success', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) TO authenticated;