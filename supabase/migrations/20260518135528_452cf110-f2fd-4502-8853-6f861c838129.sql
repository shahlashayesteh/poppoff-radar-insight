
ALTER TABLE public.server_category_stats
  ADD COLUMN IF NOT EXISTS opportunity_count numeric;

ALTER TABLE public.server_stats
  ADD COLUMN IF NOT EXISTS context jsonb;
