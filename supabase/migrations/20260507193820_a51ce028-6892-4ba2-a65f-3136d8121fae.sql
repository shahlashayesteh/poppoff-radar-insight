DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_venue_join_code_trigger ON public.venues;
CREATE TRIGGER set_venue_join_code_trigger
BEFORE INSERT ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.set_venue_join_code();