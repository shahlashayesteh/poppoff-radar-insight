
CREATE OR REPLACE FUNCTION public.join_venue_with_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_id uuid;
  v_uid uuid := auth.uid();
  v_my_name text;
  v_placeholder uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_venue_id FROM public.venues WHERE join_code = _code;
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

  -- Merge any CSV-created placeholder profile with the same name in this venue
  SELECT lower(trim(p.full_name)) INTO v_my_name FROM public.profiles p WHERE p.id = v_uid;

  IF v_my_name IS NOT NULL AND v_my_name <> '' THEN
    SELECT p.id INTO v_placeholder
      FROM public.profiles p
      JOIN public.venue_members vm ON vm.user_id = p.id
      WHERE vm.venue_id = v_venue_id
        AND p.id <> v_uid
        AND lower(trim(p.full_name)) = v_my_name
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      LIMIT 1;

    IF v_placeholder IS NOT NULL THEN
      -- Reassign all data from placeholder to real user, on conflict delete placeholder rows
      UPDATE public.server_stats SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id
        AND NOT EXISTS (SELECT 1 FROM public.server_stats s2
                        WHERE s2.user_id = v_uid AND s2.venue_id = v_venue_id AND s2.week_start = server_stats.week_start);
      DELETE FROM public.server_stats WHERE user_id = v_placeholder;

      UPDATE public.server_targets SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id
        AND NOT EXISTS (SELECT 1 FROM public.server_targets t2
                        WHERE t2.user_id = v_uid AND t2.venue_id = v_venue_id);
      DELETE FROM public.server_targets WHERE user_id = v_placeholder;

      UPDATE public.server_streaks SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id
        AND NOT EXISTS (SELECT 1 FROM public.server_streaks s2
                        WHERE s2.user_id = v_uid AND s2.venue_id = v_venue_id);
      DELETE FROM public.server_streaks WHERE user_id = v_placeholder;

      UPDATE public.server_milestones SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id;
      DELETE FROM public.server_milestones WHERE user_id = v_placeholder;

      UPDATE public.server_stat_views SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id
        AND NOT EXISTS (SELECT 1 FROM public.server_stat_views v2
                        WHERE v2.user_id = v_uid AND v2.venue_id = v_venue_id AND v2.week_start = server_stat_views.week_start);
      DELETE FROM public.server_stat_views WHERE user_id = v_placeholder;

      UPDATE public.server_focus_acks SET user_id = v_uid
        WHERE user_id = v_placeholder AND venue_id = v_venue_id
        AND NOT EXISTS (SELECT 1 FROM public.server_focus_acks a2
                        WHERE a2.user_id = v_uid AND a2.venue_id = v_venue_id AND a2.week_start = server_focus_acks.week_start);
      DELETE FROM public.server_focus_acks WHERE user_id = v_placeholder;

      DELETE FROM public.venue_members WHERE user_id = v_placeholder AND venue_id = v_venue_id;
      DELETE FROM public.profiles WHERE id = v_placeholder;
    END IF;
  END IF;

  INSERT INTO public.server_targets (venue_id, user_id)
    VALUES (v_venue_id, v_uid)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
    VALUES (v_venue_id, v_uid, 0, 0)
    ON CONFLICT DO NOTHING;

  RETURN v_venue_id;
END;
$function$;
