
CREATE OR REPLACE FUNCTION public.claim_placeholder_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_my_name text;
  v_venue_id uuid;
  v_placeholder uuid;
  v_total int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT lower(trim(full_name)) INTO v_my_name FROM public.profiles WHERE id = v_uid;
  IF v_my_name IS NULL OR v_my_name = '' THEN RETURN jsonb_build_object('claimed',0); END IF;

  FOR v_venue_id IN SELECT venue_id FROM public.venue_members WHERE user_id = v_uid LOOP
    SELECT p.id INTO v_placeholder
      FROM public.profiles p
      JOIN public.venue_members vm ON vm.user_id = p.id
      WHERE vm.venue_id = v_venue_id
        AND p.id <> v_uid
        AND lower(trim(p.full_name)) = v_my_name
      LIMIT 1;
    IF v_placeholder IS NULL THEN CONTINUE; END IF;

    UPDATE public.server_stats SET user_id = v_uid WHERE user_id = v_placeholder AND venue_id = v_venue_id
      AND NOT EXISTS (SELECT 1 FROM public.server_stats s2 WHERE s2.user_id=v_uid AND s2.venue_id=v_venue_id AND s2.week_start=server_stats.week_start);
    DELETE FROM public.server_stats WHERE user_id = v_placeholder;

    UPDATE public.server_targets SET user_id = v_uid WHERE user_id = v_placeholder AND venue_id = v_venue_id
      AND NOT EXISTS (SELECT 1 FROM public.server_targets t2 WHERE t2.user_id=v_uid AND t2.venue_id=v_venue_id);
    DELETE FROM public.server_targets WHERE user_id = v_placeholder;

    UPDATE public.server_streaks SET user_id = v_uid WHERE user_id = v_placeholder AND venue_id = v_venue_id
      AND NOT EXISTS (SELECT 1 FROM public.server_streaks s2 WHERE s2.user_id=v_uid AND s2.venue_id=v_venue_id);
    DELETE FROM public.server_streaks WHERE user_id = v_placeholder;

    UPDATE public.server_milestones SET user_id = v_uid WHERE user_id = v_placeholder AND venue_id = v_venue_id;
    DELETE FROM public.server_milestones WHERE user_id = v_placeholder;

    DELETE FROM public.venue_members WHERE user_id = v_placeholder AND venue_id = v_venue_id;
    DELETE FROM public.profiles WHERE id = v_placeholder
      AND NOT EXISTS (SELECT 1 FROM public.venue_members WHERE user_id = v_placeholder);
    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object('claimed', v_total);
END;
$function$;
