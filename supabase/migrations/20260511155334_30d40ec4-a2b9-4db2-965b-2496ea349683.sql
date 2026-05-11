
-- ===== Dynamic per-venue sales categories =====

-- 1) Categories per venue
CREATE TABLE IF NOT EXISTS public.venue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  is_legacy boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, key)
);
CREATE INDEX IF NOT EXISTS idx_venue_categories_venue ON public.venue_categories(venue_id);

ALTER TABLE public.venue_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage venue categories" ON public.venue_categories
  FOR ALL USING (public.is_venue_manager(venue_id))
  WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Servers read venue categories" ON public.venue_categories
  FOR SELECT USING (public.is_venue_member(venue_id));

-- 2) Per-server, per-week sales by category
CREATE TABLE IF NOT EXISTS public.server_category_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  category_key text NOT NULL,
  sales numeric NOT NULL DEFAULT 0,
  conversion numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id, week_start, category_key)
);
CREATE INDEX IF NOT EXISTS idx_scs_venue_week ON public.server_category_stats(venue_id, week_start);
CREATE INDEX IF NOT EXISTS idx_scs_user ON public.server_category_stats(user_id);

ALTER TABLE public.server_category_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servers read own category stats" ON public.server_category_stats
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Managers read venue category stats" ON public.server_category_stats
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue category stats" ON public.server_category_stats
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue category stats" ON public.server_category_stats
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue category stats" ON public.server_category_stats
  FOR DELETE USING (public.is_venue_manager(venue_id));

-- 3) AI-calculated per-server targets by category
CREATE TABLE IF NOT EXISTS public.server_category_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_key text NOT NULL,
  target numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id, category_key)
);
CREATE INDEX IF NOT EXISTS idx_sct_venue ON public.server_category_targets(venue_id);

ALTER TABLE public.server_category_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servers read own category targets" ON public.server_category_targets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Managers read venue category targets" ON public.server_category_targets
  FOR SELECT USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue category targets" ON public.server_category_targets
  FOR INSERT WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue category targets" ON public.server_category_targets
  FOR UPDATE USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));

-- 4) Slugify helper
CREATE OR REPLACE FUNCTION public.slugify_category(_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(coalesce(_label, '')), '[^a-z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g'
    ),
    ''
  )
$$;

-- 5) Backfill venue_categories with the six legacy ones for every venue that has stats
INSERT INTO public.venue_categories (venue_id, key, label, is_legacy, sort_order)
SELECT DISTINCT s.venue_id, c.key, c.label, true, c.sort
FROM public.server_stats s
CROSS JOIN (VALUES
  ('wine','Wine',10),
  ('cocktail','Cocktails',20),
  ('dessert','Desserts',30),
  ('sides','Sides',40),
  ('spirits','Spirits',50),
  ('sparkling','Sparkling',60)
) AS c(key,label,sort)
ON CONFLICT (venue_id, key) DO NOTHING;

-- 6) Backfill server_category_stats from legacy columns
INSERT INTO public.server_category_stats (venue_id, user_id, week_start, category_key, sales, conversion, created_at)
SELECT s.venue_id, s.user_id, s.week_start, x.key, x.sales,
  CASE WHEN s.total_sales > 0 THEN (x.sales / s.total_sales) * 100 ELSE 0 END,
  s.created_at
FROM public.server_stats s
CROSS JOIN LATERAL (VALUES
  ('wine',      coalesce(s.wine_sales,0)),
  ('cocktail',  coalesce(s.cocktail_sales,0)),
  ('dessert',   coalesce(s.dessert_sales,0)),
  ('sides',     coalesce(s.sides_sales,0)),
  ('spirits',   coalesce(s.spirits_sales,0)),
  ('sparkling', coalesce(s.sparkling_sales,0))
) AS x(key, sales)
ON CONFLICT (venue_id, user_id, week_start, category_key) DO NOTHING;

-- 7) Backfill server_category_targets from legacy targets
INSERT INTO public.server_category_targets (venue_id, user_id, category_key, target)
SELECT t.venue_id, t.user_id, x.key, x.target
FROM public.server_targets t
CROSS JOIN LATERAL (VALUES
  ('wine',      coalesce(t.wine_target,0)),
  ('cocktail',  coalesce(t.cocktail_target,0)),
  ('dessert',   coalesce(t.dessert_target,0)),
  ('sides',     coalesce(t.sides_target,0)),
  ('spirits',   coalesce(t.spirits_target,0)),
  ('sparkling', coalesce(t.sparkling_target,0))
) AS x(key, target)
ON CONFLICT (venue_id, user_id, category_key) DO NOTHING;

-- 8) Updated process_csv_upload — accepts dynamic `categories` map per row
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
  v_cat_entry record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Pre-pass: identify weeks and wipe them so re-upload is idempotent
  FOR v_row IN SELECT value FROM jsonb_array_elements(_csv_data)
  LOOP
    v_name := trim(coalesce(v_row->>'server_name', ''));
    IF public.normalize_person_name(v_name) IS NULL THEN
      CONTINUE;
    END IF;
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

  -- Main pass
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

    -- Legacy compatibility row
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

    -- Dynamic categories: combine legacy sales + categories map from payload
    v_cats := COALESCE(v_row->'categories', '{}'::jsonb);

    -- Seed legacy six into the cats map if not provided explicitly
    IF v_wine <> 0    AND NOT v_cats ? 'wine'      THEN v_cats := v_cats || jsonb_build_object('wine',      jsonb_build_object('label','Wine','sales',v_wine)); END IF;
    IF v_dessert <> 0 AND NOT v_cats ? 'dessert'   THEN v_cats := v_cats || jsonb_build_object('dessert',   jsonb_build_object('label','Desserts','sales',v_dessert)); END IF;
    IF v_cocktail<>0  AND NOT v_cats ? 'cocktail'  THEN v_cats := v_cats || jsonb_build_object('cocktail',  jsonb_build_object('label','Cocktails','sales',v_cocktail)); END IF;
    IF v_sides <> 0   AND NOT v_cats ? 'sides'     THEN v_cats := v_cats || jsonb_build_object('sides',     jsonb_build_object('label','Sides','sales',v_sides)); END IF;
    IF v_spirits <>0  AND NOT v_cats ? 'spirits'   THEN v_cats := v_cats || jsonb_build_object('spirits',   jsonb_build_object('label','Spirits','sales',v_spirits)); END IF;
    IF v_sparkling<>0 AND NOT v_cats ? 'sparkling' THEN v_cats := v_cats || jsonb_build_object('sparkling', jsonb_build_object('label','Sparkling','sales',v_sparkling)); END IF;

    FOR v_cat_entry IN SELECT key, value FROM jsonb_each(v_cats)
    LOOP
      v_cat_key   := public.slugify_category(v_cat_entry.key);
      v_cat_label := COALESCE(NULLIF(trim(v_cat_entry.value->>'label'), ''), v_cat_entry.key);
      v_cat_sales := COALESCE((v_cat_entry.value->>'sales')::numeric, 0);
      IF v_cat_key IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.venue_categories (venue_id, key, label, is_legacy, sort_order)
      VALUES (_venue_id, v_cat_key, v_cat_label,
              v_cat_key IN ('wine','cocktail','dessert','sides','spirits','sparkling'),
              CASE v_cat_key
                WHEN 'wine' THEN 10 WHEN 'cocktail' THEN 20 WHEN 'dessert' THEN 30
                WHEN 'sides' THEN 40 WHEN 'spirits' THEN 50 WHEN 'sparkling' THEN 60
                ELSE 100 END)
      ON CONFLICT (venue_id, key) DO NOTHING;

      INSERT INTO public.server_category_stats (venue_id, user_id, week_start, category_key, sales, conversion)
      VALUES (_venue_id, v_user_id, v_row_week, v_cat_key, v_cat_sales,
              CASE WHEN v_sales > 0 THEN (v_cat_sales / v_sales) * 100 ELSE 0 END)
      ON CONFLICT (venue_id, user_id, week_start, category_key) DO UPDATE
        SET sales = public.server_category_stats.sales + EXCLUDED.sales,
            conversion = CASE WHEN (public.server_category_stats.sales + EXCLUDED.sales) > 0
                              AND v_sales > 0
                          THEN ((public.server_category_stats.sales + EXCLUDED.sales) / v_sales) * 100
                          ELSE 0 END;
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

-- 9) Updated recompute_ai_targets — also recompute per-category targets
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
BEGIN
  -- Legacy targets (kept for compatibility)
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

  -- Dynamic category targets: for every (user, category) the venue tracks
  FOR v_cat IN SELECT key FROM public.venue_categories WHERE venue_id = _venue_id LOOP
    SELECT AVG(NULLIF(conversion, 0)) INTO v_venue_cat
    FROM public.server_category_stats
    WHERE venue_id = _venue_id AND category_key = v_cat.key AND week_start >= v_cutoff;

    FOR v_user IN SELECT DISTINCT user_id FROM public.venue_members WHERE venue_id = _venue_id LOOP
      SELECT AVG(NULLIF(conversion, 0)) INTO v_personal_cat
      FROM public.server_category_stats
      WHERE venue_id = _venue_id AND user_id = v_user
        AND category_key = v_cat.key AND week_start >= v_cutoff;

      INSERT INTO public.server_category_targets (venue_id, user_id, category_key, target)
      VALUES (_venue_id, v_user, v_cat.key,
              GREATEST(COALESCE(v_personal_cat, 0) * 1.10, COALESCE(v_venue_cat, 0), 1))
      ON CONFLICT (venue_id, user_id, category_key) DO UPDATE
        SET target = EXCLUDED.target, updated_at = now();
    END LOOP;
  END LOOP;
END;
$function$;

-- 10) Updated delete_csv_uploads — also clear category stats
CREATE OR REPLACE FUNCTION public.delete_csv_uploads(_venue_id uuid, _weeks date[] DEFAULT NULL::date[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    DELETE FROM public.server_category_stats WHERE venue_id = _venue_id;
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id;
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id;
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id;
    DELETE FROM public.server_milestones WHERE venue_id = _venue_id;
    UPDATE public.server_streaks SET current_streak = 0, longest_streak = 0, last_hit_week = NULL WHERE venue_id = _venue_id;
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id;
  ELSE
    DELETE FROM public.server_stats WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
    DELETE FROM public.server_category_stats WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_stat_views WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_focus_acks WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.server_coaching WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
    DELETE FROM public.weekly_priorities WHERE venue_id = _venue_id AND week_start = ANY(_weeks);
  END IF;

  RETURN jsonb_build_object('deleted_rows', v_deleted, 'success', true);
END;
$function$;
