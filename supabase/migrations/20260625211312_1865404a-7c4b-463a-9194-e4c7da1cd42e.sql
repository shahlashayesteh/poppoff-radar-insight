ALTER TABLE public.shift_import_batches_v2
  ADD COLUMN IF NOT EXISTS batch_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.shift_import_batches_v2.batch_defaults IS
  'Manager-declared per-batch context defaults: { outlet, revenue_centre, sales_basis, labour_basis }. Used to suppress noisy "missing optional context" warnings and to stamp provenance on commit.';