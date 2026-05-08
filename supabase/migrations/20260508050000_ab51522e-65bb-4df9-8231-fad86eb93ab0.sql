REVOKE EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) TO authenticated;