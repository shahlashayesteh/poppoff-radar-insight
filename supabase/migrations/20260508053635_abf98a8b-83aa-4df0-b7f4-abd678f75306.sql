DROP POLICY IF EXISTS "Managers read venue member profiles" ON public.profiles;
CREATE POLICY "Managers read venue member profiles"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.venue_members vm
    JOIN public.venues v ON v.id = vm.venue_id
    WHERE vm.user_id = profiles.id
      AND v.manager_id = auth.uid()
  )
);