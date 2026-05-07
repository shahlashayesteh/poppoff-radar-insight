ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
ALTER TABLE public.venues REPLICA IDENTITY FULL;