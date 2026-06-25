
-- Add missing INSERT/UPDATE/DELETE RLS policies for the v2 staging pipeline,
-- gated by is_venue_manager(venue_id). Fixes labour upload RLS rejection.

CREATE POLICY "v2 batches manager insert"
  ON public.shift_import_batches_v2 FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 batches manager delete"
  ON public.shift_import_batches_v2 FOR DELETE TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE POLICY "v2 staging rows manager insert"
  ON public.shift_staging_rows FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 staging rows manager update"
  ON public.shift_staging_rows FOR UPDATE TO authenticated
  USING (public.is_venue_manager(venue_id))
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 staging rows manager delete"
  ON public.shift_staging_rows FOR DELETE TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE POLICY "v2 sales staging manager insert"
  ON public.shift_sales_staging FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 sales staging manager update"
  ON public.shift_sales_staging FOR UPDATE TO authenticated
  USING (public.is_venue_manager(venue_id))
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 sales staging manager delete"
  ON public.shift_sales_staging FOR DELETE TO authenticated
  USING (public.is_venue_manager(venue_id));

CREATE POLICY "v2 labor staging manager insert"
  ON public.shift_labor_staging FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 labor staging manager update"
  ON public.shift_labor_staging FOR UPDATE TO authenticated
  USING (public.is_venue_manager(venue_id))
  WITH CHECK (public.is_venue_manager(venue_id));

CREATE POLICY "v2 labor staging manager delete"
  ON public.shift_labor_staging FOR DELETE TO authenticated
  USING (public.is_venue_manager(venue_id));
