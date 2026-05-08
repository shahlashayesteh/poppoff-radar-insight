CREATE OR REPLACE FUNCTION public.get_my_manager_venue()
RETURNS TABLE(id uuid, name text, join_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_venue_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'server') THEN
    RAISE EXCEPTION 'Server accounts cannot use manager dashboard';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'manager')
    ON CONFLICT (user_id, role) DO NOTHING;

  SELECT v.id INTO v_venue_id
  FROM public.venues v
  WHERE v.manager_id = v_uid
  ORDER BY v.created_at
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    SELECT NULLIF(trim(p.business_name), '') INTO v_name
    FROM public.profiles p
    WHERE p.id = v_uid;

    IF v_name IS NULL THEN
      v_name := 'My Venue';
    END IF;

    INSERT INTO public.venues (manager_id, name)
    VALUES (v_uid, v_name)
    RETURNING venues.id INTO v_venue_id;
  END IF;

  RETURN QUERY
  SELECT v.id, v.name, v.join_code
  FROM public.venues v
  WHERE v.id = v_venue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_manager_venue() TO authenticated;