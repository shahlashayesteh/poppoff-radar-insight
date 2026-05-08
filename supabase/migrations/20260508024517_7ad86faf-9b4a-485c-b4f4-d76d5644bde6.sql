CREATE OR REPLACE FUNCTION public.normalize_person_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(_name, ''))), '[^a-z0-9]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.merge_server_account_data(_from_user_id uuid, _to_user_id uuid, _venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_moved integer := 0;
  v_rows integer := 0;
BEGIN
  IF _from_user_id IS NULL OR _to_user_id IS NULL OR _venue_id IS NULL OR _from_user_id = _to_user_id THEN
    RETURN 0;
  END IF;

  INSERT INTO public.server_stats (
    venue_id, user_id, week_start, total_covers, total_sales,
    wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales
  )
  SELECT venue_id, _to_user_id, week_start, total_covers, total_sales,
    wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales
  FROM public.server_stats
  WHERE user_id = _from_user_id AND venue_id = _venue_id
  ON CONFLICT (venue_id, user_id, week_start) DO UPDATE SET
    total_covers = EXCLUDED.total_covers,
    total_sales = EXCLUDED.total_sales,
    wine_sales = EXCLUDED.wine_sales,
    dessert_sales = EXCLUDED.dessert_sales,
    cocktail_sales = EXCLUDED.cocktail_sales,
    sides_sales = EXCLUDED.sides_sales,
    spirits_sales = EXCLUDED.spirits_sales,
    sparkling_sales = EXCLUDED.sparkling_sales;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_stats WHERE user_id = _from_user_id AND venue_id = _venue_id;

  INSERT INTO public.server_targets (
    venue_id, user_id, spend_per_cover_target, wine_target, dessert_target, cocktail_target,
    sides_target, spirits_target, sparkling_target, daily_sales_target
  )
  SELECT venue_id, _to_user_id, spend_per_cover_target, wine_target, dessert_target, cocktail_target,
    sides_target, spirits_target, sparkling_target, daily_sales_target
  FROM public.server_targets
  WHERE user_id = _from_user_id AND venue_id = _venue_id
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
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_targets WHERE user_id = _from_user_id AND venue_id = _venue_id;

  INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak, last_hit_week)
  SELECT venue_id, _to_user_id, current_streak, longest_streak, last_hit_week
  FROM public.server_streaks
  WHERE user_id = _from_user_id AND venue_id = _venue_id
  ON CONFLICT (user_id, venue_id) DO UPDATE SET
    current_streak = GREATEST(public.server_streaks.current_streak, EXCLUDED.current_streak),
    longest_streak = GREATEST(public.server_streaks.longest_streak, EXCLUDED.longest_streak),
    last_hit_week = GREATEST(public.server_streaks.last_hit_week, EXCLUDED.last_hit_week),
    updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_streaks WHERE user_id = _from_user_id AND venue_id = _venue_id;

  INSERT INTO public.server_milestones (venue_id, user_id, milestone_type, unlocked_at)
  SELECT venue_id, _to_user_id, milestone_type, unlocked_at
  FROM public.server_milestones
  WHERE user_id = _from_user_id AND venue_id = _venue_id
  ON CONFLICT (user_id, venue_id, milestone_type) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_milestones WHERE user_id = _from_user_id AND venue_id = _venue_id;

  INSERT INTO public.server_stat_views (venue_id, user_id, week_start, viewed_at)
  SELECT venue_id, _to_user_id, week_start, viewed_at
  FROM public.server_stat_views
  WHERE user_id = _from_user_id AND venue_id = _venue_id
  ON CONFLICT (user_id, venue_id, week_start) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_stat_views WHERE user_id = _from_user_id AND venue_id = _venue_id;

  INSERT INTO public.server_focus_acks (venue_id, user_id, week_start, acknowledged_at)
  SELECT venue_id, _to_user_id, week_start, acknowledged_at
  FROM public.server_focus_acks
  WHERE user_id = _from_user_id AND venue_id = _venue_id
  ON CONFLICT (user_id, venue_id, week_start) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_moved := v_moved + v_rows;
  DELETE FROM public.server_focus_acks WHERE user_id = _from_user_id AND venue_id = _venue_id;

  DELETE FROM public.venue_members WHERE user_id = _from_user_id AND venue_id = _venue_id;
  DELETE FROM public.profiles
  WHERE id = _from_user_id
    AND NOT EXISTS (SELECT 1 FROM public.venue_members WHERE user_id = _from_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _from_user_id);

  RETURN v_moved;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_placeholder_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_my_name text;
  v_venue_id uuid;
  v_placeholder uuid;
  v_claimed_accounts integer := 0;
  v_moved_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.normalize_person_name(full_name) INTO v_my_name
  FROM public.profiles
  WHERE id = v_uid;

  IF v_my_name IS NULL THEN
    RETURN jsonb_build_object('claimed', 0, 'moved_rows', 0);
  END IF;

  FOR v_venue_id IN SELECT venue_id FROM public.venue_members WHERE user_id = v_uid LOOP
    FOR v_placeholder IN
      SELECT p.id
      FROM public.profiles p
      JOIN public.venue_members vm ON vm.user_id = p.id
      WHERE vm.venue_id = v_venue_id
        AND p.id <> v_uid
        AND public.normalize_person_name(p.full_name) = v_my_name
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
    LOOP
      v_moved_rows := v_moved_rows + public.merge_server_account_data(v_placeholder, v_uid, v_venue_id);
      v_claimed_accounts := v_claimed_accounts + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('claimed', v_claimed_accounts, 'moved_rows', v_moved_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_venue_with_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venue_id uuid;
  v_uid uuid := auth.uid();
  v_my_name text;
  v_placeholder uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_venue_id FROM public.venues WHERE join_code = trim(_code);
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venues WHERE id = v_venue_id AND manager_id = v_uid) THEN
    RAISE EXCEPTION 'You own this venue';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'manager') THEN
    RAISE EXCEPTION 'Manager accounts cannot join as server';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'server')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.venue_members (venue_id, user_id) VALUES (v_venue_id, v_uid)
    ON CONFLICT (venue_id, user_id) DO NOTHING;

  SELECT public.normalize_person_name(full_name) INTO v_my_name
  FROM public.profiles
  WHERE id = v_uid;

  IF v_my_name IS NOT NULL THEN
    FOR v_placeholder IN
      SELECT p.id
      FROM public.profiles p
      JOIN public.venue_members vm ON vm.user_id = p.id
      WHERE vm.venue_id = v_venue_id
        AND p.id <> v_uid
        AND public.normalize_person_name(p.full_name) = v_my_name
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
    LOOP
      PERFORM public.merge_server_account_data(v_placeholder, v_uid, v_venue_id);
    END LOOP;
  END IF;

  INSERT INTO public.server_targets (venue_id, user_id)
    VALUES (v_venue_id, v_uid)
    ON CONFLICT (venue_id, user_id) DO NOTHING;

  INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
    VALUES (v_venue_id, v_uid, 0, 0)
    ON CONFLICT (user_id, venue_id) DO NOTHING;

  RETURN v_venue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_csv_upload(_venue_id uuid, _week_start date, _csv_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  RETURN jsonb_build_object(
    'matched_count', v_inserted,
    'created_count', v_created,
    'unmatched_names', to_jsonb(v_unmatched),
    'success', true
  );
END;
$$;