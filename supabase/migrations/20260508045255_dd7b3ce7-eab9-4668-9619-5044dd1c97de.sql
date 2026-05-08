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
  v_spc numeric;
  v_conv_wine numeric; v_conv_dessert numeric; v_conv_cocktail numeric;
  v_conv_sides numeric; v_conv_spirits numeric; v_conv_sparkling numeric;
  v_row_week date;
  v_week_text text;
  v_weeks date[] := array[]::date[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_csv_data)
  LOOP
    v_name := trim(v_row->>'server_name');
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

    v_covers   := COALESCE((v_row->>'total_covers')::int, 0);
    v_sales    := COALESCE((v_row->>'total_sales')::numeric, 0);
    v_wine     := COALESCE((v_row->>'wine_sales')::numeric, 0);
    v_dessert  := COALESCE((v_row->>'dessert_sales')::numeric, 0);
    v_cocktail := COALESCE((v_row->>'cocktail_sales')::numeric, 0);
    v_sides    := COALESCE((v_row->>'sides_sales')::numeric, 0);
    v_spirits  := COALESCE((v_row->>'spirits_sales')::numeric, 0);
    v_sparkling:= COALESCE((v_row->>'sparkling_sales')::numeric, 0);

    v_spc := CASE WHEN v_covers > 0 THEN v_sales / v_covers ELSE 0 END;
    v_conv_wine     := CASE WHEN v_sales > 0 THEN (v_wine     / v_sales) * 100 ELSE 0 END;
    v_conv_dessert  := CASE WHEN v_sales > 0 THEN (v_dessert  / v_sales) * 100 ELSE 0 END;
    v_conv_cocktail := CASE WHEN v_sales > 0 THEN (v_cocktail / v_sales) * 100 ELSE 0 END;
    v_conv_sides    := CASE WHEN v_sales > 0 THEN (v_sides    / v_sales) * 100 ELSE 0 END;
    v_conv_spirits  := CASE WHEN v_sales > 0 THEN (v_spirits  / v_sales) * 100 ELSE 0 END;
    v_conv_sparkling:= CASE WHEN v_sales > 0 THEN (v_sparkling/ v_sales) * 100 ELSE 0 END;

    INSERT INTO public.server_stats
      (venue_id, user_id, week_start,
       total_covers, total_sales,
       wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales,
       spend_per_cover,
       wine_conversion, dessert_conversion, cocktail_conversion,
       sides_conversion, spirits_conversion, sparkling_conversion,
       created_at)
      VALUES (
        _venue_id, v_user_id, v_row_week,
        v_covers, v_sales,
        v_wine, v_dessert, v_cocktail, v_sides, v_spirits, v_sparkling,
        v_spc,
        v_conv_wine, v_conv_dessert, v_conv_cocktail,
        v_conv_sides, v_conv_spirits, v_conv_sparkling,
        now()
      )
      ON CONFLICT (venue_id, user_id, week_start) DO UPDATE SET
        total_covers = EXCLUDED.total_covers,
        total_sales = EXCLUDED.total_sales,
        wine_sales = EXCLUDED.wine_sales,
        dessert_sales = EXCLUDED.dessert_sales,
        cocktail_sales = EXCLUDED.cocktail_sales,
        sides_sales = EXCLUDED.sides_sales,
        spirits_sales = EXCLUDED.spirits_sales,
        sparkling_sales = EXCLUDED.sparkling_sales,
        spend_per_cover = EXCLUDED.spend_per_cover,
        wine_conversion = EXCLUDED.wine_conversion,
        dessert_conversion = EXCLUDED.dessert_conversion,
        cocktail_conversion = EXCLUDED.cocktail_conversion,
        sides_conversion = EXCLUDED.sides_conversion,
        spirits_conversion = EXCLUDED.spirits_conversion,
        sparkling_conversion = EXCLUDED.sparkling_conversion,
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

  UPDATE public.server_stats
    SET spend_per_cover = CASE WHEN total_covers > 0 THEN total_sales / total_covers ELSE 0 END,
        wine_conversion     = CASE WHEN total_sales > 0 THEN (wine_sales     / total_sales) * 100 ELSE 0 END,
        dessert_conversion  = CASE WHEN total_sales > 0 THEN (dessert_sales  / total_sales) * 100 ELSE 0 END,
        cocktail_conversion = CASE WHEN total_sales > 0 THEN (cocktail_sales / total_sales) * 100 ELSE 0 END,
        sides_conversion    = CASE WHEN total_sales > 0 THEN (sides_sales    / total_sales) * 100 ELSE 0 END,
        spirits_conversion  = CASE WHEN total_sales > 0 THEN (spirits_sales  / total_sales) * 100 ELSE 0 END,
        sparkling_conversion= CASE WHEN total_sales > 0 THEN (sparkling_sales/ total_sales) * 100 ELSE 0 END
    WHERE venue_id = _venue_id
      AND (spend_per_cover IS NULL OR wine_conversion IS NULL);

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