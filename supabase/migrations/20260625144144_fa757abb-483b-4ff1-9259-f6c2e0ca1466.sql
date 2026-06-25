
-- Phase 18: Row-Level Provenance & Evidence Persistence
-- Adds backward-compatible provenance and evidence columns. No data backfill.

-- shifts (v1) provenance
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS sales_basis text,
  ADD COLUMN IF NOT EXISTS labor_basis text,
  ADD COLUMN IF NOT EXISTS reliability_class text,
  ADD COLUMN IF NOT EXISTS identity_match_method text,
  ADD COLUMN IF NOT EXISTS identity_match_confidence numeric,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_row_hash text,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_sales_basis_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_sales_basis_check
  CHECK (sales_basis IS NULL OR sales_basis IN ('net','gross','gross_as_net_estimated','unknown'));

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_labor_basis_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_labor_basis_check
  CHECK (labor_basis IS NULL OR labor_basis IN ('wages_only','wages_plus_oncosts','unknown_estimated'));

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_reliability_class_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_reliability_class_check
  CHECK (reliability_class IS NULL OR reliability_class IN ('measured','derived','estimated','contextual','blocked'));

-- shifts_v2 provenance additions
ALTER TABLE public.shifts_v2
  ADD COLUMN IF NOT EXISTS sales_basis text,
  ADD COLUMN IF NOT EXISTS labor_basis text,
  ADD COLUMN IF NOT EXISTS reliability_class text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

ALTER TABLE public.shifts_v2
  DROP CONSTRAINT IF EXISTS shifts_v2_sales_basis_check;
ALTER TABLE public.shifts_v2
  ADD CONSTRAINT shifts_v2_sales_basis_check
  CHECK (sales_basis IS NULL OR sales_basis IN ('net','gross','gross_as_net_estimated','unknown'));

ALTER TABLE public.shifts_v2
  DROP CONSTRAINT IF EXISTS shifts_v2_labor_basis_check;
ALTER TABLE public.shifts_v2
  ADD CONSTRAINT shifts_v2_labor_basis_check
  CHECK (labor_basis IS NULL OR labor_basis IN ('wages_only','wages_plus_oncosts','unknown_estimated'));

ALTER TABLE public.shifts_v2
  DROP CONSTRAINT IF EXISTS shifts_v2_reliability_class_check;
ALTER TABLE public.shifts_v2
  ADD CONSTRAINT shifts_v2_reliability_class_check
  CHECK (reliability_class IS NULL OR reliability_class IN ('measured','derived','estimated','contextual','blocked'));

-- weekly_priorities evidence
ALTER TABLE public.weekly_priorities
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_confidence text;

ALTER TABLE public.weekly_priorities
  DROP CONSTRAINT IF EXISTS weekly_priorities_recommendation_confidence_check;
ALTER TABLE public.weekly_priorities
  ADD CONSTRAINT weekly_priorities_recommendation_confidence_check
  CHECK (recommendation_confidence IS NULL OR recommendation_confidence IN ('high','medium','low','blocked'));

-- menu_item_suggestions evidence
ALTER TABLE public.menu_item_suggestions
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_confidence text;

ALTER TABLE public.menu_item_suggestions
  DROP CONSTRAINT IF EXISTS menu_item_suggestions_recommendation_confidence_check;
ALTER TABLE public.menu_item_suggestions
  ADD CONSTRAINT menu_item_suggestions_recommendation_confidence_check
  CHECK (recommendation_confidence IS NULL OR recommendation_confidence IN ('high','medium','low','blocked'));

-- server_coaching evidence (manager-side metadata; server UI does not expose it)
ALTER TABLE public.server_coaching
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helpful indexes for provenance lookups
CREATE INDEX IF NOT EXISTS idx_shifts_source_hash ON public.shifts(source_row_hash) WHERE source_row_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_v2_source_hash ON public.shifts_v2(venue_id, imported_at) WHERE imported_at IS NOT NULL;
