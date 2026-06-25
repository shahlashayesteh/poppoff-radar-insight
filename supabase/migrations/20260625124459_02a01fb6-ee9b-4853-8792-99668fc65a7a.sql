
-- 1. Extend app_role with head_office (safe-if-exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'head_office') THEN
    ALTER TYPE public.app_role ADD VALUE 'head_office';
  END IF;
END $$;

-- 2. Organisations
CREATE TABLE IF NOT EXISTS public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- 3. Organisation memberships
CREATE TABLE IF NOT EXISTS public.organisation_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','head_office','manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_memberships TO authenticated;
GRANT ALL ON public.organisation_memberships TO service_role;
ALTER TABLE public.organisation_memberships ENABLE ROW LEVEL SECURITY;

-- 4. Add organisation link to venues (nullable: legacy single-venue rows stay valid)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS venues_org_idx ON public.venues(organisation_id);

-- 5. SECURITY DEFINER access helper (avoids RLS recursion in policies below)
CREATE OR REPLACE FUNCTION public.user_can_access_venue(_user_id uuid, _venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Direct owner
    SELECT 1 FROM public.venues v
    WHERE v.id = _venue_id AND v.manager_id = _user_id
  ) OR EXISTS (
    -- Direct venue member (server / manager)
    SELECT 1 FROM public.venue_members vm
    WHERE vm.venue_id = _venue_id AND vm.user_id = _user_id
  ) OR EXISTS (
    -- Head-office / owner via organisation membership
    SELECT 1 FROM public.venues v
    JOIN public.organisation_memberships om
      ON om.organisation_id = v.organisation_id
    WHERE v.id = _venue_id
      AND om.user_id = _user_id
      AND om.role IN ('owner','head_office')
  );
$$;

-- 6. Accessible venues RPC for clients
CREATE OR REPLACE FUNCTION public.get_my_accessible_venues()
RETURNS TABLE (id uuid, name text, join_code text, organisation_id uuid, access_source text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT v.id, v.name, v.join_code, v.organisation_id, 'owner'::text AS access_source
    FROM public.venues v, me WHERE v.manager_id = me.uid
  UNION
  SELECT v.id, v.name, v.join_code, v.organisation_id, 'organisation'::text
    FROM public.venues v
    JOIN public.organisation_memberships om
      ON om.organisation_id = v.organisation_id
    , me
    WHERE om.user_id = me.uid AND om.role IN ('owner','head_office')
  UNION
  SELECT v.id, v.name, v.join_code, v.organisation_id, 'member'::text
    FROM public.venues v
    JOIN public.venue_members vm ON vm.venue_id = v.id
    , me
    WHERE vm.user_id = me.uid;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_venue(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_venues() TO authenticated, service_role;

-- 7. RLS policies for new tables
DROP POLICY IF EXISTS "Members can view their organisations" ON public.organisations;
CREATE POLICY "Members can view their organisations" ON public.organisations
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organisation_memberships om
      WHERE om.organisation_id = organisations.id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can manage their organisations" ON public.organisations;
CREATE POLICY "Owners can manage their organisations" ON public.organisations
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members can view their org memberships" ON public.organisation_memberships;
CREATE POLICY "Members can view their org memberships" ON public.organisation_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organisation_memberships.organisation_id AND o.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can manage org memberships" ON public.organisation_memberships;
CREATE POLICY "Owners can manage org memberships" ON public.organisation_memberships
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organisation_memberships.organisation_id AND o.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organisation_memberships.organisation_id AND o.owner_id = auth.uid()
    )
  );

-- 8. Touch trigger for organisations.updated_at
DROP TRIGGER IF EXISTS organisations_touch_updated_at ON public.organisations;
CREATE TRIGGER organisations_touch_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
