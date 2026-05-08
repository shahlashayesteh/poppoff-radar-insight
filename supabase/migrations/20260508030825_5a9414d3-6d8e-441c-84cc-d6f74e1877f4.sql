-- 1. Server logins tracking
CREATE TABLE IF NOT EXISTS public.server_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_server_logins_user_venue ON public.server_logins (user_id, venue_id, logged_in_at DESC);
ALTER TABLE public.server_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servers insert own logins" ON public.server_logins
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Servers read own logins" ON public.server_logins
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Managers read venue logins" ON public.server_logins
  FOR SELECT USING (public.is_venue_manager(venue_id));

CREATE OR REPLACE FUNCTION public.record_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_venue uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  FOR v_venue IN SELECT venue_id FROM public.venue_members WHERE user_id = v_uid LOOP
    INSERT INTO public.server_logins (user_id, venue_id) VALUES (v_uid, v_venue);
  END LOOP;
END;
$$;

-- 2. Per-server AI coaching cache
CREATE TABLE IF NOT EXISTS public.server_coaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  week_start date NOT NULL,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id, week_start)
);
ALTER TABLE public.server_coaching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servers read own coaching" ON public.server_coaching
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Managers read venue coaching" ON public.server_coaching
  FOR SELECT USING (public.is_venue_manager(venue_id));

-- 3. Anonymous leaderboard position
CREATE OR REPLACE FUNCTION public.get_leaderboard_position(_venue_id uuid, _week_start date)
RETURNS TABLE(my_position integer, total_servers integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT user_id,
      RANK() OVER (ORDER BY COALESCE(spend_per_cover, 0) DESC) AS pos,
      COUNT(*) OVER () AS total
    FROM public.server_stats
    WHERE venue_id = _venue_id AND week_start = _week_start
  )
  SELECT pos::int, total::int FROM ranked WHERE user_id = v_uid LIMIT 1;
END;
$$;

-- 4. AI-managed targets: target = max(personal 8wk avg * 1.10, venue avg)
CREATE OR REPLACE FUNCTION public.recompute_ai_targets(_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_venue_avg record;
  v_personal record;
  v_cutoff date := (CURRENT_DATE - INTERVAL '56 days');
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
END;
$$;

-- 5. Hook recompute into CSV upload
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

    INSERT INTO public.server_stats
      (venue_id, user_id, week_start, total_covers, total_sales, wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales)
      VALUES (
        _venue_id, v_user_id, _week_start,
        COALESCE((v_row->>'total_covers')::int, 0),
        COALESCE((v_row->>'total_sales')::numeric, 0),
        COALESCE((v_row->>'wine_sales')::numeric, 0),
        COALESCE((v_row->>'dessert_sales')::numeric, 0),
        COALESCE((v_row->>'cocktail_sales')::numeric, 0),
        COALESCE((v_row->>'sides_sales')::numeric, 0),
        COALESCE((v_row->>'spirits_sales')::numeric, 0),
        COALESCE((v_row->>'sparkling_sales')::numeric, 0)
      )
      ON CONFLICT (venue_id, user_id, week_start) DO UPDATE SET
        total_covers = EXCLUDED.total_covers,
        total_sales = EXCLUDED.total_sales,
        wine_sales = EXCLUDED.wine_sales,
        dessert_sales = EXCLUDED.dessert_sales,
        cocktail_sales = EXCLUDED.cocktail_sales,
        sides_sales = EXCLUDED.sides_sales,
        spirits_sales = EXCLUDED.spirits_sales,
        sparkling_sales = EXCLUDED.sparkling_sales;

    INSERT INTO public.server_targets (venue_id, user_id)
      VALUES (_venue_id, v_user_id) ON CONFLICT (venue_id, user_id) DO NOTHING;

    INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
      VALUES (_venue_id, v_user_id, 0, 0) ON CONFLICT (user_id, venue_id) DO NOTHING;

    PERFORM public.update_streaks_and_milestones(v_user_id, _venue_id, _week_start);

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

    v_inserted := v_inserted + 1;
  END LOOP;

  -- Recompute AI-managed targets after stats refresh
  PERFORM public.recompute_ai_targets(_venue_id);

  RETURN jsonb_build_object(
    'matched_count', v_inserted,
    'created_count', v_created,
    'unmatched_names', to_jsonb(v_unmatched),
    'success', true
  );
END;
$function$;