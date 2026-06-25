-- 1) Extend weekly_priorities with workflow fields. Defaults keep existing rows visible to servers (sent_to_servers).
ALTER TABLE public.weekly_priorities
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS expected_behaviour text,
  ADD COLUMN IF NOT EXISTS server_group text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS expected_impact_basis text NOT NULL DEFAULT 'modelled',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent_to_servers',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_servers_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_menu_id uuid,
  ADD COLUMN IF NOT EXISTS source_suggestion_id uuid;

ALTER TABLE public.weekly_priorities DROP CONSTRAINT IF EXISTS weekly_priorities_status_check;
ALTER TABLE public.weekly_priorities ADD CONSTRAINT weekly_priorities_status_check
  CHECK (status IN ('ai_suggested','approved','rejected','archived','sent_to_servers'));
ALTER TABLE public.weekly_priorities DROP CONSTRAINT IF EXISTS weekly_priorities_basis_check;
ALTER TABLE public.weekly_priorities ADD CONSTRAINT weekly_priorities_basis_check
  CHECK (expected_impact_basis IN ('estimated','modelled'));

CREATE INDEX IF NOT EXISTS idx_weekly_priorities_status ON public.weekly_priorities(venue_id, status);

-- 2) Replace server SELECT policy with status-aware version.
DROP POLICY IF EXISTS "Servers read weekly priorities" ON public.weekly_priorities;
CREATE POLICY "Servers read approved weekly priorities"
  ON public.weekly_priorities
  FOR SELECT
  USING (
    is_venue_member(venue_id)
    AND status IN ('approved','sent_to_servers')
    AND archived_at IS NULL
  );

-- 3) New menu_item_suggestions table — manager-only (servers never see margin or pending items).
CREATE TABLE IF NOT EXISTS public.menu_item_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text,
  price numeric,
  margin numeric,
  item_pos_id text,
  menu_period text,
  source_file text,
  source_menu_id uuid REFERENCES public.venue_menu(id) ON DELETE SET NULL,
  ai_reason text,
  status text NOT NULL DEFAULT 'ai_suggested'
    CHECK (status IN ('ai_suggested','approved','rejected','archived','sent_to_servers')),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  rejected_at timestamptz,
  archived_at timestamptz,
  sent_to_servers_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_suggestions TO authenticated;
GRANT ALL ON public.menu_item_suggestions TO service_role;

ALTER TABLE public.menu_item_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers manage menu suggestions" ON public.menu_item_suggestions;
CREATE POLICY "Managers manage menu suggestions"
  ON public.menu_item_suggestions
  FOR ALL
  USING (is_venue_manager(venue_id))
  WITH CHECK (is_venue_manager(venue_id));

CREATE INDEX IF NOT EXISTS idx_menu_item_suggestions_venue_status
  ON public.menu_item_suggestions(venue_id, status);

CREATE OR REPLACE FUNCTION public.menu_item_suggestions_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS menu_item_suggestions_touch ON public.menu_item_suggestions;
CREATE TRIGGER menu_item_suggestions_touch
BEFORE UPDATE ON public.menu_item_suggestions
FOR EACH ROW EXECUTE FUNCTION public.menu_item_suggestions_touch_updated_at();

-- 4) Audit events for menu intelligence + priority workflow.
CREATE TABLE IF NOT EXISTS public.menu_intelligence_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  actor_user_id uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('menu_suggestion','weekly_priority')),
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.menu_intelligence_audit_events TO authenticated;
GRANT ALL ON public.menu_intelligence_audit_events TO service_role;

ALTER TABLE public.menu_intelligence_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read menu audit events" ON public.menu_intelligence_audit_events;
CREATE POLICY "Managers read menu audit events"
  ON public.menu_intelligence_audit_events
  FOR SELECT
  USING (is_venue_manager(venue_id));

DROP POLICY IF EXISTS "Managers write menu audit events" ON public.menu_intelligence_audit_events;
CREATE POLICY "Managers write menu audit events"
  ON public.menu_intelligence_audit_events
  FOR INSERT
  WITH CHECK (is_venue_manager(venue_id));

CREATE INDEX IF NOT EXISTS idx_menu_audit_venue_entity
  ON public.menu_intelligence_audit_events(venue_id, entity_type, entity_id);