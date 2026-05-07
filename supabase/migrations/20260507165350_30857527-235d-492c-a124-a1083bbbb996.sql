
CREATE OR REPLACE FUNCTION public.claim_manager_account(_business_name text)
RETURNS uuid
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
    RAISE EXCEPTION 'Server accounts cannot become managers';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'manager')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- Use existing first venue if any
  SELECT id INTO v_venue_id FROM public.venues WHERE manager_id = v_uid ORDER BY created_at LIMIT 1;
  IF v_venue_id IS NOT NULL THEN
    RETURN v_venue_id;
  END IF;

  v_name := NULLIF(trim(_business_name), '');
  IF v_name IS NULL THEN
    SELECT NULLIF(trim(business_name), '') INTO v_name FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_name IS NULL THEN
    v_name := 'My Venue';
  END IF;

  INSERT INTO public.venues (manager_id, name) VALUES (v_uid, v_name)
    RETURNING id INTO v_venue_id;

  RETURN v_venue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_manager_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_manager_account(text) TO authenticated;
