-- Fix recursive venue/member access checks with security-definer helpers
CREATE OR REPLACE FUNCTION public.is_venue_manager(_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = _venue_id AND v.manager_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_venue_member(_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_members vm
    WHERE vm.venue_id = _venue_id AND vm.user_id = auth.uid()
  );
$$;

-- venues
DROP POLICY IF EXISTS "Managers create own venues" ON public.venues;
DROP POLICY IF EXISTS "Managers delete own venues" ON public.venues;
DROP POLICY IF EXISTS "Managers read own venues" ON public.venues;
DROP POLICY IF EXISTS "Managers update own venues" ON public.venues;
DROP POLICY IF EXISTS "Servers read joined venues" ON public.venues;

CREATE POLICY "Managers create own venues" ON public.venues
FOR INSERT TO public
WITH CHECK ((auth.uid() = manager_id) AND public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers delete own venues" ON public.venues
FOR DELETE TO public
USING (auth.uid() = manager_id);

CREATE POLICY "Managers read own venues" ON public.venues
FOR SELECT TO public
USING (auth.uid() = manager_id);

CREATE POLICY "Managers update own venues" ON public.venues
FOR UPDATE TO public
USING (auth.uid() = manager_id)
WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "Servers read joined venues" ON public.venues
FOR SELECT TO public
USING (public.is_venue_member(id));

-- venue_members
DROP POLICY IF EXISTS "Managers read venue memberships" ON public.venue_members;
DROP POLICY IF EXISTS "Managers remove members" ON public.venue_members;
DROP POLICY IF EXISTS "Members read own membership" ON public.venue_members;

CREATE POLICY "Managers read venue memberships" ON public.venue_members
FOR SELECT TO public
USING (public.is_venue_manager(venue_id));

CREATE POLICY "Managers remove members" ON public.venue_members
FOR DELETE TO public
USING (public.is_venue_manager(venue_id));

CREATE POLICY "Members read own membership" ON public.venue_members
FOR SELECT TO public
USING (auth.uid() = user_id);

-- tables scoped to a manager-owned venue
DROP POLICY IF EXISTS "Managers read venue stats" ON public.server_stats;
DROP POLICY IF EXISTS "Managers insert venue stats" ON public.server_stats;
DROP POLICY IF EXISTS "Managers update venue stats" ON public.server_stats;
CREATE POLICY "Managers read venue stats" ON public.server_stats FOR SELECT TO public USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue stats" ON public.server_stats FOR INSERT TO public WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue stats" ON public.server_stats FOR UPDATE TO public USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue targets" ON public.server_targets;
DROP POLICY IF EXISTS "Managers insert venue targets" ON public.server_targets;
DROP POLICY IF EXISTS "Managers update venue targets" ON public.server_targets;
CREATE POLICY "Managers read venue targets" ON public.server_targets FOR SELECT TO public USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue targets" ON public.server_targets FOR INSERT TO public WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue targets" ON public.server_targets FOR UPDATE TO public USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue streaks" ON public.server_streaks;
CREATE POLICY "Managers read venue streaks" ON public.server_streaks FOR SELECT TO public USING (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue milestones" ON public.server_milestones;
CREATE POLICY "Managers read venue milestones" ON public.server_milestones FOR SELECT TO public USING (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue views" ON public.server_stat_views;
CREATE POLICY "Managers read venue views" ON public.server_stat_views FOR SELECT TO public USING (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue acks" ON public.server_focus_acks;
CREATE POLICY "Managers read venue acks" ON public.server_focus_acks FOR SELECT TO public USING (public.is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers read venue menu" ON public.venue_menu;
DROP POLICY IF EXISTS "Managers insert venue menu" ON public.venue_menu;
DROP POLICY IF EXISTS "Managers update venue menu" ON public.venue_menu;
DROP POLICY IF EXISTS "Managers delete venue menu" ON public.venue_menu;
DROP POLICY IF EXISTS "Servers read venue menu" ON public.venue_menu;
CREATE POLICY "Managers read venue menu" ON public.venue_menu FOR SELECT TO public USING (public.is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue menu" ON public.venue_menu FOR INSERT TO public WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers update venue menu" ON public.venue_menu FOR UPDATE TO public USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue menu" ON public.venue_menu FOR DELETE TO public USING (public.is_venue_manager(venue_id));
CREATE POLICY "Servers read venue menu" ON public.venue_menu FOR SELECT TO public USING (public.is_venue_member(venue_id));

DROP POLICY IF EXISTS "Managers manage weekly priorities" ON public.weekly_priorities;
DROP POLICY IF EXISTS "Servers read weekly priorities" ON public.weekly_priorities;
CREATE POLICY "Managers manage weekly priorities" ON public.weekly_priorities FOR ALL TO public USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Servers read weekly priorities" ON public.weekly_priorities FOR SELECT TO public USING (public.is_venue_member(venue_id));

DROP POLICY IF EXISTS "Managers manage venue settings" ON public.venue_settings;
DROP POLICY IF EXISTS "Servers read venue settings" ON public.venue_settings;
CREATE POLICY "Managers manage venue settings" ON public.venue_settings FOR ALL TO public USING (public.is_venue_manager(venue_id)) WITH CHECK (public.is_venue_manager(venue_id));
CREATE POLICY "Servers read venue settings" ON public.venue_settings FOR SELECT TO public USING (public.is_venue_member(venue_id));

-- Make server joining fully initialize account data in one trusted operation
CREATE OR REPLACE FUNCTION public.join_venue_with_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_uid uuid := auth.uid();
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

  INSERT INTO public.server_targets (venue_id, user_id)
    VALUES (v_venue_id, v_uid)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.server_streaks (venue_id, user_id, current_streak, longest_streak)
    VALUES (v_venue_id, v_uid, 0, 0)
    ON CONFLICT DO NOTHING;

  RETURN v_venue_id;
END;
$$;