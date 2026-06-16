
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'lls_v2\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon',  r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
  END LOOP;
END $$;
