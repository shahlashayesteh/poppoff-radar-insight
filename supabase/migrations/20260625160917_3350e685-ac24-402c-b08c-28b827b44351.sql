
CREATE TABLE IF NOT EXISTS public.opportunity_factor_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  period_start date,
  period_end date,
  bucket_type text NOT NULL CHECK (bucket_type IN ('overall','daypart','day_of_week','outlet')),
  bucket_key text NOT NULL DEFAULT '_overall_',
  applied_factor_version text NOT NULL DEFAULT 'v1',
  applied_v1_factor numeric,
  preview_factor_version text NOT NULL DEFAULT 'v2_preview',
  preview_v2_factor numeric,
  delta numeric,
  confidence text,
  basis text,
  hours_source text,
  decision_grade text,
  can_drive_hard_recommendation boolean NOT NULL DEFAULT false,
  comparison_level integer,
  comparable_count integer,
  inputs_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  inputs_excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  fallback_reason text,
  explanation text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_of_assessments_latest
  ON public.opportunity_factor_assessments (venue_id, week_start, bucket_type, bucket_key);

CREATE INDEX IF NOT EXISTS idx_of_assessments_venue_week
  ON public.opportunity_factor_assessments (venue_id, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_factor_assessments TO authenticated;
GRANT ALL ON public.opportunity_factor_assessments TO service_role;

ALTER TABLE public.opportunity_factor_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view OF assessments for their venues"
  ON public.opportunity_factor_assessments FOR SELECT
  TO authenticated
  USING (public.user_can_access_venue(auth.uid(), venue_id));

CREATE POLICY "Managers can insert OF assessments for their venues"
  ON public.opportunity_factor_assessments FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_venue(auth.uid(), venue_id));

CREATE POLICY "Managers can update OF assessments for their venues"
  ON public.opportunity_factor_assessments FOR UPDATE
  TO authenticated
  USING (public.user_can_access_venue(auth.uid(), venue_id))
  WITH CHECK (public.user_can_access_venue(auth.uid(), venue_id));

CREATE POLICY "Managers can delete OF assessments for their venues"
  ON public.opportunity_factor_assessments FOR DELETE
  TO authenticated
  USING (public.user_can_access_venue(auth.uid(), venue_id));
