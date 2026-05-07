
-- Pin search_path on touch_updated_at and revoke public access on security-definer fns
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_unique_join_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_venue_join_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.join_venue_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_venue_with_code(text) TO authenticated;

REVOKE ALL ON FUNCTION public.regenerate_venue_join_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_venue_join_code(uuid) TO authenticated;
