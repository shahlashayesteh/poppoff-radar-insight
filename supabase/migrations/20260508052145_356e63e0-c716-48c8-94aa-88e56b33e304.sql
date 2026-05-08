REVOKE EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_csv_upload(uuid, date, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.csv_number(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.csv_number(jsonb, text) TO authenticated;