
-- Phase 19: Employee Identity Schema Hardening

-- 1. Drop overly strict normalised-name unique constraint.
ALTER TABLE public.employee_master
  DROP CONSTRAINT IF EXISTS employee_master_venue_id_normalised_name_key;

-- 2. Add organisation linkage, cross-venue eligibility, internal code.
ALTER TABLE public.employee_master
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cross_venue_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_employee_code text;

-- Backfill organisation_id from the venue when missing.
UPDATE public.employee_master em
SET organisation_id = v.organisation_id
FROM public.venues v
WHERE em.venue_id = v.id
  AND em.organisation_id IS NULL
  AND v.organisation_id IS NOT NULL;

-- 3. Enforce uniqueness on source-system IDs per venue (the safe distinguishers).
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_master_venue_pos
  ON public.employee_master(venue_id, pos_employee_id)
  WHERE pos_employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_master_venue_labour
  ON public.employee_master(venue_id, labour_employee_id)
  WHERE labour_employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_master_venue_internal_code
  ON public.employee_master(venue_id, internal_employee_code)
  WHERE internal_employee_code IS NOT NULL;

-- Helpful lookup for duplicate-name surfacing (NOT unique).
CREATE INDEX IF NOT EXISTS idx_employee_master_venue_name
  ON public.employee_master(venue_id, normalised_name);

-- 4. Identity merges audit table — traceable when manager links/merges identities.
CREATE TABLE IF NOT EXISTS public.employee_identity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('merge','link_source_id','link_alias','split','retire')),
  primary_employee_id uuid REFERENCES public.employee_master(id) ON DELETE SET NULL,
  secondary_employee_id uuid REFERENCES public.employee_master(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eim_venue ON public.employee_identity_merges(venue_id, created_at DESC);

GRANT SELECT ON public.employee_identity_merges TO authenticated;
GRANT ALL ON public.employee_identity_merges TO service_role;
ALTER TABLE public.employee_identity_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identity merges readable by venue manager"
  ON public.employee_identity_merges FOR SELECT TO authenticated
  USING (public.is_venue_manager(venue_id));
