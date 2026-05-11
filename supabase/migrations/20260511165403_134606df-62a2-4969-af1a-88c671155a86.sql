
-- 1) Schema changes: store quantity + net_sales + metric_type per category
ALTER TABLE public.server_category_stats
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_sales numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_type text NOT NULL DEFAULT 'sales';

ALTER TABLE public.server_category_targets
  ADD COLUMN IF NOT EXISTS metric_type text NOT NULL DEFAULT 'sales';

-- 2) Replace process_csv_upload with quantity-aware version that does NOT
--    auto-seed legacy six unless the upload actually includes them.
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
  v_cats jsonb;
  v_cat_key text;
  v_cat_label text;
  v_cat_sales numeric;
  v_cat_qty numeric;
  v_cat_net numeric;
  v_cat_metric text;
  v_conv numeric;
  v_cat_entry record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_csv_data)
  LOOP
    v_name := trim(coalesce(v_row->>'server_name', ''));
    IF public.normalize_person_name(v_name) IS NULL THEN CONTINUE; END IF;
    v_week_text := NULLIF(trim(COALESCE(v_row->>'week_start', '')), '');
    IF v_week_text IS NOT NULL THEN
      BEGIN v_row_week := v_week_text::date;
      EXCEPTION WHEN others THEN v_row_week := _week_start; END;
    ELSE
      v_row_week := _week_start;
    END IF;
    IF NOT v_row_week = ANY(v_weeks) THEN
      v_weeks := array_append(v_weeks, v_row_week);
      DELETE FROM public.server_stats WHERE venue_id = _venue_id AND week_start = v_row_week;
      DELETE FROM public.server_category_stats WHERE venue_id = _venue_id AND week_start = v_row_week;
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_csv_data)
  LOOP
    v_name := trim(coalesce(v_row->>'server_name', ''));
    v_norm_name := public.normalize_person_name(v_name);
    IF v_norm_name IS NULL THEN CONTINUE; END IF;

    v_week_text := NULLIF(trim(COALESCE(v_row->>'week_start', '')), '');
    IF v_week_text IS NOT NULL THEN
      BEGIN v_row_week := v_week_text::date;
      EXCEPTION WHEN others THEN v_row_week := _week_start; END;
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
      (venue_id, user_id, week_start, total_covers, total_sales,
       wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales, created_at)
      VALUES (_venue_id, v_user_id, v_row_week, v_covers, v_sales,
        v_wine, v_dessert, v_cocktail, v_sides, v_spirits, v_sparkling, now())
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

    -- ONLY use the categories map sent by the client.
    -- Do NOT auto-seed legacy six unless they appear in `categories`.
    v_cats := COALESCE(v_row->'categories', '{}'::jsonb);

    FOR v_cat_entry IN SELECT key, value FROM jsonb_each(v_cats)
    LOOP
      v_cat_key   := public.slugify_category(v_cat_entry.key);
      IF v_cat_key IS NULL THEN CONTINUE; END IF;
      v_cat_label := COALESCE(NULLIF(trim(v_cat_entry.value->>'label'), ''), v_cat_entry.key);
      v_cat_sales := COALESCE((v_cat_entry.value->>'sales')::numeric, 0);
      v_cat_qty   := COALESCE((v_cat_entry.value->>'quantity')::numeric, 0);
      v_cat_net   := COALESCE((v_cat_entry.value->>'net_sales')::numeric, v_cat_sales);
      v_cat_metric := lower(COALESCE(NULLIF(trim(v_cat_entry.value->>'metric_type'), ''),
                              CASE WHEN v_cat_qty > 0 THEN 'quantity' ELSE 'sales' END));
      IF v_cat_metric NOT IN ('quantity','sales','percentage') THEN v_cat_metric := 'sales'; END IF;

      -- Conversion rule (per the product spec):
      --   quantity   -> qty / covers  (units sold per cover, expressed as %)
      --   sales      -> net / total_sales * 100
      --   percentage -> raw value pre-computed by uploader
      IF v_cat_metric = 'quantity' THEN
        v_conv := CASE WHEN v_covers > 0 THEN (v_cat_qty::numeric / v_covers) * 100 ELSE 0 END;
      ELSIF v_cat_metric = 'percentage' THEN
        v_conv := v_cat_net; -- treat net_sales field as the percentage payload
      ELSE
        v_conv := CASE WHEN v_sales > 0 THEN (v_cat_net / v_sales) * 100 ELSE 0 END;
      END IF;

      INSERT INTO public.venue_categories (venue_id, key, label, is_legacy, sort_order)
      VALUES (_venue_id, v_cat_key, v_cat_label,
              v_cat_key IN ('wine','cocktail','dessert','sides','spirits','sparkling'),
              CASE v_cat_key
                WHEN 'wine' THEN 10 WHEN 'cocktail' THEN 20 WHEN 'dessert' THEN 30
                WHEN 'sides' THEN 40 WHEN 'spirits' THEN 50 WHEN 'sparkling' THEN 60
                ELSE 100 END)
      ON CONFLICT (venue_id, key) DO NOTHING;

      INSERT INTO public.server_category_stats
        (venue_id, user_id, week_start, category_key, sales, conversion, quantity, net_sales, metric_type)
      VALUES (_venue_id, v_user_id, v_row_week, v_cat_key,
              v_cat_net, v_conv, v_cat_qty, v_cat_net, v_cat_metric)
      ON CONFLICT (venue_id, user_id, week_start, category_key) DO UPDATE
        SET sales = EXCLUDED.sales,
            quantity = EXCLUDED.quantity,
            net_sales = EXCLUDED.net_sales,
            metric_type = EXCLUDED.metric_type,
            conversion = EXCLUDED.conversion;
    END LOOP;

    INSERT INTO public.server_targets (venue_id, user_id)
      VALUES (_venue_id, v_user_id) ON CONFLICT (venue_id, user_id) DO NOTHING;

    INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
      VALUES (_venue_id, v_user_id, 0, 0) ON CONFLICT (user_id, venue_id) DO NOTHING;

    PERFORM public.update_streaks_and_milestones(v_user_id, _venue_id, v_row_week);

    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'server') THEN
      FOR v_placeholder IN
        SELECT p.id FROM public.profiles p
        JOIN public.venue_members vm ON vm.user_id = p.id
        WHERE vm.venue_id = _venue_id AND p.id <> v_user_id
          AND public.normalize_person_name(p.full_name) = v_norm_name
          AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
      LOOP
        PERFORM public.merge_server_account_data(v_placeholder, v_user_id, _venue_id);
      END LOOP;
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

-- 3) Update recompute_ai_targets to be metric_type-aware. Target stored is
--    still the conversion-target (per-cover % for quantity, or % of revenue for sales).
CREATE OR REPLACE FUNCTION public.recompute_ai_targets(_venue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_venue_avg record;
  v_personal record;
  v_cutoff date := (CURRENT_DATE - INTERVAL '56 days');
  v_cat record;
  v_personal_cat numeric;
  v_venue_cat numeric;
  v_metric text;
BEGIN
  SELECT
    AVG(NULLIF(spend_per_cover, 0)) AS spc,
    AVG(NULLIF(wine_conversion, 0)) AS wine,
    AVG(NULLIF(dessert_conversion, 0)) AS dessert,
    AVG(NULLIF(cocktail_conversion, 0)) AS cocktail,
    AVG(NULLIF(sides_conversion, 0)) AS sides,
    AVG(NULLIF(spirits_conversion, 0)) AS spirits,
    AVG(NULLIF(sparkling_conversion, 0)) AS sparkling,
    AVG(NULLIF(total_sales, 0)) AS daily
  INTO v_venue_avg
  FROM public.server_stats
  WHERE venue_id = _venue_id AND week_start >= v_cutoff;

  FOR v_user IN SELECT DISTINCT user_id FROM public.venue_members WHERE venue_id = _venue_id LOOP
    SELECT
      AVG(NULLIF(spend_per_cover, 0)) AS spc,
      AVG(NULLIF(wine_conversion, 0)) AS wine,
      AVG(NULLIF(dessert_conversion, 0)) AS dessert,
      AVG(NULLIF(cocktail_conversion, 0)) AS cocktail,
      AVG(NULLIF(sides_conversion, 0)) AS sides,
      AVG(NULLIF(spirits_conversion, 0)) AS spirits,
      AVG(NULLIF(sparkling_conversion, 0)) AS sparkling,
      AVG(NULLIF(total_sales, 0)) AS daily
    INTO v_personal
    FROM public.server_stats
    WHERE venue_id = _venue_id AND user_id = v_user AND week_start >= v_cutoff;

    INSERT INTO public.server_targets (
      venue_id, user_id,
      spend_per_cover_target, wine_target, dessert_target, cocktail_target,
      sides_target, spirits_target, sparkling_target, daily_sales_target
    ) VALUES (
      _venue_id, v_user,
      GREATEST(COALESCE(v_personal.spc, 0) * 1.10, COALESCE(v_venue_avg.spc, 0), 1),
      GREATEST(COALESCE(v_personal.wine, 0) * 1.10, COALESCE(v_venue_avg.wine, 0), 1),
      GREATEST(COALESCE(v_personal.dessert, 0) * 1.10, COALESCE(v_venue_avg.dessert, 0), 1),
      GREATEST(COALESCE(v_personal.cocktail, 0) * 1.10, COALESCE(v_venue_avg.cocktail, 0), 1),
      GREATEST(COALESCE(v_personal.sides, 0) * 1.10, COALESCE(v_venue_avg.sides, 0), 1),
      GREATEST(COALESCE(v_personal.spirits, 0) * 1.10, COALESCE(v_venue_avg.spirits, 0), 1),
      GREATEST(COALESCE(v_personal.sparkling, 0) * 1.10, COALESCE(v_venue_avg.sparkling, 0), 1),
      GREATEST(COALESCE(v_personal.daily, 0) * 1.10, COALESCE(v_venue_avg.daily, 0), 1)
    )
    ON CONFLICT (venue_id, user_id) DO UPDATE SET
      spend_per_cover_target = EXCLUDED.spend_per_cover_target,
      wine_target = EXCLUDED.wine_target,
      dessert_target = EXCLUDED.dessert_target,
      cocktail_target = EXCLUDED.cocktail_target,
      sides_target = EXCLUDED.sides_target,
      spirits_target = EXCLUDED.spirits_target,
      sparkling_target = EXCLUDED.sparkling_target,
      daily_sales_target = EXCLUDED.daily_sales_target,
      updated_at = now();
  END LOOP;

  FOR v_cat IN SELECT key FROM public.venue_categories WHERE venue_id = _venue_id LOOP
    SELECT mode() WITHIN GROUP (ORDER BY metric_type) INTO v_metric
    FROM public.server_category_stats
    WHERE venue_id = _venue_id AND category_key = v_cat.key AND week_start >= v_cutoff;
    v_metric := COALESCE(v_metric, 'sales');

    SELECT AVG(NULLIF(conversion, 0)) INTO v_venue_cat
    FROM public.server_category_stats
    WHERE venue_id = _venue_id AND category_key = v_cat.key AND week_start >= v_cutoff;

    FOR v_user IN SELECT DISTINCT user_id FROM public.venue_members WHERE venue_id = _venue_id LOOP
      SELECT AVG(NULLIF(conversion, 0)) INTO v_personal_cat
      FROM public.server_category_stats
      WHERE venue_id = _venue_id AND user_id = v_user
        AND category_key = v_cat.key AND week_start >= v_cutoff;

      INSERT INTO public.server_category_targets (venue_id, user_id, category_key, target, metric_type)
      VALUES (_venue_id, v_user, v_cat.key,
              GREATEST(COALESCE(v_personal_cat, 0) * 1.10, COALESCE(v_venue_cat, 0), 1),
              v_metric)
      ON CONFLICT (venue_id, user_id, category_key) DO UPDATE
        SET target = EXCLUDED.target, metric_type = EXCLUDED.metric_type, updated_at = now();
    END LOOP;
  END LOOP;
END;
$function$;
