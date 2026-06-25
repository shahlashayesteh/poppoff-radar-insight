
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_reliability_class_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_reliability_class_check
  CHECK (reliability_class IS NULL OR reliability_class IN ('measured','derived','estimated','contextual','untrusted'));

ALTER TABLE public.shifts_v2 DROP CONSTRAINT IF EXISTS shifts_v2_reliability_class_check;
ALTER TABLE public.shifts_v2
  ADD CONSTRAINT shifts_v2_reliability_class_check
  CHECK (reliability_class IS NULL OR reliability_class IN ('measured','derived','estimated','contextual','untrusted'));
